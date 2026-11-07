import time

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from mongomock_motor import AsyncMongoMockClient

from app.context import build_ctx
from app.core import ratelimit, security
from app.core.config import Settings
from app.main import create_app

ISSUER = "https://clerk.test"


class FakeStorage:
    """In-memory stand-in for R2 with the same interface."""

    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}
        self.deleted_prefixes: list[str] = []

    def presign_put(self, key, content_type, expires):
        return f"https://r2.test/{key}?sig=put&exp={expires}"

    def presign_get(self, key, expires, download_name=None):
        return f"https://r2.test/{key}?sig=get&exp={expires}"

    async def head(self, key):
        obj = self.objects.get(key)
        return None if obj is None else {"ContentLength": len(obj)}

    async def get_range(self, key, start, end):
        return self.objects[key][start : end + 1]

    async def get_bytes(self, key):
        return self.objects[key]

    async def put_bytes(self, key, data, content_type):
        self.objects[key] = data

    async def delete_key(self, key):
        self.objects.pop(key, None)

    async def delete_prefix(self, prefix):
        self.deleted_prefixes.append(prefix)
        gone = [k for k in self.objects if k.startswith(prefix)]
        for k in gone:
            del self.objects[k]
        return len(gone)


class FakeAI:
    """Returns canned model output. `extraction` can be swapped per test."""

    def __init__(self) -> None:
        self.settings = Settings(_env_file=None, openrouter_fallback_model="")
        self.extraction: dict = {}
        self.ocr_text = ""
        self.calls: list[str] = []

    async def structured(self, *, schema_name, **_):
        self.calls.append(schema_name)
        return self.extraction

    async def vision_transcribe(self, images, prompt, usage, budget):
        self.calls.append("vision")
        return self.ocr_text


@pytest.fixture(scope="session")
def rsa_key():
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


@pytest.fixture(autouse=True)
def _auth_env(monkeypatch, rsa_key):
    monkeypatch.setattr(security, "_signing_key", lambda token, issuer: rsa_key.public_key())
    security._known_users.clear()
    ratelimit.limiter._hits.clear()


def make_token(rsa_key, sub="user_A", *, issuer=ISSUER, exp_in=3600, azp=None):
    now = int(time.time())
    claims = {"sub": sub, "iss": issuer, "iat": now, "exp": now + exp_in}
    if azp:
        claims["azp"] = azp
    return jwt.encode(claims, rsa_key, algorithm="RS256")


@pytest.fixture
def settings():
    return Settings(_env_file=None, env="test", clerk_issuer=ISSUER, run_worker_in_api=False, openrouter_api_key="k", r2_bucket="t")


@pytest.fixture
def ctx(settings):
    db = AsyncMongoMockClient(tz_aware=True)["trippzy_test"]
    return build_ctx(settings, db, storage=FakeStorage(), ai=FakeAI())


@pytest.fixture
async def client(settings, ctx):
    app = create_app(settings, ctx)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest.fixture
def auth(rsa_key):
    def _auth(user="user_A", **kw):
        return {"authorization": f"Bearer {make_token(rsa_key, user, **kw)}"}

    return _auth
