from app.services import resolvers as r


class Resp:
    def __init__(self, status=200, body=None, content=b"", ctype="image/png"):
        self.status_code, self._b, self.content, self.headers = status, body, content, {"content-type": ctype}

    def json(self):
        return self._b


async def test_the_booking_website_is_searched_too(monkeypatch):
    queries = []

    class Http:
        async def get(self, url, **kw):
            if "search" in url:
                q = kw["params"]["q"]
                queries.append(q)
                hit = [{"name": "Yatra Online", "domain": "yatra.com", "logo_url": "https://img.logo.dev/yatra.com?token=pk"}]
                return Resp(body=hit if q == "yatra.com" else [], ctype="application/json")
            return Resp(content=b"x" * 10)

    monkeypatch.setattr(r, "_min_side", lambda b: 128)
    out = await r._by_domain(Http(), r.Settings(logo_dev_token="t"), "yatra.com", "Yatra")
    assert "yatra.com" in queries and out and out["url"].startswith("https://img.logo.dev/yatra.com?token=pk")
    assert "token=t&" not in out["url"]  # the backend's own key never goes into a URL sent to phones


def test_known_platform_domains_from_a_bare_name():
    assert r._known_domain("Yatra.com") == "yatra.com"
    assert r._known_domain("MakeMyTrip") == "makemytrip.com"
    assert r._known_domain("Some Local Agency") is None
