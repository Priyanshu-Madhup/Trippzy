"""Document handling: type sniffing, PDF text, page rendering, image preparation."""

import base64
import hashlib
import io
from dataclasses import dataclass

import numpy as np
import pymupdf as fitz  # PyMuPDF
import zxingcpp
from PIL import Image, ImageOps

ALLOWED_MIME = {"application/pdf", "image/png", "image/jpeg", "image/webp"}


def sniff_mime(head: bytes) -> str | None:
    """Trust the bytes, not the client-declared content type."""
    if head.startswith(b"%PDF"):
        return "application/pdf"
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if head.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "image/webp"
    return None


def pdf_text(data: bytes, max_pages: int = 8) -> tuple[str, int]:
    """Text of the first pages, keeping line structure. Returns (text, page_count)."""
    doc = fitz.open(stream=data, filetype="pdf")
    try:
        if doc.needs_pass:
            raise ValueError("password protected")
        pages = []
        for i in range(min(doc.page_count, max_pages)):
            pages.append(doc[i].get_text("text").strip())
        text = "\n\n— page break —\n\n".join(pages)
        return text.strip(), doc.page_count
    finally:
        doc.close()


def render_pdf_pages(data: bytes, max_pages: int = 8, width: int = 1400) -> list[bytes]:
    """PNG-quality WebP page images for the in-app viewer (like Trippy's pdf.js viewer)."""
    doc = fitz.open(stream=data, filetype="pdf")
    out: list[bytes] = []
    try:
        for i in range(min(doc.page_count, max_pages)):
            page = doc[i]
            zoom = min(3.0, width / max(page.rect.width, 1))
            pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
            img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
            buf = io.BytesIO()
            img.save(buf, "WEBP", quality=82, method=4)
            out.append(buf.getvalue())
        return out
    finally:
        doc.close()


def image_to_data_url(data: bytes, max_dim: int = 1600, quality: int = 85) -> str:
    """Downscaled JPEG data URL sized for the vision model."""
    img = ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert("RGB")
    img.thumbnail((max_dim, max_dim))
    for q, dim in ((quality, max_dim), (75, int(max_dim * 0.8)), (65, 1000)):
        work = img.copy()
        work.thumbnail((dim, dim))
        buf = io.BytesIO()
        work.save(buf, "JPEG", quality=q)
        if buf.tell() < 3_000_000:
            break
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


def pdf_pages_as_data_urls(data: bytes, max_pages: int = 2) -> list[str]:
    """Scanned PDFs (no text layer) fall back to vision on the first pages."""
    return [
        "data:image/jpeg;base64," + base64.b64encode(_to_jpeg(Image.open(io.BytesIO(p)))).decode()
        for p in render_pdf_pages(data, max_pages=max_pages, width=1500)
    ]


def _to_jpeg(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.convert("RGB").save(buf, "JPEG", quality=82)
    return buf.getvalue()


# ─── QR codes / barcodes ────────────────────────────────────────────
# The codes a gate or conductor scans. Linear formats other than Code128 are left out: they produce
# false positives on ordinary printed text and are not used on travel documents.
CODE_FORMATS = [
    zxingcpp.BarcodeFormat.QRCode,
    zxingcpp.BarcodeFormat.MicroQRCode,
    zxingcpp.BarcodeFormat.PDF417,
    zxingcpp.BarcodeFormat.Aztec,
    zxingcpp.BarcodeFormat.DataMatrix,
    zxingcpp.BarcodeFormat.Code128,
]
MIN_CODE_PX = 70  # a code smaller than this (at scan resolution) is a logo or decoration, not a scannable pass
MAX_CODES = 6


@dataclass
class FoundCode:
    format: str  # "qr" | "pdf417" | "aztec" | "datamatrix" | "code128" | "barcode" (seen but too low-res to decode)
    text: str  # decoded payload; "" for an undecodable "barcode"
    png: bytes  # the code cropped from the page, with a quiet zone, trimmed tight, ready to show as-is
    page: int
    area: int  # pixels² on the page; larger = more likely the primary boarding code
    center: tuple[float, float] | None = None  # page coordinates in points (PDFs), to match against embedded images


_BF = zxingcpp.BarcodeFormat
_FORMAT_NAMES = {_BF.QRCode: "qr", _BF.MicroQRCode: "qr", _BF.PDF417: "pdf417", _BF.Aztec: "aztec", _BF.DataMatrix: "datamatrix", _BF.Code128: "code128"}
SCAN_ZOOM = 4.0  # small boarding-pass barcodes (≈55pt wide) only decode at ≥4×; 3× misses them
RETRY_ZOOM = 6.0  # second chance for the first pages when nothing was found
RETRY_PAGES = 3


def _png(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.convert("RGB").save(buf, "PNG", optimize=True)
    return buf.getvalue()


def _crop_code(img: Image.Image, bc) -> tuple[bytes, int, tuple[float, float]] | None:
    pos = bc.position
    xs, ys = [pos.top_left.x, pos.top_right.x, pos.bottom_left.x, pos.bottom_right.x], [pos.top_left.y, pos.top_right.y, pos.bottom_left.y, pos.bottom_right.y]
    w, h = max(xs) - min(xs), max(ys) - min(ys)
    if max(w, h) < MIN_CODE_PX:
        return None
    pad = max(int(max(w, h) * 0.03), 4)  # just enough white that edge bars aren't clipped; the card supplies the rest
    box = (max(min(xs) - pad, 0), max(min(ys) - pad, 0), min(max(xs) + pad, img.width), min(max(ys) + pad, img.height))
    return _png(img.crop(box)), w * h, ((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2)


def _scan(img: Image.Image, page: int, zoom: float = 1.0) -> list[FoundCode]:
    out = []
    for bc in zxingcpp.read_barcodes(img, formats=CODE_FORMATS, try_rotate=True):
        name = _FORMAT_NAMES.get(bc.format)
        if not name or not bc.valid or not bc.text:
            continue
        cropped = _crop_code(img, bc)
        if cropped:
            out.append(FoundCode(name, bc.text, cropped[0], page, cropped[1], (cropped[2][0] / zoom, cropped[2][1] / zoom)))
    return out


def _runs(line: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Run-length encode a boolean row: (start index, length, value) of each run."""
    edges = np.flatnonzero(line[1:] != line[:-1]) + 1
    starts = np.concatenate(([0], edges))
    lengths = np.diff(np.concatenate((starts, [line.size])))
    return starts, lengths, line[starts]


def _finder_hits(dark: np.ndarray, step: int = 2) -> list[tuple[float, float, float]]:
    """Centres (x, y, module size) where a row crosses a QR finder square: dark-light-dark-light-dark in 1:1:3:1:1."""
    hits = []
    for y in range(0, dark.shape[0], step):
        starts, lengths, vals = _runs(dark[y])
        for i in range(len(lengths) - 4):
            if not vals[i]:
                continue
            a, b, c, d, e = (int(v) for v in lengths[i : i + 5])
            m = (a + b + c + d + e) / 7
            if m < 2 or max(abs(a - m), abs(b - m), abs(d - m), abs(e - m)) > 0.6 * m or abs(c - 3 * m) > 1.2 * m:
                continue
            hits.append((starts[i] + (a + b + c + d + e) / 2, float(y), m))
    return hits


def _qr_like(img: Image.Image) -> list[FoundCode]:
    """A QR code the decoder can't read (a mock-up, a sample ticket, a damaged print) still has its three finder
    squares. Find them and crop the code so the card can show it, with no payload."""
    scale = 1.0
    if max(img.size) > 1800:
        scale = 1800 / max(img.size)
        img = img.resize((int(img.width * scale), int(img.height * scale)), Image.LANCZOS)
    g = np.asarray(img.convert("L"), dtype=np.uint8)
    for dark in (g < int(g.mean()), g > int(g.mean())):  # dark-on-light, then the inverted look
        rows = _finder_hits(dark)
        cols = [(y, x, m) for (x, y, m) in _finder_hits(np.ascontiguousarray(dark.T))]
        # a finder square shows up in both directions, at about the same place
        both = [(x, y, m) for (x, y, m) in rows if any(abs(cx - x) < 2 * m and abs(cy - y) < 2 * m and 0.6 < cm / m < 1.6 for cx, cy, cm in cols)]
        centres: list[list[float]] = []
        for x, y, m in both:
            for c in centres:
                if abs(c[0] / c[3] - x) < 2.5 * m and abs(c[1] / c[3] - y) < 2.5 * m:
                    c[0] += x
                    c[1] += y
                    c[2] += m
                    c[3] += 1
                    break
            else:
                centres.append([x, y, m, 1])
        pts = [(c[0] / c[3], c[1] / c[3], c[2] / c[3]) for c in centres]
        best = None
        for i, (x1, y1, m1) in enumerate(pts):  # corner point + two equal perpendicular legs
            for j, (x2, y2, _) in enumerate(pts):
                for k, (x3, y3, _) in enumerate(pts):
                    if j >= k or i in (j, k):
                        continue
                    v1, v2 = (x2 - x1, y2 - y1), (x3 - x1, y3 - y1)
                    l1, l2 = float(np.hypot(*v1)), float(np.hypot(*v2))
                    if not (12 * m1 <= l1 <= 90 * m1 and 0.85 <= l1 / max(l2, 1e-6) <= 1.18):
                        continue
                    if abs(v1[0] * v2[0] + v1[1] * v2[1]) / (l1 * l2) > 0.2:  # not ~90°
                        continue
                    if best is None or l1 > best[0]:
                        best = (l1, [(x1, y1), (x2, y2), (x3, y3)], m1)
        if best:
            _, tri, m = best
            xs = [p[0] for p in tri] + [tri[1][0] + tri[2][0] - tri[0][0]]
            ys = [p[1] for p in tri] + [tri[1][1] + tri[2][1] - tri[0][1]]
            pad = 3.5 * m + max(int(m * 2), 4)  # finder centre to code edge, plus a little quiet zone
            box = (int(max(min(xs) - pad, 0)), int(max(min(ys) - pad, 0)), int(min(max(xs) + pad, img.width)), int(min(max(ys) + pad, img.height)))
            if min(box[2] - box[0], box[3] - box[1]) >= MIN_CODE_PX // 2:
                crop = img.crop(box)
                return [FoundCode("qr", "", _png(crop), 1, crop.width * crop.height, ((box[0] + box[2]) / 2 / scale, (box[1] + box[3]) / 2 / scale))]
    return []


def _scan_image(img: Image.Image) -> list[FoundCode]:
    """A photo or screenshot of a ticket: try the picture as it is, then the variants a decoder needs when the code is
    small, soft, huge or low-contrast. The first pass that finds a code wins."""
    w, h = img.size
    variants: list[Image.Image] = [img]
    if max(w, h) > 2200:
        k = 2000 / max(w, h)
        variants.append(img.resize((int(w * k), int(h * k)), Image.LANCZOS))
    if max(w, h) < 1600:
        variants.append(img.resize((w * 2, h * 2), Image.LANCZOS))
    gray = ImageOps.autocontrast(img.convert("L"), cutoff=2).convert("RGB")
    variants.append(gray)
    if max(w, h) < 1600:
        variants.append(gray.resize((w * 2, h * 2), Image.LANCZOS))
    for v in variants:
        zoom = v.width / w
        if found := _scan(v, 1, zoom):
            return found
    return _qr_like(img)


def _looks_like_barcode(img: Image.Image) -> bool:
    """Structure test for a barcode raster too small/aliased to decode: pure black-and-white, no colour,
    many bar transitions along a row (or a column, when rotated), and a barcode-like share of ink.
    Logos, photos, icons and scans fail it: they are coloured, grey-toned, mostly dark or mostly flat."""
    w, h = img.size
    if not (60 <= max(w, h) <= 1400 and min(w, h) >= 20 and max(w, h) / min(w, h) <= 10):
        return False
    rgb = np.asarray(img.convert("RGB"), dtype=np.int16)
    if (rgb.max(2) - rgb.min(2)).mean() > 8:  # coloured
        return False
    g = rgb.mean(2)
    if ((g < 40) | (g > 215)).mean() < 0.97:  # not strictly black and white
        return False
    dark = g < 128
    if not 0.08 <= dark.mean() <= 0.7:
        return False
    along_rows = (dark[:, 1:] != dark[:, :-1]).sum(1).mean()
    along_cols = (dark[1:, :] != dark[:-1, :]).sum(0).mean()
    return max(along_rows, along_cols) >= 15


def _embedded_barcodes(doc, page, page_no: int, decoded: list[FoundCode]) -> list[FoundCode]:
    """Barcode-looking images embedded in the page that the decoder could not read. Shown as-is so the
    card still has the code the user needs to scan, even when we can't read its contents."""
    out = []
    for info in page.get_image_info(xrefs=True):
        xref, (x0, y0, x1, y1) = info.get("xref"), info["bbox"]
        if not xref or any(c.center and x0 - 4 <= c.center[0] <= x1 + 4 and y0 - 4 <= c.center[1] <= y1 + 4 for c in decoded):
            continue  # already found by decoding
        try:
            pm = fitz.Pixmap(doc, xref)
            if pm.n > 3 or pm.alpha:
                pm = fitz.Pixmap(fitz.csRGB, pm)
            img = Image.frombytes("RGB" if pm.n == 3 else "L", (pm.width, pm.height), pm.samples).convert("RGB")
        except Exception:
            continue
        if not _looks_like_barcode(img):
            continue
        ink = np.argwhere(np.asarray(img.convert("L")) < 128)  # trim the image's own white border
        (top, left), (bottom, right) = ink.min(0), ink.max(0) + 1
        img = img.crop((left, top, right, bottom))
        pad = max(int(max(img.size) * 0.03), 2)
        framed = Image.new("RGB", (img.width + 2 * pad, img.height + 2 * pad), "white")
        framed.paste(img, (pad, pad))
        k = max(1, -(-700 // framed.width))  # whole-number upscale keeps the bars sharp
        framed = framed.resize((framed.width * k, framed.height * k), Image.NEAREST)
        out.append(FoundCode("barcode", "", _png(framed), page_no, img.width * img.height, ((x0 + x1) / 2, (y0 + y1) / 2)))
    return out


def _pdf_page_image(page, zoom: float) -> Image.Image:
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
    return Image.frombytes("RGB", (pix.width, pix.height), pix.samples)


def find_codes(data: bytes, mime: str, max_pages: int = 8) -> list[FoundCode]:
    """Every scannable code in the document, in page order, de-duplicated.
    Decoded codes come first on each page; barcode-looking images that couldn't be decoded follow.
    Never raises: a document with no readable code simply yields none."""
    try:
        if mime == "application/pdf":
            doc = fitz.open(stream=data, filetype="pdf")
            try:
                found: list[FoundCode] = []
                for i in range(min(doc.page_count, max_pages)):
                    page = doc[i]
                    on_page = _scan(_pdf_page_image(page, SCAN_ZOOM), i + 1, SCAN_ZOOM)
                    if not on_page and i < RETRY_PAGES:
                        on_page = _scan(_pdf_page_image(page, RETRY_ZOOM), i + 1, RETRY_ZOOM)
                    found += on_page + _embedded_barcodes(doc, page, i + 1, on_page)
            finally:
                doc.close()
        else:
            found = _scan_image(ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert("RGB"))
    except Exception:
        return []
    seen: set[str] = set()
    unique = [c for c in found if not ((key := c.text or hashlib.sha1(c.png).hexdigest()) in seen or seen.add(key))]
    return unique[:MAX_CODES]
