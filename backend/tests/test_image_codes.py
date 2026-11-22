import io

import numpy as np
import zxingcpp
from PIL import Image, ImageFilter

from app.ai import documents


def _qr(text: str, size: int) -> Image.Image:
    bc = zxingcpp.create_barcode(text, zxingcpp.BarcodeFormat.QRCode)
    img = bc.to_image(scale=4)
    return Image.fromarray(np.asarray(img)).convert("RGB").resize((size, size), Image.LANCZOS)


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


def test_a_picture_with_no_code_yields_nothing():
    buf = io.BytesIO()
    Image.new("RGB", (1080, 1500), (235, 232, 224)).save(buf, "PNG")
    assert documents.find_codes(buf.getvalue(), "image/png") == []


def test_a_transparent_png_is_not_turned_black():
    ticket = Image.new("RGBA", (1080, 1500), (0, 0, 0, 0))  # a ticket exported with a see-through background
    ticket.paste(_qr("IX2464-E1S7VL-31C", 300).convert("RGBA"), (300, 900))
    buf = io.BytesIO()
    ticket.save(buf, "PNG")
    assert documents._open_flat(buf.getvalue()).getpixel((5, 5)) == (255, 255, 255)
    assert [c.text for c in documents.find_codes(buf.getvalue(), "image/png")] == ["IX2464-E1S7VL-31C"]
