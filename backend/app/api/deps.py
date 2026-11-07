from fastapi import Depends, Request

from app.context import Ctx
from app.core.ratelimit import ip_limit
from app.core.security import AuthedUser, current_user


def get_ctx(request: Request) -> Ctx:
    return request.app.state.ctx


CtxDep = Depends(get_ctx)
UserDep = Depends(current_user)
# Cheap per-IP guard on every authenticated route (runs before token verification does any work).
IpGuard = ip_limit(limit=240, window_s=60)

__all__ = ["AuthedUser", "Ctx", "CtxDep", "UserDep", "IpGuard"]
