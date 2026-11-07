"""Clerk session-token verification (the mobile app is an untrusted client).

Every protected route depends on `current_user`, which:
  1. reads the Bearer token,
  2. verifies signature (Clerk JWKS), issuer, expiry and — when present — `azp`,
  3. lazily provisions the user's document (decision: create on first request).
Auth is never bypassed: if Clerk isn't configured the API refuses to serve.
"""

import asyncio
import logging
from dataclasses import dataclass
from datetime import UTC, datetime

import httpx
import jwt
from cachetools import TTLCache
from fastapi import Request
from jwt import PyJWKClient

from app.core.config import Settings
from app.core.errors import AppError

log = logging.getLogger("trippzy.auth")


@dataclass(frozen=True)
class AuthedUser:
    id: str  # Clerk user id ("user_…") — also the `_id` of the users document


_jwk_clients: dict[str, PyJWKClient] = {}
_known_users: TTLCache[str, bool] = TTLCache(maxsize=10_000, ttl=300)


def _signing_key(token: str, issuer: str):
    """Resolve the public key for a token. Module-level so tests can replace it."""
    client = _jwk_clients.get(issuer)
    if client is None:
        client = PyJWKClient(f"{issuer}/.well-known/jwks.json", cache_keys=True, lifespan=3600)
        _jwk_clients[issuer] = client
    return client.get_signing_key_from_jwt(token).key


def decode_token(token: str, settings: Settings) -> dict:
    issuer = settings.issuer
    if not issuer:
        raise AppError(500, "server_not_configured", "Authentication is not configured on the server.")
    try:
        key = _signing_key(token, issuer)
        claims = jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            issuer=issuer,
            options={"require": ["exp", "sub", "iss"], "verify_aud": False},
            leeway=10,
        )
    except (jwt.PyJWTError, jwt.PyJWKClientError):
        raise AppError(401, "unauthorized", "Your session has expired. Please sign in again.") from None

    azp = claims.get("azp")
    if azp and settings.authorized_parties and azp not in settings.authorized_parties:
        raise AppError(401, "unauthorized", "Sign in to continue.")
    return claims


async def _fetch_clerk_profile(user_id: str, settings: Settings) -> dict:
    if not settings.clerk_secret_key:
        return {}
    try:
        async with httpx.AsyncClient(timeout=6) as http:
            res = await http.get(
                f"https://api.clerk.com/v1/users/{user_id}",
                headers={"authorization": f"Bearer {settings.clerk_secret_key}"},
            )
        if res.status_code != 200:
            return {}
        data = res.json()
        primary = data.get("primary_email_address_id")
        email = next((e.get("email_address") for e in data.get("email_addresses", []) if e.get("id") == primary), None)
        name = " ".join(p for p in (data.get("first_name"), data.get("last_name")) if p) or None
        return {"email": email, "name": name, "avatar_url": data.get("image_url")}
    except Exception:  # best effort only
        log.warning("could not fetch clerk profile", extra={"user_id": user_id})
        return {}


async def ensure_user(db, user_id: str, settings: Settings) -> None:
    if _known_users.get(user_id):
        return
    now = datetime.now(UTC)
    res = await db["users"].update_one(
        {"_id": user_id},
        {
            "$setOnInsert": {
                "email": None,
                "name": None,
                "avatar_url": None,
                "preferences": {"notifications": True},
                "created_at": now,
            },
            "$set": {"last_seen_at": now},
        },
        upsert=True,
    )
    if res.upserted_id is not None:
        profile = {k: v for k, v in (await _fetch_clerk_profile(user_id, settings)).items() if v}
        if profile:
            await db["users"].update_one({"_id": user_id}, {"$set": profile})
    _known_users[user_id] = True


def forget_user(user_id: str) -> None:
    _known_users.pop(user_id, None)


async def current_user(request: Request) -> AuthedUser:
    header = request.headers.get("authorization", "")
    token = header[7:].strip() if header.lower().startswith("bearer ") else ""
    if not token:
        raise AppError(401, "unauthorized", "Sign in to continue.")
    settings: Settings = request.app.state.settings
    claims = await asyncio.to_thread(decode_token, token, settings)
    user_id = claims["sub"]
    await ensure_user(request.app.state.db, user_id, settings)
    return AuthedUser(id=user_id)
