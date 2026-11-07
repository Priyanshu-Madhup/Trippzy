import pytest


async def _me(client, headers):
    return (await client.get("/v1/me", headers=headers)).json()


@pytest.mark.asyncio
async def test_profile_details_and_derived_name(client, auth):
    h = auth()
    await _me(client, h)
    r = await client.patch("/v1/me", json={"first_name": "Priyanshu", "last_name": "Madhup", "gender": "male", "age": 21, "country": "in"}, headers=h)
    assert r.status_code == 200, r.text
    me = r.json()
    assert (me["first_name"], me["last_name"], me["gender"], me["age"], me["country"]) == ("Priyanshu", "Madhup", "male", 21, "IN")
    assert me["name"] == "Priyanshu Madhup"
    # changing only the last name rebuilds the full name from what is stored
    me = (await client.patch("/v1/me", json={"last_name": "Kumar"}, headers=h)).json()
    assert me["name"] == "Priyanshu Kumar"


@pytest.mark.asyncio
async def test_details_validate_and_can_be_cleared(client, auth):
    h = auth()
    await _me(client, h)
    assert (await client.patch("/v1/me", json={"age": 3}, headers=h)).status_code == 422
    assert (await client.patch("/v1/me", json={"gender": "robot"}, headers=h)).status_code == 422
    assert (await client.patch("/v1/me", json={"country": "India"}, headers=h)).status_code == 422
    await client.patch("/v1/me", json={"age": 30, "country": "IN"}, headers=h)
    me = (await client.patch("/v1/me", json={"age": None, "country": None}, headers=h)).json()
    assert me["age"] is None and me["country"] is None


@pytest.mark.asyncio
async def test_widget_order_is_cleaned_and_preferences_merge(client, auth):
    h = auth()
    await _me(client, h)
    await client.patch("/v1/me", json={"preferences": {"notifications": False}}, headers=h)
    # saving only the order must not reset the notifications switch
    me = (await client.patch("/v1/me", json={"preferences": {"home_widgets": ["news", "bogus", "hero", "news", "weather"]}}, headers=h)).json()
    assert me["preferences"]["notifications"] is False
    # hero is forced first, unknown dropped, duplicates removed, missing ones appended
    assert me["preferences"]["home_widgets"] == ["hero", "news", "weather", "note", "essentials", "about", "upcoming"]
    # and the order is kept when notifications change later
    me = (await client.patch("/v1/me", json={"preferences": {"notifications": True}}, headers=h)).json()
    assert me["preferences"]["home_widgets"][1] == "news"
    # null resets to the default order
    me = (await client.patch("/v1/me", json={"preferences": {"home_widgets": None}}, headers=h)).json()
    assert me["preferences"]["home_widgets"] is None
