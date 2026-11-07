import asyncio
import uuid

from fastapi import APIRouter, BackgroundTasks, Response

from app.api.deps import AuthedUser, Ctx, CtxDep, IpGuard, UserDep
from app.api.v1.serializers import trip_out
from app.core.errors import not_found
from app.db import now
from app.repositories.base import to_api
from app.schemas.api import TripCreate, TripOut, TripPatch, TripWithStats
from app.services.trip_intel import country_code_from_name, refresh_trip_cover

router = APIRouter(prefix="/v1/trips", tags=["trips"], dependencies=[IpGuard])


async def _cover_in_background(ctx: Ctx, user_id: str, trip_id: str, destination: str) -> None:
    trip = await ctx.trips.get(user_id, trip_id)
    if trip:
        try:
            await refresh_trip_cover(ctx, trip)
        except Exception:
            pass


@router.get("", response_model=list[TripWithStats])
async def list_trips(user: AuthedUser = UserDep, ctx: Ctx = CtxDep):
    trips = await ctx.trips.list(user.id, sort=[("start_date", 1), ("created_at", -1)])
    rows = await ctx.tickets.col.find({"user_id": user.id}, {"document_type": 1, "processing_status": 1, "trip_id": 1}).to_list(length=None)
    by_trip: dict[str, list[dict]] = {}
    for r in rows:
        by_trip.setdefault(r["trip_id"], []).append({"id": r["_id"], "document_type": r["document_type"], "processing_status": r["processing_status"]})
    return [{**trip_out(t), "tickets": by_trip.get(t["_id"], [])} for t in trips]


@router.post("", response_model=TripOut, status_code=201)
async def create_trip(body: TripCreate, bg: BackgroundTasks, user: AuthedUser = UserDep, ctx: Ctx = CtxDep):
    destination = body.destination or None
    code = country_code_from_name(destination)
    t = now()
    doc = {
        "_id": str(uuid.uuid4()),
        "user_id": user.id,
        "name": body.name,
        "destination": destination,
        # A destination typed by the user is never overridden by AI inference.
        "destination_source": "user" if destination else "ai",
        "country": destination if code else None,
        "country_code": code,
        "start_date": body.start_date,
        "end_date": body.end_date,
        "cover_image_url": None,
        "cover_image_source": None,
        "cover_image_attribution": None,
        "cover_image_query": None,
        "places": [],
        "created_at": t,
        "updated_at": t,
    }
    await ctx.trips.insert(doc)
    if destination:
        bg.add_task(_cover_in_background, ctx, user.id, doc["_id"], destination)
    return trip_out(doc)


@router.get("/{trip_id}", response_model=TripOut)
async def get_trip(trip_id: str, user: AuthedUser = UserDep, ctx: Ctx = CtxDep):
    trip = await ctx.trips.get(user.id, trip_id)
    if not trip:
        raise not_found("Trip")
    return trip_out(trip)


@router.patch("/{trip_id}", response_model=TripOut)
async def patch_trip(trip_id: str, body: TripPatch, user: AuthedUser = UserDep, ctx: Ctx = CtxDep):
    trip = await ctx.trips.get(user.id, trip_id)
    if not trip:
        raise not_found("Trip")
    sent = body.model_dump(exclude_unset=True)
    patch: dict = {}
    for k in ("name", "start_date", "end_date"):
        if k in sent:
            patch[k] = sent[k]
    dest_changed = False
    if "destination" in sent:
        dest = sent["destination"] or None
        if dest != trip.get("destination"):
            dest_changed = True
            code = country_code_from_name(dest)
            patch.update(destination=dest, destination_source="user" if dest else "ai", country=dest if code else None, country_code=code)
    start, end = patch.get("start_date", trip.get("start_date")), patch.get("end_date", trip.get("end_date"))
    if start and end and end < start:
        from app.core.errors import AppError

        raise AppError(422, "invalid_request", "The end date must be after the start date.")
    updated = await ctx.trips.update(user.id, trip_id, {**patch, "updated_at": now()}) or trip
    if dest_changed and updated.get("destination"):
        try:  # the user is waiting on the new photo (bounded)
            updated = await asyncio.wait_for(refresh_trip_cover(ctx, updated), 15)
        except Exception:
            pass
    return trip_out(updated)


@router.delete("/{trip_id}", status_code=204)
async def delete_trip(trip_id: str, user: AuthedUser = UserDep, ctx: Ctx = CtxDep):
    trip = await ctx.trips.get(user.id, trip_id)
    if not trip:
        raise not_found("Trip")
    await ctx.storage.delete_prefix(f"u/{user.id}/{trip_id}/")
    await ctx.jobs.col.delete_many({"user_id": user.id, "ticket_id": {"$in": [t["_id"] for t in await ctx.tickets.for_trip(user.id, trip_id)]}})
    await ctx.tickets.delete_for_trip(user.id, trip_id)
    await ctx.documents.col.delete_many({"user_id": user.id, "trip_id": trip_id})
    await ctx.trips.delete(user.id, trip_id)
    return Response(status_code=204)


__all__ = ["router", "to_api"]
