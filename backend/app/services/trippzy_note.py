"""Trippzy Note: where the traveller is now, how far the next departure is, and when to leave.

Facts are computed here (never by the model): the next flight / train / bus, the airport or station position,
the drive with live + predicted traffic (TomTom), the latest time to leave, and how the following tickets connect.
The model only words the note from those facts.

The phone's position is used for this one request and is neither stored nor logged.
"""

import asyncio
import json
import logging
import math
import re
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import httpx
from cachetools import TTLCache

from app.ai import prompts
from app.ai.client import Budget, Usage
from app.ai.llm_schemas import NOTE_SCHEMA
from app.ai.normalize import _AIRPORTS, s
from app.context import Ctx
from app.core.config import USER_AGENT, Settings

log = logging.getLogger("trippzy.note")

TOMTOM = "https://api.tomtom.com"
DEPARTURE_KINDS = ("flight", "train", "bus")
LEAVE_PAD_MIN = 10  # parking / drop-off / finding the entrance
_cache: TTLCache[str, dict] = TTLCache(maxsize=500, ttl=600)

_GENERIC = {"railway", "station", "junction", "jn", "central", "bus", "stand", "terminus", "rly", "railways", "terminal", "airport", "international"}


# ─── Pure helpers (unit-tested) ─────────────────────────────────────


def _zone(name: str | None) -> ZoneInfo | None:
    try:
        return ZoneInfo(name) if name else None
    except Exception:
        return None


def to_instant(date: str | None, time: str | None, tz: str | None) -> datetime | None:
    """Wall-clock date + HH:mm in `tz` → an aware UTC datetime."""
    zone = _zone(tz)
    if not (date and time and zone):
        return None
    try:
        return datetime.strptime(f"{date} {time}", "%Y-%m-%d %H:%M").replace(tzinfo=zone).astimezone(UTC)
    except ValueError:
        return None


def local_label(instant: datetime, tz: str | None) -> str:
    z = _zone(tz) or UTC
    d = instant.astimezone(z)
    return f"{d:%a} {d.day} {d:%b}, {d:%H:%M}"


def clock(instant: datetime, tz: str | None) -> str:
    return instant.astimezone(_zone(tz) or UTC).strftime("%H:%M")


def _details(ticket: dict) -> dict:
    return (ticket.get("structured_data") or {}).get("details") or {}


def _first_segment(ticket: dict) -> dict:
    segs = _details(ticket).get("segments") or []
    return segs[0] if segs else {}


def _last_segment(ticket: dict) -> dict:
    segs = _details(ticket).get("segments") or []
    return segs[-1] if segs else {}


def departure_tz(ticket: dict, user_tz: str | None) -> str | None:
    """Flights depart on the airport's clock; trains and buses on the traveller's own."""
    if ticket["document_type"] == "flight":
        return (_first_segment(ticket).get("departure") or {}).get("timezone") or user_tz
    return user_tz


def arrival_tz(ticket: dict, user_tz: str | None) -> str | None:
    if ticket["document_type"] == "flight":
        return (_last_segment(ticket).get("arrival") or {}).get("timezone") or departure_tz(ticket, user_tz)
    return user_tz


def departure_instant(ticket: dict, user_tz: str | None) -> datetime | None:
    return to_instant(ticket.get("travel_date"), ticket.get("start_time"), departure_tz(ticket, user_tz))


def arrival_instant(ticket: dict, user_tz: str | None) -> datetime | None:
    return to_instant(ticket.get("end_date") or ticket.get("travel_date"), ticket.get("end_time"), arrival_tz(ticket, user_tz))


def buffer_minutes(ticket: dict) -> int:
    """How long before departure to be at the airport / station."""
    kind = ticket["document_type"]
    if kind == "flight":
        seg = _first_segment(ticket)
        dep, arr = seg.get("departure") or {}, seg.get("arrival") or {}
        international = bool(dep.get("country") and arr.get("country") and dep["country"] != arr["country"])
        return 180 if international else 120
    return 45 if kind == "train" else 30


def next_departures(tickets: list[dict], now: datetime, user_tz: str | None) -> list[tuple[datetime, dict]]:
    """Completed flights / trains / buses that haven't left yet (a 30-minute grace for one just departing), soonest first."""
    out = []
    for t in tickets:
        if t["document_type"] not in DEPARTURE_KINDS or t.get("processing_status") not in (None, "completed"):
            continue
        at = departure_instant(t, user_tz)
        if at and at >= now - timedelta(minutes=30):
            out.append((at, t))
    return sorted(out, key=lambda x: x[0])


def leave_and_arrive(dep: datetime, buffer_min: int, travel_seconds: int) -> tuple[datetime, datetime]:
    """(latest time to leave, time to be there) for a departure."""
    arrive_by = dep - timedelta(minutes=buffer_min)
    return arrive_by - timedelta(seconds=travel_seconds) - timedelta(minutes=LEAVE_PAD_MIN), arrive_by


# Typical minimum minutes between arriving on one ticket and departing on the next.
_MIN_CONNECT = {
    ("flight", "flight"): 90,
    ("flight", "train"): 120,
    ("flight", "bus"): 120,
    ("train", "flight"): 180,
    ("bus", "flight"): 180,
    ("train", "train"): 30,
    ("train", "bus"): 30,
    ("bus", "train"): 30,
    ("bus", "bus"): 20,
}


def connections(after: list[tuple[datetime, dict]], first: dict, user_tz: str | None, limit: int = 3) -> list[dict]:
    """How the following tickets connect to the one before them, with a 'tight' flag from typical minimum transfer times."""
    out: list[dict] = []
    prev = first
    for at, t in after[:limit]:
        prev_end = arrival_instant(prev, user_tz)
        gap = int((at - prev_end).total_seconds() // 60) if prev_end else None
        need = _MIN_CONNECT.get((prev["document_type"], t["document_type"]))
        out.append(
            {
                "ticket_id": t["_id"],
                "kind": t["document_type"],
                "title": t.get("title") or t["document_type"],
                "departs_local": local_label(at, departure_tz(t, user_tz)),
                "gap_minutes": gap,
                "tight": bool(gap is not None and need is not None and gap < need),
            }
        )
        prev = t
    return out


def haversine_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


# ─── TomTom ─────────────────────────────────────────────────────────


def _tokens(text: str) -> set[str]:
    return {w for w in re.findall(r"[a-z0-9]+", text.lower()) if w not in _GENERIC and len(w) > 1}


async def geocode_station(http: httpx.AsyncClient, key: str, name: str, city: str | None, kind: str, near: tuple[float, float]):
    """Find a train / bus station by name, preferring results whose name matches and that are closest to the traveller."""
    query = " ".join(x for x in (name, "railway station" if kind == "train" else "bus station", city) if x)
    try:
        r = await http.get(
            f"{TOMTOM}/search/2/search/{re.sub(r'[/?#]', ' ', query)}.json",
            params={"key": key, "limit": 8, "lat": near[0], "lon": near[1], "idxSet": "POI"},
            timeout=8,
        )
        results = r.json().get("results", []) if r.status_code == 200 else []
    except Exception:
        return None
    city_tokens = _tokens(city or "")
    want = _tokens(name) or city_tokens
    best, best_score = None, 0.0
    for res in results:
        score = station_score(res, want, city_tokens, kind, near)
        if score > best_score:
            pos = res["position"]
            best, best_score = {"lat": pos["lat"], "lon": pos["lon"], "name": (res.get("poi") or {}).get("name") or name}, score
    return best


def station_score(res: dict, want: set[str], city_tokens: set[str], kind: str, near: tuple[float, float]) -> float:
    """0 = not it. Needs the right kind of place and the station's own name in the result's name; words the ticket
    didn't mention cost points (so "Ranchi Railway Station" beats "Ranchi Railway Mail Service"); distance only breaks ties."""
    poi = res.get("poi") or {}
    cats = " ".join(poi.get("categories", [])).lower()
    if ("railway station" if kind == "train" else "bus") not in cats:
        return 0.0
    name_tokens = _tokens(poi.get("name", ""))
    hit = len(want & name_tokens)
    if hit == 0:
        return 0.0
    extra = len(name_tokens - want - city_tokens)
    pos = res["position"]
    return hit * 3 - 0.8 * extra - min(haversine_km(near, (pos["lat"], pos["lon"])) / 1000, 0.5) + 0.01


async def tomtom_route(http: httpx.AsyncClient, key: str, origin: tuple[float, float], dest: tuple[float, float], depart_at: datetime | None):
    params = {"key": key, "traffic": "true", "travelMode": "car", "computeTravelTimeFor": "all", "sectionType": "traffic"}
    if depart_at:
        params["departAt"] = depart_at.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    try:
        r = await http.get(f"{TOMTOM}/routing/1/calculateRoute/{origin[0]:.5f},{origin[1]:.5f}:{dest[0]:.5f},{dest[1]:.5f}/json", params=params, timeout=10)
        if r.status_code != 200:
            return None
        route = r.json()["routes"][0]
    except Exception:
        return None
    summ = route["summary"]
    sections = route.get("sections", [])
    count = lambda *cats: sum(1 for x in sections if x.get("simpleCategory") in cats)  # noqa: E731
    return {
        "seconds": summ["travelTimeInSeconds"],
        "meters": summ["lengthInMeters"],
        "delay_seconds": summ.get("trafficDelayInSeconds", 0),
        "jams": count("JAM"),
        "roadworks": count("ROAD_WORK"),
        "closures": count("ROAD_CLOSURE", "LANE_CLOSURE"),
    }


async def drive_plan(http: httpx.AsyncClient, key: str, origin, dest, dep: datetime, buffer_min: int, now: datetime):
    """Travel time with traffic AT the time they'd be driving: ask for now, then for the predicted leave time, twice."""
    route = await tomtom_route(http, key, origin, dest, None)
    if not route:
        return None, False
    live = (dep - timedelta(minutes=buffer_min) - now) < timedelta(minutes=45)
    if live:
        return route, True
    for _ in range(2):
        leave, _arrive = leave_and_arrive(dep, buffer_min, route["seconds"])
        if leave <= now + timedelta(minutes=1):
            break
        nxt = await tomtom_route(http, key, origin, dest, leave)
        if not nxt:
            break
        route = nxt
    return route, False


# ─── The note ───────────────────────────────────────────────────────


def _fallback_text(facts: dict) -> dict:
    leave, arrive = facts.get("leave_by"), facts.get("arrive_by")
    if leave and facts.get("route_checked"):
        body = f"Leave by {leave} to be at {facts['place']} by {arrive}. It's about {facts['distance_km']} km, roughly {facts['drive_minutes']} minutes"
        body += f" with traffic (+{facts['traffic_delay_minutes']} min)." if facts.get("traffic_delay_minutes") else "."
    else:
        body = f"Be at {facts['place']} by {arrive}. We couldn't check the road right now, so plan some extra time."
    return {"headline": f"Be at {facts['place']} by {arrive}"[:60], "body": body, "tips": []}


async def _word_it(ctx: Ctx, facts: dict) -> dict:
    try:
        out = await ctx.ai.structured(
            system=prompts.TRIPPZY_NOTE_SYSTEM,
            user=json.dumps(facts),
            schema_name="trippzy_note",
            schema=NOTE_SCHEMA,
            usage=Usage(),
            budget=Budget(25),
            max_tokens=900,
        )
        headline, body = s(out.get("headline"), 80), s(out.get("body"), 600)
        if headline and body:
            return {"headline": headline, "body": body, "tips": [t for t in (s(x, 100) for x in (out.get("tips") or [])[:3]) if t]}
    except Exception:
        log.warning("note wording failed; using the plain version")
    return _fallback_text(facts)


async def build_note(ctx: Ctx, user_id: str, trip: dict, tickets: list[dict], lat: float, lng: float, user_tz: str | None) -> dict:
    now = datetime.now(UTC)
    departures = next_departures(tickets, now, user_tz)
    if not departures:
        return {"state": "no_departure", "connections": [], "tips": []}
    dep_at, ticket = departures[0]
    key = f"{user_id}:{ticket['_id']}:{round(lat, 3)}:{round(lng, 3)}:{int(now.timestamp() // 600)}"
    if key in _cache:
        return _cache[key]

    settings: Settings = ctx.settings
    kind = ticket["document_type"]
    me = (lat, lng)
    tz = departure_tz(ticket, user_tz)
    buf = buffer_minutes(ticket)

    place: dict | None = None
    async with httpx.AsyncClient(follow_redirects=True, headers={"user-agent": USER_AGENT}) as http:
        if kind == "flight":
            code = (_first_segment(ticket).get("departure") or {}).get("airport_code")
            ap = _AIRPORTS.get(code or "")
            if ap:
                place = {"lat": ap["lat"], "lon": ap["lon"], "name": ap.get("name") or code}
        elif settings.tomtom_api_key:
            d = _details(ticket).get("departure") or {}
            if d.get("station") or d.get("city"):
                place = await geocode_station(http, settings.tomtom_api_key, d.get("station") or "", d.get("city"), kind, me)

        route, live = None, False
        if place and settings.tomtom_api_key:
            route, live = await drive_plan(http, settings.tomtom_api_key, me, (place["lat"], place["lon"]), dep_at, buf, now)

    leave_at, arrive_at = leave_and_arrive(dep_at, buf, route["seconds"] if route else 0)
    straight_km = round(haversine_km(me, (place["lat"], place["lon"])), 1) if place else None
    km = round(route["meters"] / 1000, 1) if route else straight_km
    delay_min = round(route["delay_seconds"] / 60) if route else 0
    conns = connections(departures[1:], ticket, user_tz)
    place_name = (place or {}).get("name") or (_details(ticket).get("departure") or {}).get("station") or "the departure point"

    facts = {
        "mode": kind,
        "ticket": ticket.get("title"),
        "departs": local_label(dep_at, tz),
        "be_there_by": clock(arrive_at, tz),
        "buffer_minutes": buf,
        "place": place_name,
        "route_checked": bool(route),
        "leave_by": clock(leave_at, tz) if route else None,
        "arrive_by": clock(arrive_at, tz),
        "distance_km": km,
        "drive_minutes": round(route["seconds"] / 60) if route else None,
        "traffic_delay_minutes": delay_min,
        "traffic_basis": "live" if live else "typical",
        "jams_on_route": route["jams"] if route else 0,
        "roadworks_on_route": route["roadworks"] if route else 0,
        "closures_on_route": route["closures"] if route else 0,
        "minutes_until_departure": int((dep_at - now).total_seconds() // 60),
        "next_after_this": conns,
    }
    words = await _word_it(ctx, facts)
    note = {
        "state": "ok",
        "ticket_id": ticket["_id"],
        "ticket_title": ticket.get("title"),
        "mode": kind,
        "place_name": place_name,
        "departs_local": local_label(dep_at, tz),
        "leave_by_local": facts["leave_by"],
        "arrive_by_local": facts["arrive_by"],
        "buffer_minutes": buf,
        "distance_km": km,
        "drive_minutes": facts["drive_minutes"],
        "traffic": {
            "delay_minutes": delay_min,
            "jams": facts["jams_on_route"],
            "roadworks": facts["roadworks_on_route"],
            "closures": facts["closures_on_route"],
            "basis": facts["traffic_basis"],
        }
        if route
        else None,
        "connections": conns,
        "route_checked": bool(route),
        **words,
    }
    _cache[key] = note
    return note


async def build_note_guarded(ctx: Ctx, user_id: str, trip: dict, tickets: list[dict], lat: float, lng: float, user_tz: str | None) -> dict:
    return await asyncio.wait_for(build_note(ctx, user_id, trip, tickets, lat, lng, user_tz), 40)
