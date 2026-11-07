from fastapi import APIRouter, Query, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from app.api.deps import CtxDep, IpGuard
from app.context import Ctx
from app.core.errors import AppError
from app.services.releases import apk_location, is_newer, latest_release

# Public on purpose: a phone that needs updating must be able to ask, signed in or not. No user data is involved.
router = APIRouter(prefix="/v1/app", tags=["app"], dependencies=[IpGuard], include_in_schema=False)


class AppVersion(BaseModel):
    latest: str | None
    update_available: bool
    notes: str = ""
    published_at: str | None = None
    size: int | None = None
    download_url: str | None = None


@router.get("/latest", response_model=AppVersion)
async def latest(request: Request, current: str = Query("0", max_length=32), ctx: Ctx = CtxDep):
    """What the newest release is, what changed, and whether `current` is behind it."""
    rel = await latest_release(ctx.settings)
    if not rel or not rel.version:
        return AppVersion(latest=None, update_available=False)
    has_apk = bool(rel.apk_name)
    base = str(request.base_url).rstrip("/")
    if ctx.settings.public_base_url:
        base = ctx.settings.public_base_url.rstrip("/")
    return AppVersion(
        latest=rel.version,
        update_available=has_apk and is_newer(rel.version, current),
        notes=rel.notes[:4000],
        published_at=rel.published_at,
        size=rel.apk_size,
        download_url=f"{base}/v1/app/download" if has_apk else None,
    )


@router.get("/download")
async def download(ctx: Ctx = CtxDep):
    """Sends the phone to the newest release's APK (a signed GitHub link when the repo is private)."""
    rel = await latest_release(ctx.settings)
    url = await apk_location(ctx.settings, rel) if rel else None
    if not url:
        raise AppError(404, "no_release", "There's no update to download yet.")
    return RedirectResponse(url, status_code=302)
