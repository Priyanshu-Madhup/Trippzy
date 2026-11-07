from fastapi import APIRouter, Query

from app.api.deps import AuthedUser, IpGuard, UserDep
from app.core.ratelimit import user_limit
from app.services.place_info import get_place_info

router = APIRouter(prefix="/v1", tags=["place"], dependencies=[IpGuard])


@router.get("/place-info")
async def place_info(q: str = Query(..., min_length=1, max_length=80), user: AuthedUser = UserDep):
    user_limit(user.id, "place", 30, 60)
    return await get_place_info(q)
