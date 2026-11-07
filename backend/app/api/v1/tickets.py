import uuid

from fastapi import APIRouter, BackgroundTasks, Query, Response

from app.api.deps import AuthedUser, Ctx, CtxDep, IpGuard, UserDep
from app.api.v1.serializers import ticket_out
from app.core.errors import AppError, not_found
from app.core.ratelimit import user_limit
from app.db import now
from app.repositories.base import to_api
from app.schemas.api import DocumentRow, FileUrlOut, JobOut, PagesOut, TicketOut, TicketPatch, TicketWithTrip
from app.services.trip_intel import update_trip_from_tickets

router = APIRouter(prefix="/v1", tags=["tickets"], dependencies=[IpGuard])
_NO_RAW = {"raw_text": 0}


async def _refresh_trip(ctx: Ctx, user_id: str, trip_id: str) -> None:
    try:
        await update_trip_from_tickets(ctx, user_id, trip_id)
    except Exception:
        pass


async def _owned(ctx: Ctx, user: AuthedUser, ticket_id: str) -> dict:
    t = await ctx.tickets.get(user.id, ticket_id)
    if not t:
        raise not_found("Ticket")
    return t


@router.get("/trips/{trip_id}/tickets", response_model=list[TicketOut])
async def list_trip_tickets(trip_id: str, user: AuthedUser = UserDep, ctx: Ctx = CtxDep):
    if not await ctx.trips.get(user.id, trip_id):
        raise not_found("Trip")
    cursor = ctx.tickets.col.find({"user_id": user.id, "trip_id": trip_id}, _NO_RAW).sort([("travel_date", 1), ("start_time", 1), ("created_at", 1)])
    return [ticket_out(t) for t in await cursor.to_list(length=None)]


async def _tickets_with_trip(ctx: Ctx, user_id: str, limit: int) -> list[dict]:
    rows = await ctx.tickets.col.find({"user_id": user_id}, _NO_RAW).sort([("created_at", -1)]).limit(limit).to_list(length=None)
    trips = {t["_id"]: t for t in await ctx.trips.list(user_id)}
    out = []
    for r in rows:
        trip = trips.get(r["trip_id"])
        out.append({**ticket_out(r), "trip": {"id": trip["_id"], "name": trip["name"], "destination": trip.get("destination")} if trip else None})
    return out


@router.get("/tickets/recent", response_model=list[TicketWithTrip])
async def recent_tickets(limit: int = Query(6, ge=1, le=50), user: AuthedUser = UserDep, ctx: Ctx = CtxDep):
    return await _tickets_with_trip(ctx, user.id, limit)


@router.get("/tickets", response_model=list[TicketWithTrip])
async def all_tickets(limit: int = Query(300, ge=1, le=500), user: AuthedUser = UserDep, ctx: Ctx = CtxDep):
    """Every ticket across all of the user's trips, newest first (the Profile → Tickets screen)."""
    return await _tickets_with_trip(ctx, user.id, limit)


@router.get("/documents", response_model=list[DocumentRow])
async def all_documents(limit: int = Query(300, ge=1, le=500), user: AuthedUser = UserDep, ctx: Ctx = CtxDep):
    """Every uploaded file, newest first, with the trip and ticket it became (the Profile → Documents screen)."""
    docs = await ctx.documents.col.find({"user_id": user.id}).sort([("created_at", -1)]).limit(limit).to_list(length=None)
    trips = {t["_id"]: t for t in await ctx.trips.list(user.id)}
    by_doc: dict[str, dict] = {}
    async for t in ctx.tickets.col.find({"user_id": user.id, "document_id": {"$ne": None}}, {"raw_text": 0, "structured_data": 0}).sort([("created_at", 1)]):
        by_doc.setdefault(t["document_id"], t)
    out = []
    for d in docs:
        trip, ticket = trips.get(d.get("trip_id")), by_doc.get(d["_id"])
        out.append(
            {
                **{k: v for k, v in (to_api(d) or {}).items() if k in ("id", "file_name", "mime_type", "size", "status", "created_at")},
                "trip": {"id": trip["_id"], "name": trip["name"], "destination": trip.get("destination")} if trip else None,
                "ticket_id": ticket["_id"] if ticket else None,
                "ticket_title": (ticket.get("title") or ticket.get("file_name")) if ticket else None,
                "document_type": ticket.get("document_type") if ticket else None,
            }
        )
    return out


@router.get("/tickets/{ticket_id}", response_model=TicketOut)
async def get_ticket(ticket_id: str, user: AuthedUser = UserDep, ctx: Ctx = CtxDep):
    return ticket_out(await _owned(ctx, user, ticket_id))


@router.patch("/tickets/{ticket_id}", response_model=TicketOut)
async def patch_ticket(ticket_id: str, body: TicketPatch, bg: BackgroundTasks, user: AuthedUser = UserDep, ctx: Ctx = CtxDep):
    ticket = await _owned(ctx, user, ticket_id)
    sent = body.model_dump(exclude_unset=True)
    patch = {k: (v if v not in ("", None) else None) for k, v in sent.items()}
    edited = set(ticket.get("user_edits") or []) | {k for k in patch if k != "notes"}
    if "provider_name" in patch and (ticket.get("document_type") == "flight" or patch.get("document_type") == "flight"):
        patch.setdefault("airline_name", patch["provider_name"])
    updated = await ctx.tickets.update(user.id, ticket_id, {**patch, "user_edits": sorted(edited), "needs_review": False, "updated_at": now()})
    bg.add_task(_refresh_trip, ctx, user.id, ticket["trip_id"])  # edited dates / places can change the trip
    return ticket_out(updated or ticket)


@router.delete("/tickets/{ticket_id}", status_code=204)
async def delete_ticket(ticket_id: str, bg: BackgroundTasks, user: AuthedUser = UserDep, ctx: Ctx = CtxDep):
    ticket = await _owned(ctx, user, ticket_id)
    await ctx.tickets.delete(user.id, ticket_id)
    await ctx.jobs.col.delete_many({"user_id": user.id, "ticket_id": ticket_id})
    doc_id = ticket.get("document_id")
    # A round-trip document backs two tickets — keep the file while one still uses it.
    if doc_id and await ctx.tickets.count_for_document(user.id, doc_id) == 0:
        await ctx.storage.delete_prefix(f"u/{user.id}/{ticket['trip_id']}/{doc_id}/")
        await ctx.documents.delete(user.id, doc_id)
    bg.add_task(_refresh_trip, ctx, user.id, ticket["trip_id"])
    return Response(status_code=204)


@router.post("/tickets/{ticket_id}/reprocess", response_model=JobOut, status_code=202)
async def reprocess(ticket_id: str, user: AuthedUser = UserDep, ctx: Ctx = CtxDep):
    ticket = await _owned(ctx, user, ticket_id)
    if not ticket.get("document_id"):
        raise AppError(422, "invalid_file", "There is no original file to read.")
    active = await ctx.jobs.col.find_one({"user_id": user.id, "ticket_id": ticket_id, "status": {"$in": ["queued", "running"]}})
    if active:
        return _job_out(active)
    user_limit(user.id, "ai", 20, 600)
    await ctx.tickets.update(user.id, ticket_id, {"processing_status": "processing", "processing_stage": "queued", "error_message": None, "updated_at": now()})
    return _job_out(await ctx.jobs.enqueue(user.id, ticket_id, str(uuid.uuid4())))


def _job_out(job: dict) -> dict:
    return {"id": job["_id"], "ticket_id": job["ticket_id"], "status": job["status"], "stage": job.get("stage", "queued"), "error": job.get("error")}


@router.get("/jobs/{job_id}", response_model=JobOut)
async def get_job(job_id: str, user: AuthedUser = UserDep, ctx: Ctx = CtxDep):
    job = await ctx.jobs.get(user.id, job_id)
    if not job:
        raise not_found("Job")
    return _job_out(job)


async def _document_for(ctx: Ctx, user: AuthedUser, ticket_id: str) -> dict:
    ticket = await _owned(ctx, user, ticket_id)
    doc = await ctx.documents.get(user.id, ticket["document_id"]) if ticket.get("document_id") else None
    if not doc:
        raise not_found("File")
    return doc


@router.get("/tickets/{ticket_id}/file-url", response_model=FileUrlOut)
async def file_url(ticket_id: str, download: bool = False, user: AuthedUser = UserDep, ctx: Ctx = CtxDep):
    doc = await _document_for(ctx, user, ticket_id)
    ttl = ctx.settings.download_url_ttl_s
    url = ctx.storage.presign_get(doc["r2_key"], ttl, doc.get("file_name") if download else None)
    return {"url": url, "expires_in": ttl}


@router.get("/tickets/{ticket_id}/pages", response_model=PagesOut)
async def pdf_pages(ticket_id: str, user: AuthedUser = UserDep, ctx: Ctx = CtxDep):
    """Signed URLs for the rendered PDF page images (the in-app viewer and offline cache)."""
    doc = await _document_for(ctx, user, ticket_id)
    ttl = ctx.settings.download_url_ttl_s
    return {"pages": [ctx.storage.presign_get(k, ttl) for k in doc.get("page_keys") or []], "expires_in": ttl}
