"""QR codes / barcodes cropped from uploaded tickets."""

import io

import numpy as np
import pymupdf as fitz
import pytest
import zxingcpp
from PIL import Image

from app.ai import documents
from app.services import trip_intel, worker
from app.services.resolvers import NONE_IMAGE
from app.services.worker import assign_codes
from tests.test_upload_worker import FLIGHT_JSON, OCR, _run_next_job, _trip, _upload

PAYLOAD = "M1KUMAR/A EQX7K2M BLRDXBEK 0569 285Y024A0001 100"


def code_image(text=PAYLOAD, fmt=zxingcpp.BarcodeFormat.QRCode, size=360) -> Image.Image:
    arr = np.array(zxingcpp.write_barcode_to_image(zxingcpp.create_barcode(text, fmt), scale=max(size // 40, 4)))
    return Image.fromarray(arr).convert("RGB")


def as_png(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


def ticket_photo(*codes: Image.Image) -> bytes:
    page = Image.new("RGB", (1200, 900), "white")
    for i, c in enumerate(codes):
        page.paste(c, (80 + i * 520, 200))
    return as_png(page)


def ticket_pdf(img: Image.Image) -> bytes:
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    page.insert_text((60, 80), "BOARDING PASS  EK 569  BLR to DXB")
    page.insert_image(fitz.Rect(60, 120, 260, 320), stream=as_png(img))
    return doc.tobytes()


def test_finds_a_qr_code_in_a_photo_and_crops_it_with_a_quiet_zone():
    [found] = documents.find_codes(ticket_photo(code_image()), "image/png")
    assert (found.format, found.text) == ("qr", PAYLOAD)
    crop = Image.open(io.BytesIO(found.png))
    assert crop.width == crop.height and crop.width < code_image().width  # tight: no more margin than a few pixels
    assert zxingcpp.read_barcodes(crop)[0].text == PAYLOAD  # the crop still scans


def test_finds_a_code_drawn_inside_a_pdf():
    [found] = documents.find_codes(ticket_pdf(code_image()), "application/pdf")
    assert found.format == "qr" and found.text == PAYLOAD and found.page == 1


@pytest.mark.parametrize(
    "fmt,name", [(zxingcpp.BarcodeFormat.PDF417, "pdf417"), (zxingcpp.BarcodeFormat.Aztec, "aztec"), (zxingcpp.BarcodeFormat.DataMatrix, "datamatrix")]
)
def test_other_boarding_pass_formats(fmt, name):
    [found] = documents.find_codes(ticket_photo(code_image(fmt=fmt, size=420)), "image/png")
    assert found.format == name and found.text == PAYLOAD


def striped_barcode(w=200, h=70) -> Image.Image:
    """Black-and-white bars far too fine to decode (about 1px per module), like a downsampled airline PDF417."""
    rng = np.random.default_rng(7)
    cols = (rng.random(w // 2) > 0.55).repeat(2)
    return Image.fromarray(np.tile(np.where(cols, 0, 255).astype("uint8"), (h, 1))).convert("RGB")


def pdf_with_image(img: Image.Image, rect=(60, 120, 260, 190)) -> bytes:
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    page.insert_text((60, 80), "E-TICKET  BLR to IXR")
    page.insert_image(fitz.Rect(*rect), stream=as_png(img))
    return doc.tobytes()


def test_a_barcode_image_too_blurry_to_decode_is_still_shown():
    [found] = documents.find_codes(pdf_with_image(striped_barcode()), "application/pdf")
    assert found.format == "barcode" and found.text == "" and found.page == 1
    crop = Image.open(io.BytesIO(found.png))
    assert crop.width >= 600  # enlarged in whole steps so the bars stay sharp
    assert crop.width < 900 and np.asarray(crop.convert("L"))[:, :6].min() > 200  # no wide white border


def test_logos_and_photos_are_not_mistaken_for_barcodes():
    logo = Image.new("RGB", (200, 70), (230, 90, 40))  # flat colour
    gradient = Image.fromarray(np.tile(np.linspace(0, 255, 200).astype("uint8"), (70, 1))).convert("RGB")  # grey tones
    for img in (logo, gradient):
        assert documents.find_codes(pdf_with_image(img), "application/pdf") == []


def test_a_small_printed_barcode_is_decoded_not_duplicated_as_an_image():
    small = code_image("SMALL-QR-1", fmt=zxingcpp.BarcodeFormat.PDF417, size=300)
    found = documents.find_codes(pdf_with_image(small, rect=(60, 120, 170, 150)), "application/pdf")
    assert [(f.format, f.text) for f in found] == [("pdf417", "SMALL-QR-1")]  # one entry: decoded wins over the raw image


def test_two_codes_and_duplicates():
    out = documents.find_codes(ticket_photo(code_image("AAA111"), code_image("BBB222")), "image/png")
    assert sorted(c.text for c in out) == ["AAA111", "BBB222"]
    assert len(documents.find_codes(ticket_photo(code_image("SAME"), code_image("SAME")), "image/png")) == 1


def test_no_code_or_garbage_gives_nothing_and_never_raises():
    assert documents.find_codes(ticket_photo(), "image/png") == []
    assert documents.find_codes(b"not a pdf", "application/pdf") == []


def test_assigning_codes_to_tickets():
    class C:
        def __init__(self, t):
            self.format, self.text = "qr", t

    one, two = C("a"), C("b")
    assert assign_codes([], 2) == [None, None]
    assert [r["text"] for r in assign_codes([one, two], 2)] == ["a", "b"]  # one per journey
    assert [r["index"] for r in assign_codes([one], 2)] == [0, 0]  # a shared code
    assert [r and r["text"] for r in assign_codes([one, two], 1)] == ["a"]
    assert [r and r["text"] for r in assign_codes([one, two, C("c")], 2)] == ["a", None]  # ambiguous: primary only


@pytest.fixture(autouse=True)
def _offline(monkeypatch):
    async def no_visuals(settings, ext):
        return {}

    async def no_image(*a, **k):
        return NONE_IMAGE

    monkeypatch.setattr(worker, "resolve_ticket_visuals", no_visuals)
    monkeypatch.setattr(trip_intel, "resolve_cover", no_image)


async def test_worker_stores_the_code_and_the_api_serves_it_privately(client, ctx, auth):
    ctx.ai.ocr_text, ctx.ai.extraction = OCR, FLIGHT_JSON
    a = auth()
    trip_id = await _trip(client, a)
    tid, _ = await _upload(client, ctx, a, trip_id, ticket_photo(code_image()))
    await client.post(f"/v1/tickets/{tid}/upload-complete", headers=a)
    await _run_next_job(ctx)

    t = (await client.get(f"/v1/tickets/{tid}", headers=a)).json()
    assert t["has_code"] is True and t["code_format"] == "qr"
    assert "code" not in t and PAYLOAD not in str(t)  # neither the storage key nor the payload is in the ticket

    r = (await client.get(f"/v1/tickets/{tid}/code", headers=a)).json()
    assert r["format"] == "qr" and "/codes/1.png" in r["url"]
    assert any(k.endswith("/codes/1.png") for k in ctx.storage.objects)
    assert (await client.get(f"/v1/tickets/{tid}/code", headers=auth("user_B"))).status_code == 404


async def test_a_ticket_without_a_code_has_none(client, ctx, auth):
    ctx.ai.ocr_text, ctx.ai.extraction = OCR, FLIGHT_JSON
    a = auth()
    trip_id = await _trip(client, a)
    tid, _ = await _upload(client, ctx, a, trip_id, ticket_photo())
    await client.post(f"/v1/tickets/{tid}/upload-complete", headers=a)
    await _run_next_job(ctx)
    t = (await client.get(f"/v1/tickets/{tid}", headers=a)).json()
    assert t["has_code"] is False and t["code_format"] is None
    assert (await client.get(f"/v1/tickets/{tid}/code", headers=a)).status_code == 404
