"""Upload → job → extraction → trip, end to end with fake storage and a fake model."""

import io
from datetime import timedelta

import pytest
from PIL import Image

from app.db import now
from app.services import trip_intel, worker
from app.services.resolvers import NONE_IMAGE

OCR = """EMIRATES e-ticket  PNR: QX7K2M  Flight EK 569  Boarding 03:30 Terminal 2
Bengaluru (BLR) to Dubai (DXB) 12 Oct 2026 airport check-in baggage 30kg Passenger: A KUMAR  Seat 24A"""

FLIGHT_JSON = {
    "confidence": 0.93,
    "title": "Bengaluru → Dubai",
    "summary": None,
    "booking_platform": {"name": None, "domain": None},
    "booking_reference": None,
    "primary_location": {"city": "Dubai", "country": "United Arab Emirates", "country_code": "AE"},
    "start_date": "2026-10-12",
    "end_date": None,
    "total_price": {"amount": None, "currency": None},
    "details": {
        "airline": {"name": "Emirates", "iata_code": "EK", "domain": "emirates.com"},
        "pnr": "QX7K2M",
        "segments": [
            {
                "flight_number": "EK569",
                "seat": "24A",
                "departure": {"airport_code": "BLR", "city": "Bengaluru", "date": "2026-10-12", "time": "04:15"},
                "arrival": {"airport_code": "DXB", "city": "Dubai", "date": "2026-10-12", "time": "06:30"},
            }
        ],
    },
}


def png_bytes() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (64, 64), "white").save(buf, "PNG")
    return buf.getvalue()


@pytest.fixture(autouse=True)
def _offline(monkeypatch):
    """No network: visuals and cover lookups resolve to nothing."""

    async def no_visuals(settings, ext):
        return {}

    async def no_image(*a, **k):
        return NONE_IMAGE

    monkeypatch.setattr(worker, "resolve_ticket_visuals", no_visuals)
    monkeypatch.setattr(trip_intel, "resolve_cover", no_image)


async def _trip(client, headers):
    return (await client.post("/v1/trips", json={"name": "New trip"}, headers=headers)).json()["id"]


async def _upload(client, ctx, headers, trip_id, data: bytes, mime="image/png", name="ticket.png"):
    r = await client.post(f"/v1/trips/{trip_id}/uploads", json={"file_name": name, "mime_type": mime, "size": len(data)}, headers=headers)
    assert r.status_code == 201, r.text
    body = r.json()
    key = (await ctx.documents.get("user_A", body["ticket"]["document_id"]))["r2_key"]
    assert body["upload"]["method"] == "PUT" and body["upload"]["headers"] == {"Content-Type": mime}
    assert key.startswith(f"u/user_A/{trip_id}/")
    ctx.storage.objects[key] = data  # what the app's PUT to the presigned URL would do
    return body["ticket"]["id"], key


async def test_upload_complete_queues_a_job(client, ctx, auth):
    a = auth()
    trip_id = await _trip(client, a)
    tid, _ = await _upload(client, ctx, a, trip_id, png_bytes())
    r = await client.post(f"/v1/tickets/{tid}/upload-complete", headers=a)
    assert r.status_code == 200 and r.json()["processing_status"] == "processing"
    assert await ctx.jobs.col.count_documents({"ticket_id": tid, "status": "queued"}) == 1
    # idempotent: a repeated call doesn't enqueue a second job
    await client.post(f"/v1/tickets/{tid}/upload-complete", headers=a)
    assert await ctx.jobs.col.count_documents({"ticket_id": tid}) == 1


async def test_complete_without_an_uploaded_object_is_a_conflict(client, ctx, auth):
    a = auth()
    trip_id = await _trip(client, a)
    r = await client.post(f"/v1/trips/{trip_id}/uploads", json={"file_name": "x.png", "mime_type": "image/png", "size": 10}, headers=a)
    r = await client.post(f"/v1/tickets/{r.json()['ticket']['id']}/upload-complete", headers=a)
    assert r.status_code == 409 and r.json()["error"] == "upload_missing"


async def test_a_file_whose_bytes_are_not_what_it_claims_is_deleted(client, ctx, auth):
    a = auth()
    trip_id = await _trip(client, a)
    tid, key = await _upload(client, ctx, a, trip_id, b"MZ\x90\x00 this is an executable", mime="application/pdf", name="evil.pdf")
    r = await client.post(f"/v1/tickets/{tid}/upload-complete", headers=a)
    assert r.status_code == 422 and r.json()["error"] == "invalid_file"
    assert key not in ctx.storage.objects and await ctx.tickets.get("user_A", tid) is None


async def test_oversize_declared_size_is_refused_before_any_url_is_issued(client, auth):
    a = auth()
    trip_id = await _trip(client, a)
    r = await client.post(f"/v1/trips/{trip_id}/uploads", json={"file_name": "big.pdf", "mime_type": "application/pdf", "size": 25 * 1024 * 1024}, headers=a)
    assert r.status_code == 413
    r = await client.post(f"/v1/trips/{trip_id}/uploads", json={"file_name": "x.exe", "mime_type": "application/x-msdownload", "size": 5}, headers=a)
    assert r.status_code == 422


async def _run_next_job(ctx):
    job = await ctx.jobs.claim()
    assert job is not None
    await worker.run_one(ctx, job)
    return job


async def test_worker_turns_an_upload_into_a_ticket_and_a_trip(client, ctx, auth):
    ctx.ai.ocr_text, ctx.ai.extraction = OCR, FLIGHT_JSON
    a = auth()
    trip_id = await _trip(client, a)
    tid, _ = await _upload(client, ctx, a, trip_id, png_bytes())
    await client.post(f"/v1/tickets/{tid}/upload-complete", headers=a)

    job = await _run_next_job(ctx)
    t = (await client.get(f"/v1/tickets/{tid}", headers=a)).json()
    assert t["processing_status"] == "completed" and t["document_type"] == "flight"
    assert (t["origin"], t["destination"], t["travel_date"], t["booking_reference"]) == ("Bengaluru", "Dubai", "2026-10-12", "QX7K2M")
    assert t["structured_data"]["details"]["segments"][0]["departure"]["timezone"] == "Asia/Kolkata"
    assert "raw_text" not in t  # OCR text never leaves the server

    trip = (await client.get(f"/v1/trips/{trip_id}", headers=a)).json()
    assert trip["destination"] == "Dubai" and trip["name"] == "Trip to Dubai"
    assert trip["start_date"] == "2026-10-12" and trip["country_code"] == "AE"
    assert {"place_name": "DXB", "place_type": "airport"}.items() <= {k: trip["places"][-1][k] for k in ("place_name", "place_type")}.items()

    done = await ctx.jobs.get("user_A", job["_id"])
    assert done["status"] == "done" and done["meta"]["doc_type"] == "flight"
    assert "raw_text" not in str(done["meta"])  # observability records numbers, never content


async def test_worker_marks_unreadable_documents_failed_without_retrying(client, ctx, auth):
    ctx.ai.ocr_text = "NO_TEXT_FOUND"
    a = auth()
    trip_id = await _trip(client, a)
    tid, _ = await _upload(client, ctx, a, trip_id, png_bytes())
    await client.post(f"/v1/tickets/{tid}/upload-complete", headers=a)
    job = await _run_next_job(ctx)
    t = (await client.get(f"/v1/tickets/{tid}", headers=a)).json()
    assert t["processing_status"] == "failed" and t["error_message"] == "Couldn't read this document."
    assert (await ctx.jobs.get("user_A", job["_id"]))["status"] == "failed"
    assert await ctx.jobs.claim() is None


async def test_user_edits_survive_a_re_read(client, ctx, auth):
    ctx.ai.ocr_text, ctx.ai.extraction = OCR, FLIGHT_JSON
    a = auth()
    trip_id = await _trip(client, a)
    tid, _ = await _upload(client, ctx, a, trip_id, png_bytes())
    await client.post(f"/v1/tickets/{tid}/upload-complete", headers=a)
    await _run_next_job(ctx)

    r = await client.patch(f"/v1/tickets/{tid}", json={"title": "My holiday flight", "notes": "window seat"}, headers=a)
    assert r.json()["user_edits"] == ["title"] and r.json()["needs_review"] is False

    assert (await client.post(f"/v1/tickets/{tid}/reprocess", headers=a)).status_code == 202
    await _run_next_job(ctx)
    t = (await client.get(f"/v1/tickets/{tid}", headers=a)).json()
    assert t["title"] == "My holiday flight" and t["notes"] == "window seat"  # kept
    assert t["origin"] == "Bengaluru"  # un-edited fields refresh from the new read


async def test_reprocess_does_not_double_enqueue(client, ctx, auth):
    a = auth()
    trip_id = await _trip(client, a)
    tid, _ = await _upload(client, ctx, a, trip_id, png_bytes())
    await client.post(f"/v1/tickets/{tid}/upload-complete", headers=a)
    r1 = await client.post(f"/v1/tickets/{tid}/reprocess", headers=a)
    r2 = await client.post(f"/v1/tickets/{tid}/reprocess", headers=a)
    assert r1.json()["id"] == r2.json()["id"]


async def test_deleting_the_last_ticket_removes_the_file(client, ctx, auth):
    a = auth()
    trip_id = await _trip(client, a)
    tid, key = await _upload(client, ctx, a, trip_id, png_bytes())
    assert (await client.delete(f"/v1/tickets/{tid}", headers=a)).status_code == 204
    assert key not in ctx.storage.objects
    assert await ctx.documents.col.count_documents({"user_id": "user_A"}) == 0


async def test_deleting_a_trip_removes_its_tickets_documents_and_files(client, ctx, auth):
    a = auth()
    trip_id = await _trip(client, a)
    await _upload(client, ctx, a, trip_id, png_bytes())
    assert (await client.delete(f"/v1/trips/{trip_id}", headers=a)).status_code == 204
    assert not ctx.storage.objects
    assert await ctx.tickets.col.count_documents({}) == 0 and await ctx.documents.col.count_documents({}) == 0


async def test_account_deletion_erases_everything_then_clerk(client, ctx, auth, monkeypatch):
    called = []

    async def fake_clerk(c, user_id):
        called.append(user_id)

    monkeypatch.setattr("app.api.v1.me._delete_clerk_user", fake_clerk)
    ctx.settings.clerk_secret_key = "sk_test_unit"
    a, b = auth("user_A"), auth("user_B")
    trip_a = await _trip(client, a)
    await _upload(client, ctx, a, trip_a, png_bytes())
    trip_b = await _trip(client, b)

    assert (await client.delete("/v1/me", headers=a)).status_code == 204
    assert called == ["user_A"]
    for col in (ctx.trips, ctx.tickets, ctx.documents, ctx.jobs):
        assert await col.col.count_documents({"user_id": "user_A"}) == 0
    assert await ctx.users.get("user_A") is None and "u/user_A/" in ctx.storage.deleted_prefixes
    assert (await client.get(f"/v1/trips/{trip_b}", headers=b)).status_code == 200  # others untouched


async def test_account_deletion_refuses_before_erasing_anything_when_clerk_is_not_configured(client, ctx, auth):
    a = auth("user_A")
    trip_id = await _trip(client, a)
    ctx.settings.clerk_secret_key = ""
    r = await client.delete("/v1/me", headers=a)
    assert r.status_code == 503 and r.json()["error"] == "server_not_configured"
    assert (await client.get(f"/v1/trips/{trip_id}", headers=a)).status_code == 200  # nothing was erased


async def test_user_trip_destination_is_not_overridden_by_ai(client, ctx, auth):
    ctx.ai.ocr_text, ctx.ai.extraction = OCR, FLIGHT_JSON
    a = auth()
    trip_id = (await client.post("/v1/trips", json={"name": "Gulf", "destination": "Muscat"}, headers=a)).json()["id"]
    tid, _ = await _upload(client, ctx, a, trip_id, png_bytes())
    await client.post(f"/v1/tickets/{tid}/upload-complete", headers=a)
    await _run_next_job(ctx)
    trip = (await client.get(f"/v1/trips/{trip_id}", headers=a)).json()
    assert trip["destination"] == "Muscat" and trip["destination_source"] == "user"


# ─── Job queue semantics ────────────────────────────────────────────


async def test_claim_is_exclusive_and_leases_expire(ctx):
    await ctx.jobs.enqueue("user_A", "t1", "j1")
    first = await ctx.jobs.claim()
    assert first["_id"] == "j1" and first["attempts"] == 1
    assert await ctx.jobs.claim() is None  # leased
    await ctx.jobs.col.update_one({"_id": "j1"}, {"$set": {"lease_until": now() - timedelta(seconds=1)}})
    again = await ctx.jobs.claim()  # crashed worker → picked up again
    assert again["_id"] == "j1" and again["attempts"] == 2


async def test_jobs_stop_after_max_attempts(ctx):
    await ctx.jobs.enqueue("user_A", "t1", "j1")
    for _ in range(ctx.jobs.MAX_ATTEMPTS):
        assert await ctx.jobs.claim() is not None
        await ctx.jobs.col.update_one({"_id": "j1"}, {"$set": {"lease_until": now() - timedelta(seconds=1)}})
    assert await ctx.jobs.claim() is None
    assert [j["_id"] for j in await ctx.jobs.exhausted()] == ["j1"]
