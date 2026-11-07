"""Regression tests for the weaknesses found in Trippy's normaliser, plus core behaviour."""

import pytest

from app.ai.normalize import (
    Grounder,
    airport_timezone,
    build_extraction,
    coerce_details,
    norm_date,
    norm_time,
    parse_amount,
)

SOURCE = """AIR INDIA  Booking confirmed. Flight AI 502  BLR to DEL  12 Oct 2026  Departs 06:15  Terminal 2
Passenger: A KUMAR   Fare 4,500 INR   Reference 77281AB   Seat 14C"""


def _flight_raw(**over):
    seg = {
        "flight_number": "AI502",
        "departure": {"airport_code": "BLR", "city": "Bengaluru", "date": "2026-10-12", "time": "06:15"},
        "arrival": {"airport_code": "DEL", "city": "Delhi", "date": "2026-10-12", "time": "09:00"},
        "seat": "14C",
    }
    raw = {
        "confidence": 0.95,
        "title": "Bengaluru → Delhi",
        "primary_location": {"city": "Delhi", "country": "India", "country_code": "IN"},
        "start_date": "2026-10-12",
        "details": {"airline": {"name": "Air India", "iata_code": "AI"}, "segments": [seg], "pnr": "ABC123"},
    }
    raw.update(over)
    return raw


class TestGrounding:
    def test_short_id_must_be_a_whole_token(self):
        g = Grounder(SOURCE)
        # "1A" only occurs inside "77281AB": Trippy's substring check wrongly accepted it.
        assert g.id("1A", "seat") is None
        assert g.id("14C", "seat") == "14C"
        assert "seat" in g.dropped

    def test_seat_printed_with_a_gap_is_still_found(self):
        assert Grounder("Seat 24 A  Coach S5").id("24A", "seat") == "24A"

    def test_long_id_matches_ignoring_punctuation(self):
        assert Grounder(SOURCE).id("AI-502", "flight_number") == "AI-502"

    def test_hallucinated_pnr_is_dropped_and_penalised(self):
        ext = build_extraction("flight", _flight_raw(), SOURCE, 1.0)
        assert ext.details.pnr is None
        assert "pnr" in ext.ungrounded_fields
        assert ext.confidence < 0.95

    @pytest.mark.parametrize(
        ("text", "expected"),
        [
            ("IRCTC E-TICKET  PNR STATUS: CNF", None),  # an all-caps word is not a PNR
            ("PNR: DYQBNK", "DYQBNK"),
            ("pnr no. 4521896307", "4521896307"),
            ("PNR NUMBER: A1B2C3", "A1B2C3"),
            ("Booking details PNR: Status", None),
        ],
    )
    def test_labelled_pnr_fallback(self, text, expected):
        assert Grounder(text).labelled("PNR") == expected

    def test_address_needs_most_words_in_source(self):
        g = Grounder("Hotel at 12 Rue de Rivoli Paris France")
        assert g.text("12 Rue de Rivoli, Paris", "a") is not None
        assert g.text("77 Totally Different Boulevard, Lyon", "a") is None


class TestParsing:
    @pytest.mark.parametrize(
        ("raw", "expected"),
        [
            ("1,234.50", 1234.5),
            ("1.234,50", 1234.5),
            ("₹4,500", 4500.0),
            ("12,5", 12.5),
            ("1 234,5", 1234.5),
            ("1,234", 1234.0),
            (4500, 4500.0),
            ("n/a", None),
            ("", None),
        ],
    )
    def test_amounts_are_locale_aware(self, raw, expected):
        assert parse_amount(raw) == expected

    def test_dates_and_times(self):
        assert norm_date("2026-1-5") == "2026-01-05"
        assert norm_date("12/10/2026") is None  # ambiguous: never guess
        assert norm_date("2026-02-30") is None
        assert norm_date("1999-01-01") is None
        assert norm_time("6:15 pm") == "18:15"
        assert norm_time("12:05 am") == "00:05"
        assert norm_time("25:00") is None

    def test_details_returned_as_a_list_are_merged(self):
        raw = {"details": [{"segments": [{"departure": {}}], "pnr": "X1Y2Z3"}, {"segments": [{"departure": {}}], "pnr": None}]}
        d = coerce_details("flight", raw)
        assert len(d["segments"]) == 2
        assert d["pnr"] == "X1Y2Z3"


class TestFlightTimes:
    def test_airport_timezone_lookup(self):
        assert airport_timezone("BLR") == "Asia/Kolkata"
        assert airport_timezone("ZZZ") is None

    def test_international_duration_uses_time_zones(self):
        # BLR 02:00 (UTC+5:30) → DXB 04:30 (UTC+4) is 4h, not the 2h30 a local-time subtraction gives.
        raw = _flight_raw()
        raw["details"]["segments"][0].update(
            departure={"airport_code": "BLR", "date": "2026-10-12", "time": "02:00"},
            arrival={"airport_code": "DXB", "date": "2026-10-12", "time": "04:30"},
            flight_number="AI502",
        )
        ext = build_extraction("flight", raw, SOURCE, 1.0)
        seg = ext.details.segments[0]
        assert seg.departure.timezone == "Asia/Kolkata"
        assert seg.arrival.timezone == "Asia/Dubai"
        assert seg.duration_minutes == 240

    def test_duration_is_none_without_airport_codes(self):
        raw = _flight_raw()
        raw["details"]["segments"][0]["departure"].pop("airport_code")
        assert build_extraction("flight", raw, SOURCE, 1.0).details.segments[0].duration_minutes is None
