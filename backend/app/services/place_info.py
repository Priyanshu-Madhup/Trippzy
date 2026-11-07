"""Destination info for the Home dashboard: weather (Open-Meteo), local news (Google News RSS),
and a Wikipedia overview. Every source fails soft. (Trippy also scraped unofficial DuckDuckGo
endpoints; those are deliberately not used here.)"""

import asyncio
import re
from email.utils import parsedate_to_datetime
from urllib.parse import quote

import httpx
from cachetools import TTLCache

from app.core.config import USER_AGENT

UA = USER_AGENT
_cache: TTLCache[str, dict] = TTLCache(maxsize=300, ttl=20 * 60)
_cache_partial: TTLCache[str, dict] = TTLCache(maxsize=300, ttl=2 * 60)


def _wmo(code: int) -> str:
    if code == 0:
        return "Clear"
    if code <= 2:
        return "PartlyCloudy"
    if code == 3:
        return "Cloudy"
    if code <= 48:
        return "Foggy"
    if code <= 57:
        return "Drizzle"
    if code <= 67 or 80 <= code <= 82:
        return "Rain"
    if code <= 77 or code in (85, 86):
        return "Snow"
    return "Thunderstorms"


async def _weather(http: httpx.AsyncClient, place: str):
    try:
        geo = None
        # Try the full name, then progressively shorter forms ("Bokaro Steel City" -> "Bokaro Steel" -> "Bokaro",
        # "Paris, France" -> "Paris"), since the geocoder only knows canonical place names.
        parts = [p.strip() for p in place.split(",") if p.strip()]
        words = (parts[0] if parts else place).split()
        candidates = [place] + [" ".join(words[:n]) for n in range(len(words), 0, -1)]
        seen: set[str] = set()
        for cand in candidates:
            if not cand or cand.lower() in seen:
                continue
            seen.add(cand.lower())
            g = await http.get(f"https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&name={quote(cand)}", timeout=7)
            geo = (g.json().get("results") or [None])[0]
            if geo:
                break
        if not geo:
            return None
        r = await http.get(
            f"https://api.open-meteo.com/v1/forecast?latitude={geo['latitude']}&longitude={geo['longitude']}&timezone=auto&forecast_days=7"
            "&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day"
            "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
            timeout=7,
        )
        d = r.json()
        c, daily = d["current"], d["daily"]
        return {
            "source": "open-meteo",
            "location": ", ".join(x for x in (geo.get("name"), geo.get("country")) if x),
            "current": {
                "temperature": c["temperature_2m"],
                "feelsLike": c["apparent_temperature"],
                "condition": _wmo(c["weather_code"]),
                "humidity": c["relative_humidity_2m"] / 100,
                "wind": c["wind_speed_10m"],
                "daylight": c["is_day"] == 1,
            },
            "days": [
                {
                    "date": t,
                    "condition": _wmo(daily["weather_code"][i]),
                    "min": daily["temperature_2m_min"][i],
                    "max": daily["temperature_2m_max"][i],
                    "precipChance": (daily["precipitation_probability_max"][i] / 100) if daily["precipitation_probability_max"][i] is not None else None,
                }
                for i, t in enumerate(daily["time"])
            ],
        }
    except Exception:
        return None


def _decode(t: str) -> str:
    t = re.sub(r"<[^>]+>", "", t)
    for a, b in (("&amp;", "&"), ("&quot;", '"'), ("&#39;", "'"), ("&apos;", "'"), ("&lt;", "<"), ("&gt;", ">")):
        t = t.replace(a, b)
    return t.strip()


def _logo(item: str) -> str | None:
    """Publisher logo: Google News gives the outlet's site in `<source url="…">`; its icon comes from
    Google's favicon service (one request per outlet, no scraping of each publisher's HTML)."""
    m = re.search(r'<source[^>]*\burl="(https?://[^"/]+)', item)
    if not m:
        return None
    host = m.group(1).split("://", 1)[1].lower()
    if not re.fullmatch(r"[a-z0-9.-]+", host):
        return None
    return f"https://www.google.com/s2/favicons?sz=128&domain={host}"


async def _news(http: httpx.AsyncClient, place: str) -> list[dict]:
    try:
        r = await http.get(f"https://news.google.com/rss/search?q={quote(place)}&hl=en&gl=US&ceid=US:en", timeout=7)
        if r.status_code != 200:
            return []
        out = []
        for item in r.text.split("<item>")[1:9]:

            def tag(t: str, item=item):
                m = re.search(rf"<{t}[^>]*>([\s\S]*?)</{t}>", item)
                return re.sub(r"<!\[CDATA\[|\]\]>", "", m.group(1)).strip() if m else None

            source, title, link, pub = tag("source"), _decode(tag("title") or ""), tag("link") or "", tag("pubDate")
            if source and title.endswith(f" - {source}"):
                title = title[: -len(source) - 3]
            # Only http(s) links ever reach the app.
            if not (title and re.match(r"^https?://", link)):
                continue
            try:
                date = parsedate_to_datetime(pub).isoformat() if pub else None
            except Exception:
                date = None
            out.append({"title": title, "url": link, "source": source, "date": date, "image": None, "excerpt": None, "logo": _logo(item)})
        return out
    except Exception:
        return []


async def _about(http: httpx.AsyncClient, place: str):
    try:
        r = await http.get(
            f"https://en.wikipedia.org/api/rest_v1/page/summary/{quote(place.replace(' ', '_'))}?redirect=true",
            headers={"user-agent": UA},
            timeout=6,
        )
        if r.status_code != 200:
            return None
        d = r.json()
        if not d.get("extract") or d.get("type") == "disambiguation":
            return None
        return {
            "title": d["title"],
            "extract": d["extract"],
            "url": (d.get("content_urls", {}).get("desktop", {}).get("page")) or f"https://en.wikipedia.org/wiki/{quote(d['title'])}",
            "image": (d.get("thumbnail") or {}).get("source"),
        }
    except Exception:
        return None


async def get_place_info(place: str) -> dict:
    q = place.strip()[:80]
    key = q.lower()
    hit = _cache.get(key) or _cache_partial.get(key)
    if hit:
        return hit
    async with httpx.AsyncClient(follow_redirects=True) as http:
        weather, news, about = await asyncio.gather(_weather(http, q), _news(http, q), _about(http, q))
    info = {"query": q, "weather": weather, "news": news, "about": about}
    (_cache if weather and news else _cache_partial)[key] = info
    return info
