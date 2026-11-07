"""Trip intelligence (port of Trippy's `processing.ts`): derive a trip's destination, dates,
cover photo and places from its tickets. Runs on the server so every client behaves the same."""

import logging

import pycountry

from app.ai import prompts
from app.ai.client import Budget, Usage
from app.ai.llm_schemas import COVER_BRIEF_SCHEMA, TRIP_INSIGHT_SCHEMA
from app.ai.normalize import clamp01, country_code, s
from app.context import Ctx
from app.core.errors import AppError
from app.db import now
from app.services.resolvers import resolve_cover

log = logging.getLogger("trippzy.trip")
AUTO_TRIP_NAME = "New trip"
TRANSPORT = {"flight", "train", "bus"}
_ALIASES = {"usa": "US", "uk": "GB", "uae": "AE", "england": "GB", "scotland": "GB", "wales": "GB"}


def country_code_from_name(name: str | None) -> str | None:
    if not name:
        return None
    key = name.strip().lower()
    if key in _ALIASES:
        return _ALIASES[key]
    try:
        return pycountry.countries.lookup(name.strip()).alpha_2
    except LookupError:
        return None


def _norm(x: str | None) -> str:
    return (x or "").strip().lower()


def destination_candidates(tickets: list[dict]) -> list[dict]:
    """Weighted candidates — hotels count most, the home city is excluded."""
    transport = sorted(
        (t for t in tickets if t["document_type"] in TRANSPORT and t.get("origin")),
        key=lambda t: t.get("travel_date") or "9999",
    )
    home = _norm(transport[0]["origin"]) if transport else None
    cands: dict[str, dict] = {}

    def add(city, weight, reason, loc=None):
        if not city or (home and _norm(city) == home):
            return
        c = cands.setdefault(_norm(city), {"city": city, "country": None, "country_code": None, "weight": 0.0, "reasons": []})
        c["weight"] += weight
        c["reasons"].append(reason)
        if loc and loc.get("city") and _norm(loc["city"]) == _norm(city):
            c["country"] = c["country"] or loc.get("country")
            c["country_code"] = c["country_code"] or loc.get("country_code")

    for t in tickets:
        sd = t.get("structured_data") or {}
        loc = sd.get("primary_location")
        typ = t["document_type"]
        if typ == "hotel":
            nights = ((sd.get("details") or {}).get("nights")) or 1
            add(t.get("destination"), 3 + min(nights, 10), f"hotel: {t.get('provider_name') or t.get('title') or ''}", loc)
        elif typ in ("activity", "restaurant"):
            add(t.get("destination"), 2, f"{typ}: {t.get('title') or ''}", loc)
        elif typ in TRANSPORT:
            add(t.get("destination"), 2, f"{typ} to {t.get('destination')}", loc)
        else:
            add(t.get("destination"), 0.5, "document", loc)
    return sorted(cands.values(), key=lambda c: -c["weight"])


async def decide_destination(ctx: Ctx, trip: dict, tickets: list[dict]) -> dict | None:
    cands = destination_candidates(tickets)
    if not cands:
        return None
    top = cands[0]
    second = cands[1] if len(cands) > 1 else None
    fallback = {
        "destination": top["city"],
        "country": top["country"],
        "country_code": top["country_code"] or country_code_from_name(top["country"]),
        "image_query": f"{top['city']} skyline",
    }
    if not second or top["weight"] >= second["weight"] * 2:
        return fallback
    try:  # ambiguous → ask the model
        import json

        payload = {
            "trip_name": trip["name"][:120],
            "current_destination": trip.get("destination"),
            "candidates": cands[:20],
            "bookings": [
                {
                    "type": t["document_type"],
                    "title": t.get("title"),
                    "origin": t.get("origin"),
                    "destination": t.get("destination"),
                    "date": t.get("travel_date"),
                }
                for t in tickets[:40]
            ],
        }
        out = await ctx.ai.structured(
            system=prompts.TRIP_INSIGHT_SYSTEM,
            user=json.dumps(payload),
            schema_name="trip_destination",
            schema=TRIP_INSIGHT_SCHEMA,
            usage=Usage(),
            budget=Budget(40),
            max_tokens=2000,
        )
        dest = s(out.get("destination"), 80) or top["city"]
        cc = country_code(out.get("country_code"))
        _ = clamp01(out.get("confidence") if isinstance(out.get("confidence"), (int, float)) else 0.6)
        return {
            "destination": dest,
            "country": s(out.get("country"), 80),
            "country_code": cc or country_code_from_name(s(out.get("country"), 80)),
            "image_query": s(out.get("image_query"), 120) or f"{dest} skyline",
        }
    except (AppError, Exception):
        return fallback


def places_from(tickets: list[dict]) -> list[dict]:
    places: list[dict] = []
    for t in tickets:
        if t.get("destination"):
            places.append({"place_name": t["destination"], "place_type": "city", "ticket_id": t["id"]})
        if t["document_type"] == "hotel" and t.get("provider_name"):
            places.append({"place_name": t["provider_name"], "place_type": "hotel", "ticket_id": t["id"], "image_url": t.get("image_url"), "source": "ai"})
        if t["document_type"] == "activity" and t.get("provider_name"):
            places.append({"place_name": t["provider_name"], "place_type": "venue", "ticket_id": t["id"], "image_url": t.get("image_url"), "source": "ai"})
        if t["document_type"] == "flight":
            for seg in ((t.get("structured_data") or {}).get("details") or {}).get("segments", []):
                code = (seg.get("arrival") or {}).get("airport_code")
                if code:
                    places.append({"place_name": code, "place_type": "airport", "ticket_id": t["id"]})
    seen, out = set(), []
    for p in places:  # unique per (name, type), like the unique index in Trippy
        k = (p["place_name"].lower(), p["place_type"])
        if k not in seen:
            seen.add(k)
            out.append({**p, "image_url": p.get("image_url"), "source": p.get("source")})
    return out


async def cover_brief(ctx: Ctx, trip: dict) -> dict:
    """Ask the model what is best to photograph for this destination (prompt: prompts.COVER_IMAGE_SYSTEM, or the
    COVER_IMAGE_PROMPT setting). Falls back to a plain skyline search if the model is unavailable."""
    import json

    dest = trip["destination"]
    fallback = {"queries": [f"{dest} skyline", dest], "landmark": None}
    try:
        out = await ctx.ai.structured(
            system=ctx.settings.cover_image_prompt or prompts.COVER_IMAGE_SYSTEM,
            user=json.dumps({"destination": dest, "country": trip.get("country"), "trip_name": (trip.get("name") or "")[:120]}),
            schema_name="cover_photo_brief",
            schema=COVER_BRIEF_SCHEMA,
            usage=Usage(),
            budget=Budget(20),
            max_tokens=800,
        )
    except (AppError, Exception):
        return fallback
    queries = [q for q in (s(x, 120) for x in (out.get("queries") or [])[:4]) if q]
    return {"queries": queries or fallback["queries"], "landmark": s(out.get("landmark"), 120)}


async def refresh_trip_cover(ctx: Ctx, trip: dict, query: str | None = None) -> dict:
    """Pick (and save) the cover photo. With no `query` the model decides what to photograph; an explicit `query`
    is used as-is."""
    dest = (trip.get("destination") or "").strip()
    if query and query.strip():
        q, queries, landmark = query.strip(), [query.strip()], None
    elif dest:
        if trip.get("cover_image_url") and trip.get("cover_image_for") == dest:
            return trip
        brief = await cover_brief(ctx, trip)
        queries, landmark = brief["queries"], brief["landmark"]
        q = queries[0]
    else:
        return trip
    img = await resolve_cover(ctx.settings, dest or q, queries, landmark)
    if not img["url"]:
        return trip
    patch = {
        "cover_image_url": img["url"],
        "cover_image_source": img["source"],
        "cover_image_attribution": img["attribution"],
        "cover_image_query": q,
        "cover_image_for": dest or None,
        "updated_at": now(),
    }
    return (await ctx.trips.update(trip["user_id"], trip["_id"], patch)) or trip


async def update_trip_from_tickets(ctx: Ctx, user_id: str, trip_id: str) -> dict | None:
    """Re-derive trip metadata after a ticket changes: dates (widen), destination (unless the
    user set it), auto-name, cover and places."""
    trip = await ctx.trips.get(user_id, trip_id)
    if not trip:
        return None
    raw = await ctx.tickets.for_trip(user_id, trip_id)
    # "finishing" tickets are fully extracted and only waiting for this very update to be released.
    tickets = [{**t, "id": t["_id"]} for t in raw if t.get("processing_status") == "completed" or t.get("processing_stage") == "finishing"]
    patch: dict = {}

    dated = [t for t in tickets if t["document_type"] not in ("generic_travel_document", "unknown")]
    starts = sorted(t["travel_date"] for t in dated if t.get("travel_date"))
    ends = sorted((t.get("end_date") or t.get("travel_date")) for t in dated if (t.get("end_date") or t.get("travel_date")))
    if starts and (not trip.get("start_date") or starts[0] < trip["start_date"]):
        patch["start_date"] = starts[0]
    if ends and (not trip.get("end_date") or ends[-1] > trip["end_date"]):
        patch["end_date"] = ends[-1]
    start, end = patch.get("start_date") or trip.get("start_date"), patch.get("end_date") or trip.get("end_date")
    if start and end and end < start:
        patch["end_date"] = start

    cover_query = None
    if trip.get("destination_source") != "user":
        decision = await decide_destination(ctx, trip, tickets)
        if decision and _norm(decision["destination"]) != _norm(trip.get("destination")):
            patch.update(destination=decision["destination"], country=decision["country"], country_code=decision["country_code"])
            cover_query = decision["image_query"]

    destination = patch.get("destination") or trip.get("destination")
    if trip["name"] == AUTO_TRIP_NAME and destination:
        patch["name"] = f"Trip to {destination}"

    updated = trip
    if patch:
        updated = await ctx.trips.update(user_id, trip_id, {**patch, "updated_at": now()}) or trip
    if cover_query or not updated.get("cover_image_url"):
        try:
            updated = await refresh_trip_cover(ctx, updated)  # the model decides what to photograph
        except Exception:
            log.warning("cover refresh failed", extra={"trip_id": trip_id})

    places = places_from(tickets)
    existing = {(p["place_name"].lower(), p["place_type"]) for p in updated.get("places", [])}
    new = [
        {"place_name": p["place_name"], "place_type": p["place_type"], "ticket_id": p["ticket_id"], "image_url": p["image_url"], "source": p["source"]}
        for p in places
        if (p["place_name"].lower(), p["place_type"]) not in existing
    ]
    if new:
        await ctx.trips.update(user_id, trip_id, {"places": [*updated.get("places", []), *new]})
    return updated
