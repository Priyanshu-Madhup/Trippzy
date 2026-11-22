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
    assert 600 <= crop.width <= 900 and 600 <= crop.height <= 900  # just the code (about 260px), enlarged 3x
    cx, cy = codes[0].center  # page coordinates, unaffected by the enlargement
    assert abs(cx - (x + 150)) < 20 and abs(cy - (y + 150)) < 20


def test_a_page_with_no_code_yields_nothing():
    page = Image.new("RGB", (1080, 1500), (235, 232, 224))
    buf = io.BytesIO()
    page.save(buf, "PNG")
    assert documents.find_codes(buf.getvalue(), "image/png") == []


def test_only_printed_code_lookalikes_survive_the_unreadable_filter():
    import numpy as np

    bc = zxingcpp.create_barcode("GOFLDNTAOGTG5009167|IX2464|BLR-IXR|10NOV2026|MR PRIYANSHU MADHUP|E1S7VL", zxingcpp.BarcodeFormat.PDF417)
    a = np.asarray(bc.to_image(scale=2))
    code = Image.fromarray(a if a.ndim == 2 else a[..., 0]).convert("RGB")
    assert documents._printed_code_like(code)
    assert not documents._printed_code_like(Image.new("RGB", (200, 60), "white"))  # blank
    assert not documents._printed_code_like(Image.new("RGB", (200, 60), (200, 40, 40)))  # a coloured banner
    noise = np.random.default_rng(0).integers(0, 255, (60, 200, 3), dtype=np.uint8)
    assert not documents._printed_code_like(Image.fromarray(noise))  # a coloured photo


def test_small_codes_are_enlarged_in_whole_steps():
    small = Image.new("RGB", (186, 45), "white")
    buf = io.BytesIO()
    small.save(buf, "PNG")
    out = Image.open(io.BytesIO(documents._sharpen_png(buf.getvalue())))
    assert out.width % 186 == 0 and 600 <= out.width <= 1200


def _page_with_barcodes(n: int) -> Image.Image:
    import numpy as np
    from PIL import ImageDraw

    page = Image.new("RGB", (1170, 1280), (236, 243, 252))
    draw = ImageDraw.Draw(page)
    for i in range(14):  # lines of "text": short dark runs that differ row to row, like real type
        y = 40 + i * 30
        for x in range(60, 700, 14):
            if (x * 7 + i * 13) % 5:
                draw.rectangle((x, y, x + 8, y + 12 + (x + i) % 5), fill=(30, 40, 60))
    for k in range(n):
        bc = zxingcpp.create_barcode(f"6E504324112{k}BOM1", zxingcpp.BarcodeFormat.Code128)
        a = np.asarray(bc.to_image(scale=3))
        code = Image.fromarray(a if a.ndim == 2 else a[..., 0]).convert("RGB")
        code = code.resize((240, 70), Image.NEAREST)
        page.paste(code, (880, 300 + k * 220))
    return page


def test_plain_barcodes_are_located_in_page_order():
    found = documents._linear_barcodes(_page_with_barcodes(2))
    assert len(found) == 2 and all(c.format == "barcode" and c.text == "" for c in found)
    assert found[0].center[1] < found[1].center[1]  # top to bottom
    assert abs(found[0].center[0] - 1000) < 30


def test_a_page_of_text_has_no_barcode():
    assert documents._linear_barcodes(_page_with_barcodes(0)) == []
