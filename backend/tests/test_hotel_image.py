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


async def test_logo_search_accepts_name_variants_and_the_booking_domain():
    class Resp:
        def __init__(self, status=200, body=None, content=b"", ctype="application/json"):
            self.status_code, self._b, self.content, self.headers = status, body, content, {"content-type": ctype}

        def json(self):
            return self._b

    class Http:
        async def get(self, url, **kw):
            if "search" in url:
                q = kw["params"]["q"]
                # "Yatra.com" finds nothing by name; the bare "Yatra" finds the brand
                return Resp(body=[] if q == "Yatra.com" else [{"name": "Yatra", "domain": "yatra.com", "logo_url": "https://img.logo.dev/yatra.com?token=t"}])
            return Resp(content=b"x" * 10, ctype="image/png")

    s = r.Settings(logo_dev_token="t")
    r._min_side = lambda b: 128  # the stub image has no real pixels
    assert r._name_forms("Yatra.com") == ["Yatra.com", "Yatra"]
    assert (await r._logo_by_name(Http(), s, "Yatra.com", "yatra.com")).startswith("https://img.logo.dev/yatra.com")
