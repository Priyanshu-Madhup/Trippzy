"""Strict JSON Schemas sent to the model (port of Trippy's `schemas.ts`).
In strict mode every property is required, so "optional" values are nullable."""

from app.schemas.extraction import DOCUMENT_TYPES

Schema = dict

_str: Schema = {"type": ["string", "null"]}
_num: Schema = {"type": ["number", "null"]}
_int: Schema = {"type": ["integer", "null"]}
_date: Schema = {"type": ["string", "null"], "description": "YYYY-MM-DD or null"}
_time: Schema = {"type": ["string", "null"], "description": "HH:mm 24-hour or null"}
_str_list: Schema = {"type": "array", "items": {"type": "string"}}


def obj(properties: dict[str, Schema], description: str | None = None) -> Schema:
    return {
        "type": "object",
        **({"description": description} if description else {}),
        "properties": properties,
        "required": list(properties),
        "additionalProperties": False,
    }


_provider = obj({"name": _str, "domain": {"type": ["string", "null"], "description": "Official website domain, e.g. 'makemytrip.com'"}})
_flight_endpoint = obj(
    {
        "airport": _str,
        "airport_code": {"type": ["string", "null"], "description": "3-letter IATA airport code"},
        "city": _str,
        "country": _str,
        "date": _date,
        "time": _time,
        "terminal": _str,
    }
)
_transit_endpoint = obj(
    {
        "station": {"type": ["string", "null"], "description": "Station / boarding point name"},
        "station_code": _str,
        "city": _str,
        "date": _date,
        "time": _time,
    }
)


def _generic() -> Schema:
    return obj(
        {
            "issuer": _str,
            "key_facts": {
                "type": "array",
                "description": "Up to 8 important label/value facts found in the document",
                "items": obj({"label": {"type": "string"}, "value": {"type": "string"}}),
            },
            "dates": {"type": "array", "items": obj({"label": {"type": "string"}, "date": {"type": "string"}})},
            "city": _str,
        }
    )


DETAIL_SCHEMAS: dict[str, Schema] = {
    "flight": obj(
        {
            "airline": obj(
                {
                    "name": _str,
                    "iata_code": {"type": ["string", "null"], "description": "2-character IATA airline code"},
                    "domain": {"type": ["string", "null"], "description": "Airline's official website domain"},
                }
            ),
            "segments": {
                "type": "array",
                "description": "One entry per flight leg, in travel order",
                "items": obj(
                    {
                        "flight_number": _str,
                        "departure": _flight_endpoint,
                        "arrival": _flight_endpoint,
                        "seat": _str,
                        "cabin_class": _str,
                        "duration": _str,
                    }
                ),
            },
            "pnr": _str,
            "ticket_number": _str,
            "baggage": _str,
            "passengers": _str_list,
        }
    ),
    "hotel": obj(
        {
            "hotel": obj({"name": _str, "address": _str, "city": _str, "country": _str, "phone": _str, "domain": _str}),
            "check_in": obj({"date": _date, "time": _time}),
            "check_out": obj({"date": _date, "time": _time}),
            "nights": _int,
            "rooms": _int,
            "room_type": _str,
            "guests": _int,
            "confirmation_number": _str,
        }
    ),
    "train": obj(
        {
            "operator": _provider,
            "train_name": _str,
            "train_number": _str,
            "departure": _transit_endpoint,
            "arrival": _transit_endpoint,
            "pnr": _str,
            "coach": _str,
            "seat": _str,
            "berth": _str,
            "travel_class": _str,
            "passengers": _str_list,
        }
    ),
    "bus": obj(
        {
            "operator": _provider,
            "bus_type": _str,
            "departure": _transit_endpoint,
            "arrival": _transit_endpoint,
            "seat": _str,
            "ticket_number": _str,
            "pnr": _str,
            "passengers": _str_list,
        }
    ),
    "restaurant": obj(
        {
            "name": _str,
            "address": _str,
            "city": _str,
            "date": _date,
            "time": _time,
            "party_size": _int,
            "reservation_number": _str,
            "domain": _str,
        }
    ),
    "activity": obj(
        {
            "name": _str,
            "venue": _str,
            "address": _str,
            "city": _str,
            "date": _date,
            "time": _time,
            "end_time": _time,
            "ticket_count": _int,
            "reference": _str,
            "domain": _str,
        }
    ),
    "generic_travel_document": _generic(),
    "unknown": _generic(),
}

CLASSIFY_SCHEMA = obj(
    {
        "document_type": {"type": "string", "enum": list(DOCUMENT_TYPES)},
        "confidence": {"type": "number", "description": "0 to 1"},
        "reason": {"type": "string", "description": "One short sentence"},
    }
)

TRIP_INSIGHT_SCHEMA = obj(
    {
        "destination": {"type": "string", "description": "Primary destination — usually a city, or a region/country for multi-city trips"},
        "country": _str,
        "country_code": {"type": ["string", "null"], "description": "ISO 3166-1 alpha-2"},
        "image_query": {"type": "string", "description": "Search phrase for a beautiful cover photo, e.g. 'London skyline Tower Bridge'"},
        "confidence": {"type": "number"},
    }
)


NOTE_SCHEMA = obj(
    {
        "headline": {"type": "string", "description": "Max 60 chars: the key action"},
        "body": {"type": "string", "description": "2-4 short sentences using only the given facts"},
        "tips": {"type": "array", "items": {"type": "string"}, "description": "0-3 very short practical tips"},
    }
)

COVER_BRIEF_SCHEMA = obj(
    {
        "queries": {
            "type": "array",
            "items": {"type": "string"},
            "description": "3-4 image search phrases, most specific first, each containing the place name",
        },
        "landmark": {"type": ["string", "null"], "description": "Exact English Wikipedia title of the most photogenic well-known sight, or null"},
    }
)


def extraction_schema(doc_type: str) -> Schema:
    return obj(
        {
            "confidence": {"type": "number", "description": "0 to 1 — how complete and certain the extraction is"},
            "title": {"type": ["string", "null"], "description": "Short human title, e.g. 'Bengaluru → Dubai' or 'Pullman Paris Tour Eiffel'"},
            "summary": {"type": ["string", "null"], "description": "One sentence describing the booking"},
            "booking_platform": obj(
                {"name": _str, "domain": _str},
                "The agency / website the booking was made through (MakeMyTrip, Booking.com, Expedia…). Null if booked directly or unknown.",
            ),
            "booking_reference": {"type": ["string", "null"], "description": "Main booking / confirmation reference exactly as printed"},
            "primary_location": obj(
                {"city": _str, "country": _str, "country_code": {"type": ["string", "null"], "description": "ISO 3166-1 alpha-2"}},
                "Where the traveller ends up / where the booking takes place",
            ),
            "start_date": _date,
            "end_date": _date,
            "total_price": obj({"amount": _num, "currency": {"type": ["string", "null"], "description": "ISO 4217"}}),
            "details": DETAIL_SCHEMAS[doc_type],
            "reminder": obj(
                {
                    "title": {
                        "type": ["string", "null"],
                        "description": "Notification title, max 60 chars, e.g. 'Flight to Ranchi today' or 'Check in at Taj Palace'",
                    },
                    "body": {
                        "type": ["string", "null"],
                        "description": (
                            "One or two short sentences with the practical facts from the document "
                            "(time, terminal/platform/coach/seat, PNR, check-in time). Never invent anything."
                        ),
                    },
                    "lead_minutes": {
                        "type": ["integer", "null"],
                        "description": "Minutes BEFORE it starts to alert: flights 180, trains/buses 90, hotel check-in 120, restaurants/activities 60",
                    },
                },
                "Calendar reminder wording for this booking",
            ),
        }
    )
