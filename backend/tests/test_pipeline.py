import pytest

from app.ai.client import Budget, Usage, parse_json_object
from app.ai.documents import sniff_mime
from app.ai.pipeline import assert_readable, quick_classify, run_extraction
from app.core.errors import AppError

FLIGHT_TEXT = """EMIRATES e-ticket  PNR: QX7K2M  Flight EK 569  Boarding 03:30 Terminal 2
Bengaluru (BLR) to Dubai (DXB) 12 Oct 2026 airport check-in baggage 30kg Passenger: A KUMAR"""
HOTEL_TEXT = """Grand Hotel booking. Check-in 14 Oct 2026, check-out 16 Oct 2026. Room: Deluxe. 2 nights, 2 guests.
Airport transfer available from Terminal 1."""


def test_quick_classify_flight_and_hotel():
    assert quick_classify(FLIGHT_TEXT) == ("flight", 0.9)
    assert quick_classify(HOTEL_TEXT) == ("hotel", 0.9)


def test_dates_alone_do_not_look_like_flight_numbers():
    # Trippy's pattern counted "10 2026" as a flight code; a bare date must not.
    assert quick_classify("Invoice 12 2026 receipt 10 2026 order 45 2025") is None


def test_ambiguous_text_defers_to_the_model():
    assert quick_classify("Thank you for your purchase.") is None


def test_assert_readable():
    assert_readable("A proper readable ticket text")
    with pytest.raises(AppError):
        assert_readable("NO_TEXT_FOUND")
    with pytest.raises(AppError):
        assert_readable("[illegible] [illegible]")


def test_sniff_mime_trusts_bytes():
    assert sniff_mime(b"%PDF-1.7 ....") == "application/pdf"
    assert sniff_mime(b"\x89PNG\r\n\x1a\n....") == "image/png"
    assert sniff_mime(b"\xff\xd8\xff\xe0....") == "image/jpeg"
    assert sniff_mime(b"RIFF\x00\x00\x00\x00WEBPVP8 ") == "image/webp"
    assert sniff_mime(b"MZ\x90\x00 an exe") is None


def test_parse_json_object_salvages_fences_and_padding():
    assert parse_json_object('```json\n{"a": 1}\n```') == {"a": 1}
    assert parse_json_object('Sure! {"a": {"b": 2}} hope that helps') == {"a": {"b": 2}}
    with pytest.raises(AppError):
        parse_json_object("no json here")


class FakeAI:
    class settings:  # noqa: N801
        openrouter_fallback_model = ""

    def __init__(self, extraction: dict):
        self.extraction, self.calls = extraction, []

    async def structured(self, *, schema_name, **_):
        self.calls.append(schema_name)
        return self.extraction

    async def vision_transcribe(self, images, prompt, usage, budget):
        return FLIGHT_TEXT


FLIGHT_JSON = {
    "confidence": 0.93,
    "title": "Bengaluru → Dubai",
    "primary_location": {"city": "Dubai", "country": "UAE", "country_code": "AE"},
    "details": {
        "airline": {"name": "Emirates", "iata_code": "EK"},
        "pnr": "QX7K2M",
        "segments": [
            {
                "flight_number": "EK569",
                "departure": {"airport_code": "BLR", "date": "2026-10-12", "time": "04:15"},
                "arrival": {"airport_code": "DXB", "date": "2026-10-12", "time": "06:30"},
                "seat": None,
            }
        ],
    },
}


async def test_text_pipeline_skips_the_classification_call_for_obvious_documents():
    ai = FakeAI(FLIGHT_JSON)
    ext, raw, vision = await run_extraction(ai, text=FLIGHT_TEXT, images=None, file_name="t.pdf", usage=Usage(), budget=Budget(30))
    assert ai.calls == ["flight_extraction"]  # no classify call
    assert ext.document_type == "flight" and ext.details.pnr == "QX7K2M" and not vision


async def test_image_pipeline_uses_vision_then_extracts():
    ai = FakeAI(FLIGHT_JSON)
    ext, raw, vision = await run_extraction(ai, text=None, images=["data:image/jpeg;base64,AAAA"], file_name="t.jpg", usage=Usage(), budget=Budget(30))
    assert vision and "PNR" in raw and ext.document_type == "flight"


async def test_unreadable_document_is_rejected_before_any_ai_call():
    ai = FakeAI(FLIGHT_JSON)
    with pytest.raises(AppError) as e:
        await run_extraction(ai, text="  ", images=None, file_name="x", usage=Usage(), budget=Budget(30))
    assert e.value.code == "unreadable" and ai.calls == []
