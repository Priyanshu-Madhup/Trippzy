import logging

import httpx
from fastapi import APIRouter, Response

from app.api.deps import AuthedUser, Ctx, CtxDep, IpGuard, UserDep
from app.core.errors import AppError, not_found
from app.core.security import forget_user
from app.repositories.base import to_api
from app.schemas.api import ProfileOut, ProfilePatch, StatsOut

router = APIRouter(prefix="/v1/me", tags=["me"], dependencies=[IpGuard])
log = logging.getLogger("trippzy.me")


@router.get("", response_model=ProfileOut)
async def get_me(user: AuthedUser = UserDep, ctx: Ctx = CtxDep):
    doc = await ctx.users.get(user.id)
    if not doc:
        raise not_found("Profile")
    return to_api(doc)


@router.patch("", response_model=ProfileOut)
async def patch_me(body: ProfilePatch, user: AuthedUser = UserDep, ctx: Ctx = CtxDep):
    sent = body.model_dump(exclude_unset=True)
    existing = await ctx.users.get(user.id)
    if not existing:
        raise not_found("Profile")
    patch: dict = {}
    # Details can be cleared by sending null; a name can't be empty.
    for key in ("first_name", "last_name", "gender", "age", "country"):
        if key in sent:
            patch[key] = sent[key]
    if sent.get("name"):
        patch["name"] = sent["name"]
    if "first_name" in sent or "last_name" in sent:
        first = patch.get("first_name", existing.get("first_name"))
        last = patch.get("last_name", existing.get("last_name"))
        full = " ".join(x for x in (first, last) if x)
        if full:
            patch["name"] = full
    if sent.get("preferences") is not None:
        prefs = {k: v for k, v in sent["preferences"].items() if k == "home_widgets" or v is not None}
        patch["preferences"] = {**(existing.get("preferences") or {}), **prefs}
    doc = await ctx.users.update(user.id, patch) if patch else existing
    return to_api(doc)


@router.get("/stats", response_model=StatsOut)
async def stats(user: AuthedUser = UserDep, ctx: Ctx = CtxDep):
    trips = await ctx.trips.col.count_documents({"user_id": user.id})
    rows = await ctx.documents.list(user.id)
    tickets = await ctx.tickets.col.count_documents({"user_id": user.id})
    return StatsOut(trips=trips, tickets=tickets, documents=len(rows), storage_bytes=sum(int(r.get("size") or 0) for r in rows))


async def _delete_clerk_user(ctx: Ctx, user_id: str) -> None:
    async with httpx.AsyncClient(timeout=10) as http:
        res = await http.delete(f"https://api.clerk.com/v1/users/{user_id}", headers={"authorization": f"Bearer {ctx.settings.clerk_secret_key}"})
    if res.status_code not in (200, 204, 404):  # 404 = already gone → idempotent
        log.error("clerk delete failed", extra={"status": res.status_code})
        raise AppError(502, "account_delete_failed", "Couldn't finish deleting your account. Please try again.")


@router.delete("", status_code=204)
async def delete_me(user: AuthedUser = UserDep, ctx: Ctx = CtxDep):
    """Erase everything we hold, then the Clerk account. Idempotent and safe to retry: data goes
    first, so a Clerk failure leaves nothing behind but the (retryable) login. If the server can't delete
    the Clerk account at all (no secret key), it refuses up front — it must never erase data and then fail."""
    if not ctx.settings.clerk_secret_key:
        raise AppError(503, "server_not_configured", "Account deletion isn’t available right now. Please try again later.")
    uid = user.id
    await ctx.storage.delete_prefix(f"u/{uid}/")
    await ctx.jobs.delete_all(uid)
    await ctx.tickets.delete_all(uid)
    await ctx.documents.delete_all(uid)
    await ctx.trips.delete_all(uid)
    await ctx.users.delete(uid)
    forget_user(uid)
    await _delete_clerk_user(ctx, uid)
    return Response(status_code=204)
