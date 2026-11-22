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
