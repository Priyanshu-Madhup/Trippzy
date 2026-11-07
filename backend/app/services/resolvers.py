"""Destination / hotel / venue photos and provider logos (port of Trippy's resolvers).

Nothing is hard-coded: providers become domains or IATA codes, and those become logos;
destinations become photos. Every lookup fails soft (returns url=None → the app shows a
monogram / gradient). Candidates are probed server-side so the app never renders a broken image.
"""

import asyncio
import base64
import io
import ipaddress
import re
import socket
from urllib.parse import quote, urljoin, urlsplit

import httpx
from cachetools import TTLCache
from PIL import Image

from app.core.config import USER_AGENT, Settings

UA = USER_AGENT
_BAD_IMAGE = re.compile(r"\.svg|flag_of|coat_of_arms|locator|location_map|_map\.|map_of|logo|seal_of|emblem|blank|icon", re.I)
_images: TTLCache[str, dict] = TTLCache(maxsize=2000, ttl=7 * 86400)
_images_miss: TTLCache[str, dict] = TTLCache(maxsize=2000, ttl=3600)
_logos: TTLCache[str, dict] = TTLCache(maxsize=4000, ttl=7 * 86400)
_logos_miss: TTLCache[str, dict] = TTLCache(maxsize=4000, ttl=3600)
NONE_IMAGE = {"url": None, "source": None, "attribution": None}


async def _get_json(http: httpx.AsyncClient, url: str, **kw):
    try:
        r = await http.get(url, timeout=6, **kw)
        return r.json() if r.status_code == 200 else None
    except Exception:
        return None


# ─── Images ─────────────────────────────────────────────────────────


def _mentions(text: str, must: str | None) -> bool:
    """True when `must` (the place's key word) appears in `text`; always true when no word is required."""
    return not must or must.lower() in text.lower()


async def _unsplash(http, s: Settings, q: str, must: str | None = None):
    if not s.unsplash_access_key:
        return None
    d = await _get_json(
        http,
        f"https://api.unsplash.com/search/photos?query={quote(q)}&orientation=landscape&per_page=12&content_filter=high&order_by=relevant",
        headers={"authorization": f"Client-ID {s.unsplash_access_key}", "accept-version": "v1"},
    )

    def describes(p: dict) -> str:
        tags = " ".join(t.get("title", "") for t in p.get("tags") or [])
        return f"{p.get('alt_description') or ''} {p.get('description') or ''} {tags}"

    # Landscape, big enough for a full-bleed hero, and (for a named place) actually about that place.
    good = [p for p in (d or {}).get("results", []) if p["width"] >= max(p["height"] * 1.2, 2400) and _mentions(describes(p), must)]
    photo = max(good, key=lambda p: p.get("likes", 0), default=None)
    if not photo:
        return None
    return {
        "url": f"{photo['urls']['raw']}&w=1800&q=80&auto=format&fit=crop",
        "source": "unsplash",
        "attribution": f"Photo by {photo['user']['name']} on Unsplash",
    }


async def _pexels(http, s: Settings, q: str, must: str | None = None):
    if not s.pexels_api_key:
        return None
    d = await _get_json(
        http, f"https://api.pexels.com/v1/search?query={quote(q)}&orientation=landscape&per_page=15", headers={"authorization": s.pexels_api_key}
    )
    p = next((x for x in (d or {}).get("photos", []) if x["width"] >= 2400 and _mentions(x.get("alt") or "", must)), None)
    return {"url": p["src"]["large2x"], "source": "pexels", "attribution": f"Photo by {p['photographer']} on Pexels"} if p else None


async def _google_places(http, s: Settings, q: str):
    if not s.google_places_api_key:
        return None
    try:
        r = await http.post(
            "https://places.googleapis.com/v1/places:searchText",
            headers={"x-goog-api-key": s.google_places_api_key, "x-goog-fieldmask": "places.photos"},
            json={"textQuery": q, "maxResultCount": 1},
            timeout=6,
        )
        photo = (((r.json().get("places") or [{}])[0]).get("photos") or [None])[0] if r.status_code == 200 else None
    except Exception:
        return None
    if not photo:
        return None
    media = await _get_json(
        http,
        f"https://places.googleapis.com/v1/{photo['name']}/media?maxWidthPx=1600&skipHttpRedirect=true",
        headers={"x-goog-api-key": s.google_places_api_key},
    )
    if not (media and media.get("photoUri")):
        return None
    author = ((photo.get("authorAttributions") or [{}])[0]).get("displayName")
    return {"url": media["photoUri"], "source": "google_places", "attribution": f"Photo by {author} · Google" if author else "Google"}


def _pick_wiki(pages: list[dict], landscape: bool):
    for page in sorted(pages, key=lambda p: p.get("index", 0)):
        t = page.get("thumbnail")
        if not t or _BAD_IMAGE.search(page.get("pageimage") or t["source"]) or t["width"] < 640:
            continue
        if landscape and t["width"] < t["height"] * 1.1:
            continue
        return {"url": t["source"], "source": "wikipedia", "attribution": f"Wikimedia Commons · {page['title']}"}
    return None


async def _wiki_title(http, title: str, must_match: str | None = None):
    d = await _get_json(
        http,
        f"https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1&prop=pageimages&pithumbsize=1800&titles={quote(title)}",
        headers={"user-agent": UA},
    )
    pages = [p for p in ((d or {}).get("query", {}).get("pages", {})).values() if "missing" not in p]
    if must_match:
        want = must_match.lower().split()[0]
        if not any(want in p["title"].lower() for p in pages):
            return None
    return _pick_wiki(pages, landscape=False)


async def _wiki_search(http, query: str):
    d = await _get_json(
        http,
        f"https://en.wikipedia.org/w/api.php?action=query&format=json&generator=search&gsrlimit=8&prop=pageimages&pithumbsize=1800&gsrsearch={quote(query)}",
        headers={"user-agent": UA},
    )
    return _pick_wiki(list(((d or {}).get("query", {}).get("pages", {})).values()), landscape=True)


async def _commons_search(http, query: str, must: str | None):
    """Search Wikimedia Commons photos (no API key). Keeps large landscape JPEGs whose file name mentions the place."""
    d = await _get_json(
        http,
        "https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=25"
        f"&gsrsearch={quote(query + ' filetype:bitmap')}&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=1800",
        headers={"user-agent": UA},
    )
    pages = sorted(((d or {}).get("query", {}).get("pages", {})).values(), key=lambda p: p.get("index", 0))
    for page in pages:
        info = (page.get("imageinfo") or [{}])[0]
        title = page.get("title", "")
        w, h = info.get("width", 0), info.get("height", 0)
        if info.get("mime") != "image/jpeg" or w < 2400 or not (1.25 <= w / max(h, 1) <= 2.4):
            continue
        if _BAD_IMAGE.search(title) or not _mentions(title, must) or not info.get("thumburl"):
            continue
        return {"url": info["thumburl"], "source": "wikimedia_commons", "attribution": f"Wikimedia Commons · {title.removeprefix('File:')}"}
    return None


async def resolve_cover(s: Settings, place: str, queries: list[str], landmark: str | None = None) -> dict:
    """The best cover photo for a destination. `queries` are scene descriptions written by the model (most specific
    first), `landmark` the Wikipedia title of its best-known sight. Stock-photo sites are tried first (they have the
    most beautiful photos, when API keys are set), then the landmark's own Wikipedia page, then Wikimedia Commons.
    Every candidate must actually mention the place, so a vague match never wins over a plain-but-correct photo."""
    place = place.strip()[:80]
    qs = [q.strip()[:120] for q in queries if q and q.strip()][:4] or [f"{place} skyline"]
    key = f"cover:{place.lower()}:{'|'.join(q.lower() for q in qs)}:{(landmark or '').lower()}"
    hit = _images.get(key) or _images_miss.get(key)
    if hit:
        return hit
    must = re.sub(r"[^\w]", "", place.split(",")[0].split()[0]) if place else None
    result = NONE_IMAGE
    async with httpx.AsyncClient(follow_redirects=True) as http:
        tasks = []
        for q in qs:
            tasks += [(lambda q=q: _unsplash(http, s, q, must)), (lambda q=q: _pexels(http, s, q, must))]
        if landmark:
            tasks.append(lambda: _wiki_title(http, landmark))
        for q in qs:
            tasks.append(lambda q=q: _commons_search(http, q, must))
        tasks += [lambda: _wiki_title(http, place), lambda: _wiki_search(http, f"{place} skyline")]
        for t in tasks:
            try:
                r = await t()
            except Exception:
                r = None
            if r and r.get("url"):
                result = r
                break
    (_images if result["url"] else _images_miss)[key] = result
    return result


async def resolve_image(s: Settings, query: str, kind: str, context: str | None = None) -> dict:
    q, ctx = query.strip()[:120], (context or "").strip()[:80]
    key = f"{kind}:{q.lower()}:{ctx.lower()}"
    hit = _images.get(key) or _images_miss.get(key)
    if hit:
        return hit
    async with httpx.AsyncClient(follow_redirects=True) as http:
        if kind == "destination":
            photo_q = q if re.search(r"skyline|landmark|view|city", q, re.I) else f"{q} skyline"
            place = re.sub(r"\s+(skyline|landmark|cityscape|city)\b.*$", "", q, flags=re.I)
            tasks = [
                lambda: _unsplash(http, s, photo_q),
                lambda: _pexels(http, s, photo_q),
                lambda: _wiki_title(http, place),
                lambda: _wiki_search(http, f"{place} skyline"),
                lambda: _wiki_search(http, place),
            ]
        elif kind == "hotel":
            full = f"{q} {ctx}".strip()
            tasks = [lambda: _google_places(http, s, full), lambda: _wiki_title(http, q, q)]
        else:
            full = f"{q} {ctx}".strip()
            tasks = [lambda: _wiki_title(http, q, q), lambda: _unsplash(http, s, full), lambda: _pexels(http, s, full)]
        result = NONE_IMAGE
        for t in tasks:
            r = await t()
            if r and r.get("url"):
                result = r
                break
    (_images if result["url"] else _images_miss)[key] = result
    return result


# ─── Logos ──────────────────────────────────────────────────────────


async def _probe(http: httpx.AsyncClient, url: str) -> tuple[bool, int, bytes]:
    try:
        r = await http.get(url, timeout=4.5)
        if r.status_code != 200 or not r.headers.get("content-type", "").startswith("image/"):
            return False, 0, b""
        return len(r.content) > 300, len(r.content), r.content[:64]
    except Exception:
        return False, 0, b""


_airline_placeholder: tuple[bool, int, bytes] | None = None


def _airline_url(code: str) -> str:
    return f"https://images.kiwi.com/airlines/128x128/{code}.png"


async def _airline_by_iata(http, code: str) -> str | None:
    """The airline CDN returns a generic placeholder (HTTP 200) for unknown codes — learn its
    signature once by asking for an invalid code."""
    global _airline_placeholder
    if _airline_placeholder is None:
        _airline_placeholder = await _probe(http, _airline_url("ZZ"))
    cand = await _probe(http, _airline_url(code))
    if not cand[0]:
        return None
    if _airline_placeholder[0] and _airline_placeholder[1] == cand[1] and _airline_placeholder[2] == cand[2]:
        return None
    return _airline_url(code)


def _is_public_host(host: str) -> bool:
    """The domain comes from a user's document (via the model), so never fetch private/loopback addresses."""
    try:
        infos = socket.getaddrinfo(host, None)
    except OSError:
        return False
    return bool(infos) and all(ipaddress.ip_address(i[4][0]).is_global for i in infos)


_LINK_TAG = re.compile(r"<link\b[^>]*>", re.I)
_META_OG = re.compile(r"<meta\b[^>]*>", re.I)


def _attr(tag: str, name: str) -> str | None:
    m = re.search(rf"""\b{name}\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))""", tag, re.I)
    return (m.group(1) or m.group(2) or m.group(3)) if m else None


def _icon_candidates(html: str, base: str) -> list[str]:
    """Icons declared in the page's <head>, best first: apple-touch-icon (usually a clean 180px logo), then the
    largest declared icon, then og:image, then /favicon.ico."""
    scored: list[tuple[int, str]] = []
    for tag in _LINK_TAG.findall(html[:200_000]):
        rel, href = (_attr(tag, "rel") or "").lower(), _attr(tag, "href")
        if not href or "icon" not in rel or "mask-icon" in rel:
            continue
        sizes = _attr(tag, "sizes") or ""
        px = int(m.group(1)) if (m := re.match(r"(\d+)x\d+", sizes)) else 0
        scored.append(((1000 if "apple-touch" in rel else 0) + px, urljoin(base, href)))
    out = [u for _, u in sorted(scored, key=lambda x: -x[0])]
    for tag in _META_OG.findall(html[:200_000]):
        if (_attr(tag, "property") or "").lower() == "og:image" and (c := _attr(tag, "content")):
            out.append(urljoin(base, c))
    out.append(urljoin(base, "/favicon.ico"))
    return [u for u in dict.fromkeys(out) if _usable_icon_url(u)]


_MAX_DATA_ICON = 40_000  # inline icons (e.g. IRCTC) are small; refuse anything big


def _usable_icon_url(u: str) -> bool:
    if u.startswith("data:image/"):
        return len(u) <= _MAX_DATA_ICON and ";base64," in u[:60] and not u.startswith("data:image/svg")
    return u.startswith(("http://", "https://")) and not u.lower().split("?")[0].endswith(".svg")


async def _fetch_public(http: httpx.AsyncClient, url: str, hops: int = 3):
    """GET with manual redirects so every hop is checked against the public-host rule."""
    for _ in range(hops + 1):
        host = urlsplit(url).hostname or ""
        if not _is_public_host(host):
            return None
        r = await http.get(url, timeout=5, follow_redirects=False)
        if r.is_redirect and (loc := r.headers.get("location")):
            url = urljoin(url, loc)
            continue
        return r
    return None


def _min_side(data: bytes) -> int:
    """Smaller side of an image in pixels (0 if it can't be decoded)."""
    try:
        with Image.open(io.BytesIO(data)) as im:
            return min(im.size)
    except Exception:
        return 0


_SHARP = 96  # a site icon at least this big is used as-is; smaller ones lose to a brand-logo lookup


async def _from_official_site(http: httpx.AsyncClient, domain: str) -> tuple[str, int] | None:
    """Read the company's own page and pick its declared icon. Returns (url, pixels) for the sharpest of the first
    few that load as real images, stopping early at one that is sharp enough."""
    best: tuple[str, int] | None = None
    try:
        page = await _fetch_public(http, f"https://{domain}/")
        if page is None or page.status_code != 200:
            return None
        for url in _icon_candidates(page.text, str(page.url))[:5]:
            if url.startswith("data:"):
                # Some sites (IRCTC) embed their icon in the page itself; it's already in hand, no request needed.
                try:
                    data = base64.b64decode(url.split(";base64,", 1)[1], validate=False)
                except ValueError:
                    continue
            else:
                img = await _fetch_public(http, url)
                if img is None or img.status_code != 200 or not img.headers.get("content-type", "").startswith("image/"):
                    continue
                data = img.content
            if len(data) <= 300:
                continue
            px = _min_side(data)
            if px >= _SHARP:
                return url, px
            if best is None or px > best[1]:
                best = (url, px)
    except Exception:
        return best
    return best


def _norm(x: str) -> str:
    return re.sub(r"[^a-z0-9]", "", x.lower())


async def _logo_by_name(http: httpx.AsyncClient, s: Settings, name: str) -> str | None:
    """logo.dev brand search by company name. Several entries can share a name (e.g. a stale and a current
    domain), so probe each exact-name match and keep the most detailed image."""
    if not (s.logo_dev_token and name):
        return None
    try:
        r = await http.get("https://api.logo.dev/search", params={"q": name}, headers={"Authorization": f"Bearer {s.logo_dev_token}"}, timeout=6)
        if r.status_code != 200:
            return None
        matches = [x for x in r.json()[:8] if _norm(x.get("name", "")) == _norm(name) and str(x.get("logo_url", "")).startswith("https://img.logo.dev/")]
        best: tuple[str, int] | None = None
        for x in matches[:3]:
            url = f"{x['logo_url']}&size=128&format=png&fallback=404"
            img = await http.get(url, timeout=6)
            if img.status_code == 200 and img.headers.get("content-type", "").startswith("image/") and _min_side(img.content) >= 64:
                if best is None or len(img.content) > best[1]:
                    best = (url, len(img.content))
        return best[0] if best else None
    except Exception:
        return None


async def _by_domain(http, s: Settings, domain: str | None, name: str | None = None):
    """1) The company's own site icon, if sharp. 2) Brand-logo lookup by name. 3) Whatever small official icon
    we found. 4) Favicon services."""
    # A curated brand logo beats a site icon: government/corporate sites often declare a crest or emblem as their
    # icon (indianrailways.gov.in publishes the national emblem), which isn't the brand's logo.
    if name and (url := await _logo_by_name(http, s, name)):
        return {"url": url, "source": "logo.dev"}
    site = await _from_official_site(http, domain) if domain else None
    if site:
        return {"url": site[0], "source": "official_site"}
    if not domain:
        return None
    cands = [
        (f"https://www.google.com/s2/favicons?domain={domain}&sz=128", "google_favicon"),
        (f"https://icons.duckduckgo.com/ip3/{domain}.ico", "duckduckgo"),
    ]
    for url, source in cands:
        if (await _probe(http, url))[0]:
            return {"url": url, "source": source}
    return None


async def resolve_logo(s: Settings, *, kind: str, name: str | None, domain: str | None, iata: str | None) -> dict:
    iata_c = re.sub(r"[^A-Z0-9]", "", (iata or "").upper()) or None
    dom = re.sub(r"^www\.", "", re.sub(r"^https?://", "", (domain or "").lower())).split("/")[0] or None
    key = f"{kind}:{iata_c or ''}:{dom or ''}:{(name or '').lower()}"
    hit = _logos.get(key) or _logos_miss.get(key)
    if hit:
        return hit
    result = {"url": None, "source": None, "domain": dom}
    async with httpx.AsyncClient(follow_redirects=True, headers={"user-agent": UA}) as http:
        if kind == "airline" and iata_c and len(iata_c) == 2:
            url = await _airline_by_iata(http, iata_c)
            if url:
                result = {"url": url, "source": "airline_cdn", "domain": dom}
        valid_dom = dom if dom and re.fullmatch(r"[a-z0-9-]+(\.[a-z0-9-]+)+", dom) else None
        if not result["url"] and (valid_dom or name):
            h = await _by_domain(http, s, valid_dom, name)
            if h:
                result = {"url": h["url"], "source": h["source"], "domain": dom}
    (_logos if result["url"] else _logos_miss)[key] = result
    return result


async def resolve_ticket_visuals(s: Settings, ext) -> dict:
    """Logos (airline, booking platform, operator) and imagery for an extraction, in parallel."""
    patch: dict = {}
    jobs: dict[str, asyncio.Future] = {}
    t, d = ext.document_type, ext.details

    if ext.booking_platform.name and ext.booking_platform.domain:
        jobs["booking_platform_logo_url"] = resolve_logo(s, kind="platform", name=ext.booking_platform.name, domain=ext.booking_platform.domain, iata=None)
    if t == "flight":
        jobs["airline_logo_url"] = resolve_logo(s, kind="airline", name=d.airline.name, domain=d.airline.domain, iata=d.airline.iata_code)
    elif t == "hotel":
        if d.hotel.name:
            jobs["image_url"] = _hotel_image(s, d.hotel.name, d.hotel.city or ext.primary_location.city)
        if d.hotel.domain:
            jobs["provider_logo_url"] = resolve_logo(s, kind="provider", name=d.hotel.name, domain=d.hotel.domain, iata=None)
    elif t in ("train", "bus"):
        if d.operator.domain:
            jobs["provider_logo_url"] = resolve_logo(s, kind="provider", name=d.operator.name, domain=d.operator.domain, iata=None)
    elif t == "activity":
        name = d.venue or d.name
        if name:
            jobs["image_url"] = _place_image(s, name, d.city or ext.primary_location.city)

    results = await asyncio.gather(*jobs.values(), return_exceptions=True)
    for key, res in zip(jobs, results, strict=True):
        if isinstance(res, dict):
            patch[key] = res.get("url")
    return patch


async def _hotel_image(s, name, city):
    r = await resolve_image(s, name, "hotel", city)
    return r if r["url"] or not city else await resolve_image(s, city, "destination")


async def _place_image(s, name, city):
    r = await resolve_image(s, name, "place", city)
    return r if r["url"] or not city else await resolve_image(s, city, "destination")
