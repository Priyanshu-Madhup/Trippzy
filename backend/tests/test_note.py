from datetime import UTC, datetime, timedelta

import pytest

from app.services import trippzy_note as tn

UTC = UTC


def ticket(kind="train", date="2026-11-10", start="13:45", end="15:45", **extra):
    return {
        "_id": f"t-{kind}-{start}",
        "document_type": kind,
        "processing_status": "completed",
        "title": kind,
        "travel_date": date,
        "start_time": start,
        "end_date": date,
        "end_time": end,
        **extra,
    }


def test_instants_use_the_right_clock():
    # 13:45 in Kolkata (UTC+5:30) is 08:15 UTC
    assert tn.to_instant("2026-11-10", "13:45", "Asia/Kolkata") == datetime(2026, 11, 10, 8, 15, tzinfo=UTC)
    assert tn.to_instant("2026-11-10", None, "Asia/Kolkata") is None
    assert tn.to_instant("2026-11-10", "13:45", "Not/AZone") is None
    assert tn.clock(datetime(2026, 11, 10, 8, 15, tzinfo=UTC), "Asia/Kolkata") == "13:45"


def test_leave_by_adds_drive_buffer_and_pad():
    dep = datetime(2026, 11, 10, 9, 20, tzinfo=UTC)
    leave, arrive = tn.leave_and_arrive(dep, 120, 63 * 60)
    assert arrive == dep - timedelta(hours=2)
    assert leave == arrive - timedelta(minutes=63 + tn.LEAVE_PAD_MIN)


def test_buffers_by_mode_and_flight_type():
    dom = {"document_type": "flight", "structured_data": {"details": {"segments": [{"departure": {"country": "IN"}, "arrival": {"country": "IN"}}]}}}
    intl = {"document_type": "flight", "structured_data": {"details": {"segments": [{"departure": {"country": "IN"}, "arrival": {"country": "AE"}}]}}}
    assert (tn.buffer_minutes(dom), tn.buffer_minutes(intl)) == (120, 180)
    assert (tn.buffer_minutes({"document_type": "train"}), tn.buffer_minutes({"document_type": "bus"})) == (45, 30)


def test_next_departures_skips_past_and_non_transport():
    now = datetime(2026, 11, 10, 7, 0, tzinfo=UTC)  # 12:30 in Kolkata
    old = ticket(start="09:00")  # 03:30 UTC: long gone
    soon = ticket(start="13:45")
    hotel = ticket(kind="hotel", start="14:00")
    got = tn.next_departures([old, hotel, soon], now, "Asia/Kolkata")
    assert [t for _, t in got] == [soon]


def test_connection_gaps_flag_tight_transfers():
    flight = ticket(
        "flight",
        start="09:20",
        end="12:00",
        structured_data={"details": {"segments": [{"departure": {"timezone": "Asia/Kolkata"}, "arrival": {"timezone": "Asia/Kolkata"}}]}},
    )
    train = ticket("train", start="13:45")
    after = tn.next_departures([train], datetime(2026, 11, 10, 0, 0, tzinfo=UTC), "Asia/Kolkata")
    out = tn.connections(after, flight, "Asia/Kolkata")
    assert out[0]["gap_minutes"] == 105 and out[0]["tight"] is True  # flight -> train needs ~120


def test_station_matching_prefers_the_named_station_over_a_nearer_namesake():
    near = (23.3441, 85.3096)
    want, city = tn._tokens("RANCHI"), tn._tokens("Ranchi")

    def res(name, cats, lat, lon):
        return {"poi": {"name": name, "categories": cats}, "position": {"lat": lat, "lon": lon}}

    main = res("Ranchi Railway Station", ["railway station"], 23.3143, 85.3217)
    agora = res("Agora Railway Station", ["railway station"], 23.3395, 85.3085)
    mail = res("Ranchi Railway Mail Service", ["post office"], 23.31, 85.32)
    score = lambda r: tn.station_score(r, want, city, "train", near)  # noqa: E731
    assert score(main) > 0 and score(agora) == 0 and score(mail) == 0


@pytest.mark.asyncio
async def test_endpoint_builds_a_note_without_leaking_location(client, auth, monkeypatch, ctx):
    headers = auth()
    trip_id = (await client.post("/v1/trips", json={"name": "Trip"}, headers=headers)).json()["id"]
    ctx.settings.tomtom_api_key = "test-key"

    async def fake_route(http, key, origin, dest, depart_at):
        return {"seconds": 1800, "meters": 12000, "delay_seconds": 300, "jams": 1, "roadworks": 0, "closures": 0}

    async def fake_geocode(http, key, name, city, kind, near):
        return {"lat": 23.31, "lon": 85.32, "name": "Ranchi Railway Station"}

    monkeypatch.setattr(tn, "tomtom_route", fake_route)
    monkeypatch.setattr(tn, "geocode_station", fake_geocode)

    when = datetime.now(UTC) + timedelta(days=2)
    await ctx.tickets.insert(
        {
            "_id": "tk1",
            "user_id": "user_A",
            "trip_id": trip_id,
            "document_type": "train",
            "processing_status": "completed",
            "title": "Ranchi → Bokaro",
            "travel_date": when.strftime("%Y-%m-%d"),
            "start_time": "13:45",
            "end_date": when.strftime("%Y-%m-%d"),
            "end_time": "15:45",
            "structured_data": {"details": {"departure": {"station": "RANCHI", "city": "Ranchi"}}},
        }
    )
    r = await client.post(f"/v1/trips/{trip_id}/note", json={"lat": 23.34, "lng": 85.31, "timezone": "Asia/Kolkata"}, headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["state"] == "ok" and body["mode"] == "train" and body["place_name"] == "Ranchi Railway Station"
    assert body["route_checked"] is True and body["traffic"]["delay_minutes"] == 5 and body["traffic"]["jams"] == 1
    assert "lat" not in r.text and "85.31" not in r.text  # the position is never echoed back

    # another user can't ask about this trip
    other = await client.post(f"/v1/trips/{trip_id}/note", json={"lat": 1, "lng": 1}, headers=auth("user_B"))
    assert other.status_code == 404
