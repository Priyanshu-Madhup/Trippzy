"""Small in-memory sliding-window limiter (single instance). Good enough for V1 abuse
protection; swap for a shared store if the API is ever scaled out horizontally."""

import time
from collections import defaultdict, deque

from fastapi import Depends, Request

from app.core.errors import AppError


class RateLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str, limit: int, window_s: int) -> None:
        now = time.monotonic()
        q = self._hits[key]
        while q and q[0] <= now - window_s:
            q.popleft()
        if len(q) >= limit:
            raise AppError(429, "rate_limited", "Too many requests. Please slow down and retry shortly.")
        q.append(now)
        if len(self._hits) > 20_000:  # bound memory
            self._hits.clear()


limiter = RateLimiter()


def client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    return fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "?")


def ip_limit(limit: int = 120, window_s: int = 60):
    async def dep(request: Request) -> None:
        limiter.check(f"ip:{client_ip(request)}:{request.url.path}", limit, window_s)

    return Depends(dep)


def user_limit(user_id: str, bucket: str, limit: int, window_s: int = 60) -> None:
    limiter.check(f"user:{user_id}:{bucket}", limit, window_s)
