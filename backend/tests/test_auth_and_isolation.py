"""Security properties: tokens are verified, and one user can never reach another's data."""

import pytest

from tests.conftest import make_token


async def test_requests_without_a_token_are_rejected(client):
    for path in ("/v1/me", "/v1/trips", "/v1/tickets/recent"):
        r = await client.get(path)
        assert r.status_code == 401 and r.json()["error"] == "unauthorized"


@pytest.mark.parametrize("kw", [{"issuer": "https://evil.example"}, {"exp_in": -3600}])
async def test_wrong_issuer_or_expired_token_rejected(client, rsa_key, kw):
    r = await client.get("/v1/me", headers={"authorization": f"Bearer {make_token(rsa_key, **kw)}"})
    assert r.status_code == 401


async def test_garbage_and_wrong_signature_rejected(client):
    assert (await client.get("/v1/me", headers={"authorization": "Bearer not.a.jwt"})).status_code == 401
    from cryptography.hazmat.primitives.asymmetric import rsa

    other = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    r = await client.get("/v1/me", headers={"authorization": f"Bearer {make_token(other)}"})
    assert r.status_code == 401


async def test_first_request_provisions_the_user(client, auth, ctx):
    assert await ctx.users.get("user_A") is None
    r = await client.get("/v1/me", headers=auth())
    assert r.status_code == 200 and r.json()["id"] == "user_A"
    assert r.json()["preferences"] == {"notifications": True, "home_widgets": None}
    assert await ctx.users.get("user_A") is not None


async def test_unauthorized_party_is_rejected(settings, ctx, rsa_key):
    import httpx

    from app.main import create_app

    s = settings.model_copy(update={"clerk_authorized_parties": "myapp://"})
    app = create_app(s, ctx)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
        bad = await c.get("/v1/me", headers={"authorization": f"Bearer {make_token(rsa_key, azp='https://other')}"})
        good = await c.get("/v1/me", headers={"authorization": f"Bearer {make_token(rsa_key, azp='myapp://')}"})
        none = await c.get("/v1/me", headers={"authorization": f"Bearer {make_token(rsa_key)}"})  # native: no azp
    assert (bad.status_code, good.status_code, none.status_code) == (401, 200, 200)


async def _make_trip(client, headers, name="Europe"):
    r = await client.post("/v1/trips", json={"name": name}, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def test_users_cannot_see_or_touch_each_others_trips(client, auth):
    trip_id = await _make_trip(client, auth("user_A"))
    b = auth("user_B")

    assert (await client.get("/v1/trips", headers=b)).json() == []
    assert (await client.get(f"/v1/trips/{trip_id}", headers=b)).status_code == 404
    assert (await client.patch(f"/v1/trips/{trip_id}", json={"name": "Hacked"}, headers=b)).status_code == 404
    assert (await client.delete(f"/v1/trips/{trip_id}", headers=b)).status_code == 404
    assert (await client.get(f"/v1/trips/{trip_id}/tickets", headers=b)).status_code == 404
    up = {"file_name": "x.pdf", "mime_type": "application/pdf", "size": 10}
    assert (await client.post(f"/v1/trips/{trip_id}/uploads", json=up, headers=b)).status_code == 404

    # …and the owner's trip is untouched.
    mine = (await client.get(f"/v1/trips/{trip_id}", headers=auth("user_A"))).json()
    assert mine["name"] == "Europe"


async def test_users_cannot_reach_each_others_tickets_or_files(client, auth, ctx):
    a = auth("user_A")
    trip_id = await _make_trip(client, a)
    up = await client.post(f"/v1/trips/{trip_id}/uploads", json={"file_name": "t.pdf", "mime_type": "application/pdf", "size": 100}, headers=a)
    tid = up.json()["ticket"]["id"]
    b = auth("user_B")

    for method, path in (
        ("GET", f"/v1/tickets/{tid}"),
        ("PATCH", f"/v1/tickets/{tid}"),
        ("DELETE", f"/v1/tickets/{tid}"),
        ("POST", f"/v1/tickets/{tid}/reprocess"),
        ("POST", f"/v1/tickets/{tid}/upload-complete"),
        ("GET", f"/v1/tickets/{tid}/file-url"),
        ("GET", f"/v1/tickets/{tid}/pages"),
    ):
        r = await client.request(method, path, json={} if method == "PATCH" else None, headers=b)
        assert r.status_code == 404, f"{method} {path} -> {r.status_code}"
    assert (await client.get("/v1/tickets/recent", headers=b)).json() == []


async def test_validation_errors_do_not_echo_input(client, auth):
    r = await client.post("/v1/trips", json={"name": "  ", "secret_note": "do-not-log-me"}, headers=auth())
    assert r.status_code == 422 and r.json()["error"] == "invalid_request"
    assert "do-not-log-me" not in r.text
    r = await client.post("/v1/trips", json={"name": "x", "start_date": "2026-10-10", "end_date": "2026-10-01"}, headers=auth())
    assert r.status_code == 422


async def test_rate_limit_returns_429(client, auth):
    from app.core.ratelimit import limiter

    for _ in range(30):
        limiter.check("user:user_A:place", 30, 60)
    r = await client.get("/v1/place-info?q=Paris", headers=auth())
    assert r.status_code == 429 and r.json()["error"] == "rate_limited"
