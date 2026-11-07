"""Defensive normalisation of model output + hallucination guard.

Port of Trippy's `normalize.ts` with the weaknesses found in review fixed:
  * short identifiers (seats, coaches…) must match a whole token, not any substring;
  * the `PNR:` label fallback is case-sensitive on the code and ignores common words ("STATUS");
  * amounts are parsed locale-aware ("1.234,50" → 1234.5);
  * flight times get an IANA zone from the airport code, and durations are computed with it.
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

import airportsdata

from app.schemas.extraction import DocumentExtraction

Raw = dict[str, Any]

_EMPTY = {"", "null", "none", "n/a", "na", "not provided", "not available", "unknown", "-", "--", "—"}


def rec(v: Any) -> Raw:
    return v if isinstance(v, dict) else {}


def s(v: Any, max_len: int = 300) -> str | None:
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return str(v)
    if not isinstance(v, str):
        return None
    t = re.sub(r"\s+", " ", v).strip()
    if t.lower() in _EMPTY:
        return None
    return t[:max_len]


def parse_amount(v: Any) -> float | None:
    """Locale-aware: '1,234.50', '1.234,50', '1 234,5', '₹4,500', 4500 → float."""
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    if not isinstance(v, str):
        return None
    t = re.sub(r"[^\d.,\-]", "", v.replace("\u00a0", " ").replace(" ", ""))
    if not re.search(r"\d", t):
        return None
    neg = t.startswith("-")
    t = t.lstrip("-")
    if "," in t and "." in t:
        dec = "," if t.rfind(",") > t.rfind(".") else "."
        thousands = "." if dec == "," else ","
        t = t.replace(thousands, "").replace(dec, ".")
    elif "," in t:
        # "1,234" → thousands; "12,5" / "1234,50" → decimal comma
        t = t.replace(",", "") if re.fullmatch(r"\d{1,3}(,\d{3})+", t) else t.replace(",", ".")
    elif t.count(".") > 1:
        t = t.replace(".", "")
    try:
        x = float(t)
    except ValueError:
        return None
    return -x if neg else x


def to_int(v: Any) -> int | None:
    x = parse_amount(v)
    return None if x is None else round(x)


def str_list(v: Any, max_items: int = 12) -> list[str]:
    if not isinstance(v, list):
        return []
    return [t for t in (s(x, 120) for x in v) if t][:max_items]


def norm_date(v: Any) -> str | None:
    t = s(v)
    if not t:
        return None
    m = re.match(r"^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})", t)
    if not m:
        return None
    y, mo, d = m.groups()
    iso = f"{y}-{int(mo):02d}-{int(d):02d}"
    try:
        parsed = datetime.strptime(iso, "%Y-%m-%d")
    except ValueError:
        return None
    return iso if 2000 <= parsed.year <= 2100 else None


def norm_time(v: Any) -> str | None:
    t = s(v)
    if not t:
        return None
    m = re.search(r"(\d{1,2})[:.h](\d{2})\s*([ap]\.?m\.?)?", t, re.I) or re.match(r"^(\d{2})(\d{2})$", t)
    if not m:
        return None
    h, mi = int(m.group(1)), int(m.group(2))
    ampm = (m.group(3) or "").lower().replace(".", "") if m.lastindex and m.lastindex >= 3 else ""
    if ampm == "pm" and h < 12:
        h += 12
    if ampm == "am" and h == 12:
        h = 0
    if h > 23 or mi > 59:
        return None
    return f"{h:02d}:{mi:02d}"


def code(v: Any, length: int) -> str | None:
    t = s(v)
    if not t:
        return None
    c = re.sub(r"[^A-Z0-9]", "", t.upper())
    return c if len(c) == length else None


def domain(v: Any) -> str | None:
    t = s(v)
    if not t:
        return None
    d = re.split(r"[/?#\s]", re.sub(r"^www\.", "", re.sub(r"^https?://", "", t.lower())))[0]
    return d if re.fullmatch(r"[a-z0-9-]+(\.[a-z0-9-]+)+", d) else None


def country_code(v: Any) -> str | None:
    c = code(v, 2)
    return c if c and re.fullmatch(r"[A-Z]{2}", c) else None


def clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))


# ─── Grounding ──────────────────────────────────────────────────────


def _alnum(x: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", x.upper())


_LABEL_STOPWORDS = {
    "STATUS",
    "NUMBER",
    "DETAILS",
    "TICKET",
    "BOOKING",
    "ADDRESS",
    "PLEASE",
    "REFERENCE",
    "CONFIRMED",
    "PASSENGER",
    "CONTACT",
    "SUPPORT",
    "RESERVED",
    "CHARGES",
    "CHARGED",
    "INCLUDED",
}


class Grounder:
    """Drops identifiers that don't literally appear in the source text."""

    def __init__(self, source: str) -> None:
        self.source = source
        self._hay = _alnum(source)
        self._tokens = set(re.findall(r"[A-Z0-9]+", source.upper()))
        self._words = {w for w in re.split(r"[^\w]+", source.lower()) if len(w) >= 3}
        self.dropped: list[str] = []

    def id(self, value: str | None, field: str) -> str | None:
        if not value:
            return None
        needle = _alnum(value)
        if not needle:
            return None
        # Short identifiers (seat "1A", coach "S5") would match almost anywhere as a substring,
        # so they must appear as a whole token (e.g. "1A" or "24 A" printed as separate cells).
        ok = needle in self._tokens if len(needle) <= 4 else needle in self._hay
        if not ok and len(needle) <= 4:
            ok = bool(re.search(rf"(?<![A-Z0-9]){re.escape(needle[:-1])}\s?{re.escape(needle[-1])}(?![A-Z0-9])", self.source.upper()))
        if ok:
            return value
        self.dropped.append(field)
        return None

    def labelled(self, label: str) -> str | None:
        """Explicitly labelled code the model missed, e.g. "PNR: DYQBNK". Only ever returns
        text that is printed in the document."""
        pattern = rf"(?i:\b{label}\b)\s*(?:(?i:no\.?|number)|#)?\s*[:\-]?\s*([A-Z0-9]{{5,12}})\b"
        for m in re.finditer(pattern, self.source):
            value = m.group(1)
            if value in _LABEL_STOPWORDS:
                continue
            if re.search(r"\d", value) or re.fullmatch(r"[A-Z]{6}", value):
                return value
        return None

    def text(self, value: str | None, field: str) -> str | None:
        if not value:
            return None
        tokens = [w for w in re.split(r"[^\w]+", value.lower()) if len(w) >= 3]
        if not tokens:
            return value
        if sum(1 for w in tokens if w in self._words) / len(tokens) >= 0.6:
            return value
        self.dropped.append(field)
        return None


# ─── Flight time zones ──────────────────────────────────────────────

_AIRPORTS = airportsdata.load("IATA")


def airport_timezone(iata: str | None) -> str | None:
    rec_ = _AIRPORTS.get(iata or "")
    return rec_.get("tz") if rec_ else None


def _local_dt(date: str | None, time: str | None, tz: str | None) -> datetime | None:
    if not (date and time and tz):
        return None
    try:
        return datetime.strptime(f"{date} {time}", "%Y-%m-%d %H:%M").replace(tzinfo=ZoneInfo(tz))
    except Exception:
        return None


def segment_minutes(seg: dict) -> int | None:
    dep, arr = seg["departure"], seg["arrival"]
    a = _local_dt(dep.get("date"), dep.get("time"), dep.get("timezone"))
    b = _local_dt(arr.get("date"), arr.get("time"), arr.get("timezone"))
    if not a or not b:
        return None
    minutes = int((b - a).total_seconds() // 60)
    return minutes if 0 < minutes <= 30 * 60 else None  # sanity bound: longest flights are < 24h


# ─── Per-type sanitisers ────────────────────────────────────────────


def _flight_endpoint(v: Any) -> Raw:
    r = rec(v)
    ap = code(r.get("airport_code"), 3)
    return {
        "airport": s(r.get("airport")),
        "airport_code": ap,
        "city": s(r.get("city"), 80),
        "country": s(r.get("country"), 80),
        "date": norm_date(r.get("date")),
        "time": norm_time(r.get("time")),
        "terminal": s(r.get("terminal"), 20),
        "timezone": airport_timezone(ap),
    }


def _transit_endpoint(v: Any) -> Raw:
    r = rec(v)
    st = s(r.get("station_code"), 12)
    return {
        "station": s(r.get("station"), 160),
        "station_code": st.upper() if st else None,
        "city": s(r.get("city"), 80),
        "date": norm_date(r.get("date")),
        "time": norm_time(r.get("time")),
    }


def _provider(v: Any) -> Raw:
    r = rec(v)
    return {"name": s(r.get("name"), 120), "domain": domain(r.get("domain"))}


def _flight(r: Raw, g: Grounder) -> Raw:
    airline = rec(r.get("airline"))
    segments = []
    for i, seg in enumerate((r.get("segments") if isinstance(r.get("segments"), list) else [])[:8]):
        x = rec(seg)
        fn = s(x.get("flight_number"), 12)
        seat = s(x.get("seat"), 8)
        out = {
            "flight_number": g.id(re.sub(r"\s+", "", fn.upper()) if fn else None, f"segments[{i}].flight_number"),
            "departure": _flight_endpoint(x.get("departure")),
            "arrival": _flight_endpoint(x.get("arrival")),
            "seat": g.id(seat.upper() if seat else None, f"segments[{i}].seat"),
            "cabin_class": s(x.get("cabin_class"), 40),
            "duration": s(x.get("duration"), 20),
        }
        out["duration_minutes"] = segment_minutes(out)
        segments.append(out)
    pnr = s(r.get("pnr"), 20)
    return {
        "airline": {"name": s(airline.get("name"), 120), "iata_code": code(airline.get("iata_code"), 2), "domain": domain(airline.get("domain"))},
        "segments": segments,
        "pnr": g.id(pnr.upper() if pnr else None, "pnr") or g.labelled("PNR"),
        "ticket_number": g.id(s(r.get("ticket_number"), 30), "ticket_number"),
        "baggage": s(r.get("baggage"), 120),
        "passengers": str_list(r.get("passengers")),
    }


def _hotel(r: Raw, g: Grounder) -> Raw:
    h, ci, co = rec(r.get("hotel")), rec(r.get("check_in")), rec(r.get("check_out"))
    return {
        "hotel": {
            "name": s(h.get("name"), 160),
            "address": g.text(s(h.get("address"), 300), "hotel.address"),
            "city": s(h.get("city"), 80),
            "country": s(h.get("country"), 80),
            "phone": g.id(s(h.get("phone"), 40), "hotel.phone"),
            "domain": domain(h.get("domain")),
        },
        "check_in": {"date": norm_date(ci.get("date")), "time": norm_time(ci.get("time"))},
        "check_out": {"date": norm_date(co.get("date")), "time": norm_time(co.get("time"))},
        "nights": to_int(r.get("nights")),
        "rooms": to_int(r.get("rooms")),
        "room_type": s(r.get("room_type"), 120),
        "guests": to_int(r.get("guests")),
        "confirmation_number": g.id(s(r.get("confirmation_number"), 40), "confirmation_number"),
    }


def _train(r: Raw, g: Grounder) -> Raw:
    return {
        "operator": _provider(r.get("operator")),
        "train_name": s(r.get("train_name"), 120),
        "train_number": g.id(s(r.get("train_number"), 20), "train_number"),
        "departure": _transit_endpoint(r.get("departure")),
        "arrival": _transit_endpoint(r.get("arrival")),
        "pnr": g.id(s(r.get("pnr"), 20), "pnr") or g.labelled("PNR"),
        "coach": g.id(s(r.get("coach"), 12), "coach"),
        "seat": g.id(s(r.get("seat"), 12), "seat"),
        "berth": s(r.get("berth"), 30),
        "travel_class": s(r.get("travel_class"), 40),
        "passengers": str_list(r.get("passengers")),
    }


def _bus(r: Raw, g: Grounder) -> Raw:
    return {
        "operator": _provider(r.get("operator")),
        "bus_type": s(r.get("bus_type"), 80),
        "departure": _transit_endpoint(r.get("departure")),
        "arrival": _transit_endpoint(r.get("arrival")),
        "seat": g.id(s(r.get("seat"), 20), "seat"),
        "ticket_number": g.id(s(r.get("ticket_number"), 40), "ticket_number"),
        "pnr": g.id(s(r.get("pnr"), 40), "pnr"),
        "passengers": str_list(r.get("passengers")),
    }


def _restaurant(r: Raw, g: Grounder) -> Raw:
    return {
        "name": s(r.get("name"), 160),
        "address": g.text(s(r.get("address"), 300), "address"),
        "city": s(r.get("city"), 80),
        "date": norm_date(r.get("date")),
        "time": norm_time(r.get("time")),
        "party_size": to_int(r.get("party_size")),
        "reservation_number": g.id(s(r.get("reservation_number"), 40), "reservation_number"),
        "domain": domain(r.get("domain")),
    }


def _activity(r: Raw, g: Grounder) -> Raw:
    return {
        "name": s(r.get("name"), 160),
        "venue": s(r.get("venue"), 160),
        "address": g.text(s(r.get("address"), 300), "address"),
        "city": s(r.get("city"), 80),
        "date": norm_date(r.get("date")),
        "time": norm_time(r.get("time")),
        "end_time": norm_time(r.get("end_time")),
        "ticket_count": to_int(r.get("ticket_count")),
        "reference": g.id(s(r.get("reference"), 40), "reference"),
        "domain": domain(r.get("domain")),
    }


def _generic(r: Raw) -> Raw:
    facts = [
        {"label": s(rec(f).get("label"), 60), "value": s(rec(f).get("value"), 200)}
        for f in (r.get("key_facts") if isinstance(r.get("key_facts"), list) else [])
    ]
    dates = [{"label": s(rec(f).get("label"), 60), "date": norm_date(rec(f).get("date"))} for f in (r.get("dates") if isinstance(r.get("dates"), list) else [])]
    return {
        "issuer": s(r.get("issuer"), 120),
        "key_facts": [f for f in facts if f["label"] and f["value"]][:8],
        "dates": [d for d in dates if d["label"] and d["date"]][:6],
        "city": s(r.get("city"), 80),
    }


def coerce_details(doc_type: str, raw: Raw) -> Raw:
    """Models sometimes return `details` as a list or flattened onto the top level."""
    d = raw.get("details")
    if isinstance(d, list):
        items = [rec(x) for x in d if rec(x)]
        if not items:
            return {}
        if doc_type == "flight":
            if all("departure" in x or "arrival" in x for x in items):
                return {**raw, "segments": items}
            segments: list = []
            for x in items:
                if isinstance(x.get("segments"), list):
                    segments += x["segments"]
                elif "departure" in x:
                    segments.append(x)
            return {
                **items[0],
                "segments": segments,
                "pnr": next((x["pnr"] for x in items if x.get("pnr") is not None), None),
                "passengers": [p for x in items for p in (x.get("passengers") or [])],
            }
        return items[0]
    obj = rec(d)
    if obj:
        return obj
    if doc_type == "flight" and (isinstance(raw.get("segments"), list) or raw.get("airline")):
        return raw
    if doc_type == "hotel" and raw.get("hotel"):
        return raw
    return obj


_DETAILS = {"flight": _flight, "hotel": _hotel, "train": _train, "bus": _bus, "restaurant": _restaurant, "activity": _activity}


def build_extraction(doc_type: str, raw: Raw, source_text: str, classify_confidence: float) -> DocumentExtraction:
    g = Grounder(source_text)
    platform, loc, price = rec(raw.get("booking_platform")), rec(raw.get("primary_location")), rec(raw.get("total_price"))
    details_raw = coerce_details(doc_type, raw)
    details = _DETAILS[doc_type](details_raw, g) if doc_type in _DETAILS else _generic(details_raw)
    booking_reference = g.id(s(raw.get("booking_reference"), 40), "booking_reference")

    model_conf = clamp01(parse_amount(raw.get("confidence")) or 0.5)
    penalty = min(0.3, len(g.dropped) * 0.08)
    confidence = clamp01(min(model_conf, classify_confidence) - penalty)

    return DocumentExtraction.model_validate(
        {
            "schema_version": 1,
            "document_type": doc_type,
            "confidence": round(confidence, 3),
            "title": s(raw.get("title"), 140),
            "summary": s(raw.get("summary"), 400),
            "booking_platform": {"name": s(platform.get("name"), 80), "domain": domain(platform.get("domain"))},
            "booking_reference": booking_reference,
            "primary_location": {
                "city": s(loc.get("city"), 80),
                "country": s(loc.get("country"), 80),
                "country_code": country_code(loc.get("country_code")),
            },
            "start_date": norm_date(raw.get("start_date")),
            "end_date": norm_date(raw.get("end_date")),
            "total_price": {
                "amount": parse_amount(price.get("amount")),
                "currency": (s(price.get("currency"), 3) or "").upper() or None,
            },
            "details": details,
            "ungrounded_fields": g.dropped,
            "reminder": _reminder(rec(raw.get("reminder"))),
        }
    )


def _reminder(r: Raw) -> dict:
    lead = parse_amount(r.get("lead_minutes"))
    return {
        "title": s(r.get("title"), 80),
        "body": s(r.get("body"), 240),
        "lead_minutes": int(lead) if lead is not None and 0 <= lead <= 4320 else None,  # at most 3 days ahead
    }


def is_empty_extraction(ext: DocumentExtraction) -> bool:
    d = ext.details
    t = ext.document_type
    if t == "flight":
        return len(d.segments) == 0  # type: ignore[union-attr]
    if t == "hotel":
        return not d.hotel.name  # type: ignore[union-attr]
    if t in ("train", "bus"):
        return not (d.departure.city or d.departure.station or d.arrival.city or d.arrival.station)  # type: ignore[union-attr]
    return False
