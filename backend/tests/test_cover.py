import pytest

from app.core.config import Settings
from app.services import resolvers
from app.services.resolvers import _mentions, resolve_cover


def test_mentions_requires_the_place_word():
    assert _mentions("Aerial view of Bokaro Steel Plant", "Bokaro")
    assert not _mentions("A random beach", "Bokaro")
    assert _mentions("anything", None)


@pytest.mark.asyncio
async def test_cover_tries_queries_then_landmark_then_commons_and_stops_at_first_hit(monkeypatch):
    calls: list[str] = []

    async def unsplash(http, s, q, must=None):
        calls.append(f"unsplash:{q}:{must}")

    async def pexels(http, s, q, must=None):
        calls.append(f"pexels:{q}")

    async def wiki_title(http, title, must_match=None):
        calls.append(f"wiki:{title}")
        return {"url": "https://img/landmark.jpg", "source": "wikipedia", "attribution": "x"} if title == "Bokaro Steel Plant" else None

    async def commons(http, q, must):
        calls.append(f"commons:{q}")

    monkeypatch.setattr(resolvers, "_unsplash", unsplash)
    monkeypatch.setattr(resolvers, "_pexels", pexels)
    monkeypatch.setattr(resolvers, "_wiki_title", wiki_title)
    monkeypatch.setattr(resolvers, "_commons_search", commons)

    img = await resolve_cover(Settings(_env_file=None), "Bokaro Steel City", ["Bokaro Steel Plant aerial", "Bokaro lake"], "Bokaro Steel Plant")
    assert img["url"] == "https://img/landmark.jpg"
    # stock sites first (every query), then the landmark page; Commons never reached
    assert calls[0] == "unsplash:Bokaro Steel Plant aerial:Bokaro"
    assert calls.index("wiki:Bokaro Steel Plant") > calls.index("pexels:Bokaro lake")
    assert not any(c.startswith("commons") for c in calls)
