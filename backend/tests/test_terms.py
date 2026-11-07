import pytest

from app.core.legal import TERMS_VERSION


@pytest.mark.asyncio
async def test_new_user_has_not_accepted(client, auth):
    me = (await client.get("/v1/me", headers=auth())).json()
    assert me["terms_accepted_version"] is None and me["terms_accepted_at"] is None
    assert me["terms_current_version"] == TERMS_VERSION


@pytest.mark.asyncio
async def test_accepting_is_recorded_with_version_and_time(client, auth, ctx):
    h = auth()
    await client.get("/v1/me", headers=h)
    r = await client.post("/v1/me/terms", json={"version": TERMS_VERSION, "app_version": "1.0.0"}, headers=h)
    assert r.status_code == 200, r.text
    me = r.json()
    assert me["terms_accepted_version"] == TERMS_VERSION and me["terms_accepted_at"]
    stored = await ctx.users.get("user_A")
    assert stored["terms_history"][0]["version"] == TERMS_VERSION and stored["terms_history"][0]["app_version"] == "1.0.0"
    # still there after other profile changes
    me = (await client.patch("/v1/me", json={"age": 30}, headers=h)).json()
    assert me["terms_accepted_version"] == TERMS_VERSION


@pytest.mark.asyncio
async def test_accepting_twice_keeps_one_history_entry(client, auth, ctx):
    h = auth()
    await client.get("/v1/me", headers=h)
    first = (await client.post("/v1/me/terms", json={"version": TERMS_VERSION}, headers=h)).json()
    second = (await client.post("/v1/me/terms", json={"version": TERMS_VERSION}, headers=h)).json()
    assert len((await ctx.users.get("user_A"))["terms_history"]) == 1
    assert second["terms_accepted_at"] == first["terms_accepted_at"]  # the original time is kept


@pytest.mark.asyncio
async def test_an_outdated_version_is_refused(client, auth):
    h = auth()
    await client.get("/v1/me", headers=h)
    r = await client.post("/v1/me/terms", json={"version": "1999-01-01"}, headers=h)
    assert r.status_code == 409 and r.json()["error"] == "terms_changed"
    assert (await client.get("/v1/me", headers=h)).json()["terms_accepted_version"] is None


@pytest.mark.asyncio
async def test_acceptance_is_per_user_and_needs_sign_in(client, auth):
    await client.get("/v1/me", headers=auth("user_A"))
    await client.get("/v1/me", headers=auth("user_B"))
    await client.post("/v1/me/terms", json={"version": TERMS_VERSION}, headers=auth("user_A"))
    assert (await client.get("/v1/me", headers=auth("user_B"))).json()["terms_accepted_version"] is None
    assert (await client.post("/v1/me/terms", json={"version": TERMS_VERSION})).status_code == 401


@pytest.mark.asyncio
async def test_profile_lists_tickets_and_documents(client, auth, ctx):
    h = auth()
    trip_id = (await client.post("/v1/trips", json={"name": "Goa"}, headers=h)).json()["id"]
    up = await client.post(f"/v1/trips/{trip_id}/uploads", json={"file_name": "boarding.pdf", "mime_type": "application/pdf", "size": 1234}, headers=h)
    assert up.status_code == 201, up.text
    tickets = (await client.get("/v1/tickets", headers=h)).json()
    assert len(tickets) == 1 and tickets[0]["trip"]["name"] == "Goa"
    docs = (await client.get("/v1/documents", headers=h)).json()
    assert len(docs) == 1 and docs[0]["file_name"] == "boarding.pdf" and docs[0]["size"] == 1234
    assert docs[0]["trip"]["name"] == "Goa" and docs[0]["ticket_id"] == tickets[0]["id"]
    # nobody else sees them
    assert (await client.get("/v1/documents", headers=auth("user_B"))).json() == []
    assert (await client.get("/v1/tickets", headers=auth("user_B"))).json() == []
