"""Itinerary logic ported from Trippy's `utils/ticket.ts`: splitting a round-trip document into
journeys and deriving the flat ticket columns from an extraction."""

from __future__ import annotations

from datetime import UTC, datetime
from zoneinfo import ZoneInfo

from app.schemas.extraction import DocumentExtraction


def _stamp(endpoint: dict) -> float | None:
    date, time = endpoint.get("date"), endpoint.get("time") or "12:00"
    if not date:
        return None
    try:
        dt = datetime.strptime(f"{date} {time}", "%Y-%m-%d %H:%M")
    except ValueError:
        return None
    tz = endpoint.get("timezone")
    try:
        dt = dt.replace(tzinfo=ZoneInfo(tz)) if tz else dt.replace(tzinfo=UTC)
    except Exception:
        dt = dt.replace(tzinfo=UTC)
    return dt.timestamp()


def _same_place(a: dict, b: dict) -> bool:
    if a.get("airport_code") and b.get("airport_code"):
        return a["airport_code"] == b["airport_code"]
    return bool(a.get("city") and b.get("city") and a["city"].lower() == b["city"].lower())


def flight_journey(segments: list[dict]) -> dict | None:
    """Split an itinerary into outbound / return legs. A return exists when there's a stay of
    more than 24h between flights, or the journey ends where it started (split at the longest gap)."""
    if not segments:
        return None
    longest_gap, longest_at = -1.0, -1
    for i in range(len(segments) - 1):
        a, b = _stamp(segments[i]["arrival"]), _stamp(segments[i + 1]["departure"])
        if a is not None and b is not None and b - a > longest_gap:
            longest_gap, longest_at = b - a, i
    round_trip = len(segments) >= 2 and _same_place(segments[0]["departure"], segments[-1]["arrival"])
    split = len(segments)
    if longest_at >= 0 and (longest_gap > 24 * 3600 or (round_trip and longest_gap > 3 * 3600)):
        split = longest_at + 1
    elif round_trip and longest_at < 0:
        split = -(-len(segments) // 2)  # no times printed: assume symmetric
    outbound, inbound = segments[:split], segments[split:]
    return {
        "outbound": outbound,
        "inbound": inbound,
        "first": outbound[0],
        "last": outbound[-1],
        "stops": [x for x in ((s["arrival"].get("airport_code") or s["arrival"].get("city") or "") for s in outbound[:-1]) if x],
    }


def split_extraction(ext: DocumentExtraction) -> list[DocumentExtraction]:
    """One document can hold several journeys; return one extraction per journey."""
    if ext.document_type != "flight":
        return [ext]
    data = ext.details.model_dump()  # type: ignore[union-attr]
    journey = flight_journey(data["segments"])
    if not journey or not journey["inbound"]:
        return [ext]

    def leg(segments: list[dict], which: str) -> DocumentExtraction:
        first, last = segments[0], segments[-1]
        frm = first["departure"].get("city") or first["departure"].get("airport_code")
        to = last["arrival"].get("city") or last["arrival"].get("airport_code")
        return ext.model_copy(
            update={
                "leg": which,
                "reminder": ext.reminder.model_copy(update={"title": None, "body": None}),  # worded for the whole document, not this leg
                "title": f"{frm} → {to}" if frm and to else ext.title,
                "start_date": first["departure"].get("date"),
                "end_date": last["arrival"].get("date") or first["departure"].get("date"),
                "primary_location": ext.primary_location.model_copy(
                    update={
                        "city": last["arrival"].get("city"),
                        "country": last["arrival"].get("country"),
                        "country_code": ext.primary_location.country_code if which == "outbound" else None,
                    }
                ),
                "details": type(ext.details).model_validate({**data, "segments": segments}),
            }
        )

    return [leg(journey["outbound"], "outbound"), leg(journey["inbound"], "return")]


def _route_title(frm: str | None, to: str | None) -> str | None:
    return f"{frm} → {to}" if frm and to else (frm or to)


def derive_columns(ext: DocumentExtraction) -> dict:
    """Frequently-queried, user-editable summary columns derived from an extraction."""
    d = ext.details
    base = {
        "document_type": ext.document_type,
        "confidence": ext.confidence,
        "needs_review": ext.confidence < 0.7,
        "title": ext.title,
        "summary": ext.summary,
        "booking_platform": ext.booking_platform.name,
        "booking_reference": ext.booking_reference,
        "destination": ext.primary_location.city,
        "travel_date": ext.start_date,
        "end_date": ext.end_date,
    }
    t = ext.document_type
    if t == "flight":
        segs = d.model_dump()["segments"]  # type: ignore[union-attr]
        j = flight_journey(segs)
        last_seg = segs[-1] if segs else None
        first_dep = j["first"]["departure"] if j else {}
        last_arr = j["last"]["arrival"] if j else {}
        return {
            **base,
            "provider_name": d.airline.name,  # type: ignore[union-attr]
            "airline_name": d.airline.name,  # type: ignore[union-attr]
            "airline_code": d.airline.iata_code,  # type: ignore[union-attr]
            "booking_reference": d.pnr or ext.booking_reference,  # type: ignore[union-attr]
            "origin": first_dep.get("city") or first_dep.get("airport_code"),
            "destination": last_arr.get("city") or last_arr.get("airport_code") or base["destination"],
            "travel_date": first_dep.get("date") or ext.start_date,
            "end_date": (last_seg["arrival"].get("date") if last_seg else None) or ext.end_date,
            "start_time": first_dep.get("time"),
            "end_time": last_arr.get("time"),
            "title": ext.title or _route_title(first_dep.get("city"), last_arr.get("city")),
        }
    if t == "hotel":
        return {
            **base,
            "provider_name": d.hotel.name,  # type: ignore[union-attr]
            "booking_reference": d.confirmation_number or ext.booking_reference,  # type: ignore[union-attr]
            "destination": d.hotel.city or base["destination"],  # type: ignore[union-attr]
            "travel_date": d.check_in.date or ext.start_date,  # type: ignore[union-attr]
            "end_date": d.check_out.date or ext.end_date,  # type: ignore[union-attr]
            "start_time": d.check_in.time,  # type: ignore[union-attr]
            "end_time": d.check_out.time,  # type: ignore[union-attr]
            "title": d.hotel.name or ext.title,  # type: ignore[union-attr]
        }
    if t in ("train", "bus"):
        frm = d.departure.city or d.departure.station  # type: ignore[union-attr]
        to = d.arrival.city or d.arrival.station  # type: ignore[union-attr]
        extra_ref = getattr(d, "ticket_number", None)
        return {
            **base,
            "provider_name": d.operator.name or getattr(d, "train_name", None),  # type: ignore[union-attr]
            "booking_reference": d.pnr or extra_ref or ext.booking_reference,  # type: ignore[union-attr]
            "origin": frm,
            "destination": to or base["destination"],
            "travel_date": d.departure.date or ext.start_date,  # type: ignore[union-attr]
            "end_date": d.arrival.date or ext.end_date,  # type: ignore[union-attr]
            "start_time": d.departure.time,  # type: ignore[union-attr]
            "end_time": d.arrival.time,  # type: ignore[union-attr]
            "title": ext.title or _route_title(frm, to),
        }
    if t == "restaurant":
        return {
            **base,
            "provider_name": d.name,  # type: ignore[union-attr]
            "booking_reference": d.reservation_number or ext.booking_reference,  # type: ignore[union-attr]
            "destination": d.city or base["destination"],  # type: ignore[union-attr]
            "travel_date": d.date or ext.start_date,  # type: ignore[union-attr]
            "start_time": d.time,  # type: ignore[union-attr]
            "title": d.name or ext.title,  # type: ignore[union-attr]
        }
    if t == "activity":
        return {
            **base,
            "provider_name": d.venue or d.name,  # type: ignore[union-attr]
            "booking_reference": d.reference or ext.booking_reference,  # type: ignore[union-attr]
            "destination": d.city or base["destination"],  # type: ignore[union-attr]
            "travel_date": d.date or ext.start_date,  # type: ignore[union-attr]
            "start_time": d.time,  # type: ignore[union-attr]
            "end_time": d.end_time,  # type: ignore[union-attr]
            "title": d.name or ext.title,  # type: ignore[union-attr]
        }
    return {**base, "provider_name": d.issuer, "destination": d.city or base["destination"]}  # type: ignore[union-attr]
