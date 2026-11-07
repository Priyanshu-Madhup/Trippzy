"""Document handling: type sniffing, PDF text, page rendering, image preparation."""

import base64
import io

import pymupdf as fitz  # PyMuPDF
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
