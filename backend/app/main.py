import asyncio
import logging
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.gzip import GZipMiddleware

from app.api.v1 import app_version, me, note, place, tickets, trips, uploads
from app.context import Ctx, build_ctx
from app.core.config import Settings, get_settings
from app.core.errors import install_error_handlers
from app.core.logging import request_id_var, setup_logging
from app.db import ensure_indexes, make_client
from app.services.worker import worker_loop

log = logging.getLogger("trippzy")


def create_app(settings: Settings | None = None, ctx: Ctx | None = None) -> FastAPI:
    """`ctx` is injectable so tests run against an in-memory database and fake services."""
    settings = settings or get_settings()
    setup_logging(settings.log_level)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        client = None
        stop = asyncio.Event()
        task = None
        if ctx is not None:
            app.state.ctx = ctx
        else:
            client = make_client(settings)
            db = client[settings.mongodb_db]
            await ensure_indexes(db)
            app.state.ctx = build_ctx(settings, db)
        app.state.db = app.state.ctx.db
        app.state.settings = settings
        if settings.run_worker_in_api and ctx is None:
            task = asyncio.create_task(worker_loop(app.state.ctx, stop))
        try:
            yield
        finally:
            stop.set()
            if task:
                await task
            if client:
                await client.close()

    app = FastAPI(
        title="Trippzy API",
        version="0.1.0",
        lifespan=lifespan,
        docs_url=None if settings.is_prod else "/docs",
        redoc_url=None,
        openapi_url=None if settings.is_prod else "/openapi.json",
    )
    if ctx is not None:  # injected context (tests): available without running the lifespan
        app.state.ctx, app.state.db, app.state.settings = ctx, ctx.db, settings
    install_error_handlers(app)
    app.add_middleware(GZipMiddleware, minimum_size=1000)

    @app.middleware("http")
    async def request_context(request: Request, call_next):
        rid = request.headers.get("x-request-id") or uuid.uuid4().hex[:12]
        request_id_var.set(rid)
        response = await call_next(request)
        response.headers["x-request-id"] = rid
        response.headers["cache-control"] = response.headers.get("cache-control", "no-store")
        response.headers["x-content-type-options"] = "nosniff"
        return response

    # Public liveness/readiness (no data).
    @app.get("/healthz", include_in_schema=False)
    async def healthz():
        return {"ok": True}

    @app.get("/readyz", include_in_schema=False)
    async def readyz(request: Request):
        await request.app.state.db.command("ping")
        return {"ok": True}

    for r in (app_version.router, me.router, trips.router, note.router, tickets.router, uploads.router, place.router):
        app.include_router(r)
    return app


def app_factory() -> FastAPI:  # uvicorn --factory app.main:app_factory
    return create_app()
