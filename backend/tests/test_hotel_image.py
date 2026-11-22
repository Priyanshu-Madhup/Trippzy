from app.services import resolvers as r


def test_title_matches_the_property_not_the_neighbourhood():
    assert r._title_matches("Taj Mahal Palace Hotel", "The Taj Mahal Palace")
    assert r._title_matches("The Oberoi, Mumbai", "The Oberoi")
    assert not r._title_matches("Bandra–Worli Sea Link", "The Taj Mahal Palace")
    assert not r._title_matches("Taj Mahal", "The Taj Mahal Palace")
    assert not r._title_matches("Mumbai", "Hotel")


async def test_wiki_hotel_picks_matching_page(monkeypatch):
    async def fake(http, url, **kw):
        def page(t, i):
            return {"title": t, "index": i, "pageimage": f"{t}.jpg", "thumbnail": {"source": f"https://x/{i}.jpg", "width": 1800, "height": 1000}}

        return {"query": {"pages": {"1": page("Bandra–Worli Sea Link", 1), "2": page("Taj Mahal Palace Hotel", 2)}}}

    monkeypatch.setattr(r, "_get_json", fake)
    out = await r._wiki_hotel(None, "The Taj Mahal Palace", "Mumbai")
    assert out and out["url"] == "https://x/2.jpg"
