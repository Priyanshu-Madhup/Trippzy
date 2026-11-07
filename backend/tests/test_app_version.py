import httpx
import pytest

from app.core.config import Settings
from app.services import releases
from app.services.releases import Release, is_newer, parse_version


def test_version_comparison():
    assert parse_version("v1.2.10") == (1, 2, 10)
    assert is_newer("1.2.10", "1.2.9")
    assert is_newer("1.10.0", "1.9.9")
    assert not is_newer("1.0.0", "1.0")
    assert not is_newer("1.0.0", "1.0.0")
    assert is_newer("1.0.1", "1.0")


REL = Release(
    "1.1.0",
    "- Faster uploads\n- New share screen",
    "2026-11-08T10:00:00Z",
    "trippzy-1.1.0.apk",
    60_000_000,
    "https://api.github.com/a/1",
    "https://github.com/o/r/releases/download/v1.1.0/trippzy-1.1.0.apk",
)


@pytest.fixture(autouse=True)
def _fresh():
    releases.clear_cache()
    yield
    releases.clear_cache()


@pytest.fixture
def with_release(monkeypatch, settings):
    settings.github_repo = "o/r"
    settings.public_base_url = "https://api.test"

    async def fake(_settings, http=None):
        return REL

    monkeypatch.setattr("app.api.v1.app_version.latest_release", fake)


async def test_update_available_for_an_older_app(client, with_release):
    j = (await client.get("/v1/app/latest", params={"current": "1.0.0"})).json()
    assert j["update_available"] is True
    assert j["latest"] == "1.1.0" and "Faster uploads" in j["notes"]
    assert j["download_url"] == "https://api.test/v1/app/download"


async def test_no_update_when_current(client, with_release):
    j = (await client.get("/v1/app/latest", params={"current": "1.1.0"})).json()
    assert j["update_available"] is False and j["latest"] == "1.1.0"


async def test_download_redirects_to_the_apk(client, with_release):
    r = await client.get("/v1/app/download")
    assert r.status_code == 302 and r.headers["location"] == REL.apk_public_url


async def test_nothing_configured(client):
    j = (await client.get("/v1/app/latest")).json()
    assert j == {"latest": None, "update_available": False, "notes": "", "published_at": None, "size": None, "download_url": None}
    assert (await client.get("/v1/app/download")).status_code == 404


async def test_github_parsing_and_cache():
    calls = []

    def handler(request: httpx.Request):
        calls.append(request.url.path)
        return httpx.Response(
            200,
            json={
                "tag_name": "v2.0.0",
                "body": "Big update",
                "published_at": "x",
                "assets": [
                    {"name": "notes.txt", "url": "u0", "size": 1, "browser_download_url": "b0"},
                    {"name": "app.APK", "url": "u1", "size": 5, "browser_download_url": "b1"},
                ],
            },
        )

    s = Settings(_env_file=None, github_repo="o/r")
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        a = await releases.latest_release(s, http)
        b = await releases.latest_release(s, http)
    assert a == b and a.version == "2.0.0" and a.apk_name == "app.APK" and a.apk_public_url == "b1"
    assert len(calls) == 1  # second call came from the cache
