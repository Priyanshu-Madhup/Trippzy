from app.ai.normalize import build_extraction
from app.services.journeys import derive_columns, flight_journey, split_extraction


def _seg(frm, to, d1, t1, d2, t2, fn):
    return {
        "flight_number": fn,
        "departure": {"airport_code": frm, "city": frm, "date": d1, "time": t1},
        "arrival": {"airport_code": to, "city": to, "date": d2, "time": t2},
    }


def _ext(segments, source="PNR: ABC123 flight"):
    raw = {
        "confidence": 0.9,
        "title": None,
        "primary_location": {"city": "London"},
        "details": {"airline": {"name": "Emirates", "iata_code": "EK"}, "segments": segments, "pnr": "ABC123"},
    }
    return build_extraction("flight", raw, source, 1.0)


def test_one_way_with_layover_stays_one_journey():
    segs = [_seg("BLR", "DXB", "2026-10-12", "04:15", "2026-10-12", "06:30", "EK569"), _seg("DXB", "LHR", "2026-10-12", "09:00", "2026-10-12", "13:30", "EK1")]
    j = flight_journey([s for s in _ext(segs).details.model_dump()["segments"]])
    assert j and j["inbound"] == [] and j["stops"] == ["DXB"]


def test_round_trip_splits_at_the_longest_gap():
    segs = [_seg("BLR", "LHR", "2026-10-12", "04:15", "2026-10-12", "13:30", "A1"), _seg("LHR", "BLR", "2026-10-19", "10:00", "2026-10-20", "00:30", "A2")]
    parts = split_extraction(_ext(segs))
    assert [p.leg for p in parts] == ["outbound", "return"]
    assert parts[0].title == "BLR → LHR" and parts[1].title == "LHR → BLR"
    assert parts[1].primary_location.country_code is None  # only the outbound carries it


def test_columns_derived_from_the_outbound_leg():
    segs = [_seg("BLR", "LHR", "2026-10-12", "04:15", "2026-10-12", "13:30", "A1"), _seg("LHR", "BLR", "2026-10-19", "10:00", "2026-10-20", "00:30", "A2")]
    cols = derive_columns(split_extraction(_ext(segs))[0])
    assert (cols["origin"], cols["destination"]) == ("BLR", "LHR")
    assert (cols["travel_date"], cols["start_time"], cols["end_time"]) == ("2026-10-12", "04:15", "13:30")
    assert cols["airline_code"] == "EK" and cols["booking_reference"] == "ABC123"


def test_low_confidence_flags_review():
    ext = _ext([_seg("BLR", "DEL", "2026-10-12", "04:15", "2026-10-12", "06:30", "A1")]).model_copy(update={"confidence": 0.5})
    assert derive_columns(ext)["needs_review"] is True
