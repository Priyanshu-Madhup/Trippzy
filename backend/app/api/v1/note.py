from fastapi import APIRouter

from app.api.deps import AuthedUser, Ctx, CtxDep, IpGuard, UserDep
from app.core.errors import AppError, not_found
from app.core.ratelimit import user_limit
from app.schemas.api import NoteRequest, TripNote
from app.services.trippzy_note import build_note_guarded

router = APIRouter(prefix="/v1/trips", tags=["note"], dependencies=[IpGuard])


@router.post("/{trip_id}/note", response_model=TripNote)
async def trippzy_note(trip_id: str, body: NoteRequest, user: AuthedUser = UserDep, ctx: Ctx = CtxDep):
    """When to leave for the trip's next flight / train / bus, from the phone's current position."""
    user_limit(user.id, "note", 12, 60)
    trip = await ctx.trips.get(user.id, trip_id)
    if not trip:
        raise not_found("Trip")
    if not ctx.settings.tomtom_api_key:
        raise AppError(503, "server_not_configured", "Traffic lookups aren't set up on the server yet.")
    tickets = await ctx.tickets.for_trip(user.id, trip_id)
    return await build_note_guarded(ctx, user.id, trip, tickets, body.lat, body.lng, body.timezone)
