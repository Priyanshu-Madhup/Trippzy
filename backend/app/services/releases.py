"""The newest GitHub Release of the app: its version, "what's new" notes and APK. Cached for a few minutes."""

import logging
import re
import time
from dataclasses import dataclass

import httpx

from app.core.config import USER_AGENT, Settings

log = logging.getLogger("trippzy.releases")

_TTL_S = 300
_cache: dict[str, tuple[float, "Release | None"]] = {}


@dataclass(frozen=True)
class Release:
    version: str
    notes: str
    published_at: str | None
    apk_name: str | None
    apk_size: int | None
    apk_api_url: str | None  # authenticated API URL of the asset (works for private repos)
    apk_public_url: str | None  # browser_download_url


def parse_version(v: str) -> tuple[int, ...]:
    """'v1.2.10' -> (1, 2, 10). Non-numeric parts are ignored, so '1.2.0-beta' sorts as 1.2.0."""
    nums = re.findall(r"\d+", v.split("-")[0].split("+")[0])
    return tuple(int(n) for n in nums[:4]) or (0,)


def is_newer(latest: str, current: str) -> bool:
    a, b = parse_version(latest), parse_version(current)
    n = max(len(a), len(b))
    return a + (0,) * (n - len(a)) > b + (0,) * (n - len(b))


def _headers(settings: Settings, accept: str = "application/vnd.github+json") -> dict[str, str]:
    h = {"Accept": accept, "User-Agent": USER_AGENT, "X-GitHub-Api-Version": "2022-11-28"}
    if settings.github_token:
        h["Authorization"] = f"Bearer {settings.github_token}"
    return h


def _from_json(j: dict) -> Release:
    apk = next((a for a in j.get("assets", []) if str(a.get("name", "")).lower().endswith(".apk")), None)
    return Release(
        version=str(j.get("tag_name", "")).lstrip("vV"),
        notes=(j.get("body") or "").strip(),
        published_at=j.get("published_at"),
        apk_name=apk.get("name") if apk else None,
        apk_size=apk.get("size") if apk else None,
        apk_api_url=apk.get("url") if apk else None,
        apk_public_url=apk.get("browser_download_url") if apk else None,
    )


async def latest_release(settings: Settings, http: httpx.AsyncClient | None = None) -> Release | None:
    """None when no repo is configured, there is no release yet, or GitHub can't be reached (and nothing is cached)."""
    repo = settings.github_repo.strip()
    if not repo:
        return None
    hit = _cache.get(repo)
    if hit and time.monotonic() - hit[0] < _TTL_S:
        return hit[1]
    try:
        url = f"https://api.github.com/repos/{repo}/releases/latest"
        if http:
            r = await http.get(url, headers=_headers(settings))
        else:
            async with httpx.AsyncClient(timeout=10, follow_redirects=True) as c:
                r = await c.get(url, headers=_headers(settings))
        if r.status_code == 404:
            rel = None
        else:
            r.raise_for_status()
            rel = _from_json(r.json())
    except httpx.HTTPError as e:
        log.warning("github release lookup failed: %s", type(e).__name__)
        return hit[1] if hit else None  # keep serving the last good answer
    _cache[repo] = (time.monotonic(), rel)
    return rel


async def apk_location(settings: Settings, rel: Release) -> str | None:
    """A URL the phone can download the APK from. Private repos: ask GitHub for a short-lived signed link."""
    if not settings.github_token:
        return rel.apk_public_url
    if not rel.apk_api_url:
        return None
    try:
        async with httpx.AsyncClient(timeout=10, follow_redirects=False) as c:
            r = await c.get(rel.apk_api_url, headers=_headers(settings, "application/octet-stream"))
        if r.status_code in (301, 302, 303, 307, 308):
            return r.headers.get("location")
    except httpx.HTTPError as e:
        log.warning("github asset lookup failed: %s", type(e).__name__)
    return None


def clear_cache() -> None:
    _cache.clear()
