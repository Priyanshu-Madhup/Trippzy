import io

import zxingcpp
from PIL import Image, ImageFilter

from app.ai import documents


def _qr(text: str, size: int) -> Image.Image:
    bc = zxingcpp.create_barcode(text, zxingcpp.BarcodeFormat.QRCode)
    img = zxingcpp.write_barcode_to_image(bc, scale=4) if hasattr(zxingcpp, "write_barcode_to_image") else bc.to_image(scale=4)
    return Image.fromarray(__import__("numpy").asarray(img)).convert("RGB").resize((size, size), Image.LANCZOS)


def _ticket_photo(code_px: int, blur: float = 0.0) -> bytes:
    page = Image.new("RGB", (1080, 1500), (235, 232, 224))
    page.paste(_qr("IX2464-E1S7VL-31C", code_px), (300, 900))
    if blur:
        page = page.filter(ImageFilter.GaussianBlur(blur))
    buf = io.BytesIO()
    page.save(buf, "JPEG", quality=70)
    return buf.getvalue()


def test_finds_a_normal_qr_in_a_screenshot():
    assert [c.text for c in documents.find_codes(_ticket_photo(300), "image/jpeg")] == ["IX2464-E1S7VL-31C"]


def test_finds_a_small_soft_qr_in_a_photo():
    # a single pass at the photo's own size misses this one; the multi-pass scan reads it
    img = Image.open(io.BytesIO(_ticket_photo(80, blur=1.0))).convert("RGB")
    assert documents._scan(img, 1) == []
    codes = documents.find_codes(_ticket_photo(80, blur=1.0), "image/jpeg")
    assert [c.text for c in codes] == ["IX2464-E1S7VL-31C"]


def _dummy_qr_page() -> tuple[bytes, tuple[int, int]]:
    """A QR with its three finder squares but a scrambled body: a mock-up that no scanner can read."""
    import numpy as np

    bc = zxingcpp.create_barcode("DUMMY-TICKET-1234567890", zxingcpp.BarcodeFormat.QRCode)
    a = np.asarray(bc.to_image(scale=6))
    a = (a if a.ndim == 2 else a[..., 0]).copy()
    h, w = a.shape
    rng = np.random.default_rng(1)
    for y in range(0, h, 6):
        for x in range(0, w, 6):
            if (y < 72 and x < 72) or (y < 72 and x > w - 72) or (y > h - 72 and x < 72):
                continue
            if rng.random() < 0.45:
                a[y : y + 6, x : x + 6] = 255 - a[y : y + 6, x : x + 6]
    page = Image.new("RGB", (1080, 1500), (235, 232, 224))
    page.paste(Image.fromarray(a).convert("RGB").resize((300, 300)), (300, 900))
    buf = io.BytesIO()
    page.save(buf, "PNG")
    return buf.getvalue(), (300, 900)


def test_an_unreadable_qr_is_still_cropped_for_the_card():
    data, (x, y) = _dummy_qr_page()
    codes = documents.find_codes(data, "image/png")
    assert len(codes) == 1 and codes[0].text == "" and codes[0].format == "qr"
    crop = Image.open(io.BytesIO(codes[0].png))
    assert 220 <= crop.width <= 300 and 220 <= crop.height <= 300  # the code, not the whole page
    cx, cy = codes[0].center
    assert abs(cx - (x + 150)) < 20 and abs(cy - (y + 150)) < 20


def test_a_page_with_no_code_yields_nothing():
    page = Image.new("RGB", (1080, 1500), (235, 232, 224))
    buf = io.BytesIO()
    page.save(buf, "PNG")
    assert documents.find_codes(buf.getvalue(), "image/png") == []
