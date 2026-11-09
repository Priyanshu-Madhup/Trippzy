"""Durable processing worker. Claims jobs from MongoDB (atomic, leased), runs the pipeline,
and reports each stage so the app's ProcessingCard shows real progress (no timers)."""

import asyncio
import logging
import uuid

from app.ai import documents
from app.ai.client import Budget, Usage
from app.ai.pipeline import run_extraction
from app.context import Ctx
from app.core.errors import AppError
from app.db import now
from app.schemas.extraction import DocumentExtraction
from app.services import storage as st
from app.services.journeys import derive_columns, split_extraction
from app.services.resolvers import resolve_ticket_visuals
from app.services.trip_intel import update_trip_from_tickets

log = logging.getLogger("trippzy.worker")
JOB_BUDGET_S = 150  # total AI time per job; the worker has no 60s serverless cap
MIN_PDF_TEXT = 60
PERMANENT = {"unreadable", "ai_not_configured", "storage_not_configured", "pdf_unreadable", "invalid_file"}

FRIENDLY = {
    "unreadable": "Couldn't read this document.",
    "rate_limited": "The AI is busy right now — tap Retry in a minute.",
    "ai_timeout": "The AI took too long — tap Retry.",
    "ai_not_configured": "AI extraction isn’t configured on the server yet.",
    "pdf_unreadable": "This PDF could not be opened. It may be password protected or damaged.",
    "invalid_file": "This file isn’t a supported PDF, PNG, JPG or WEBP.",
}


def _friendly(err: Exception) -> tuple[str, str]:
    if isinstance(err, AppError):
        return err.code, FRIENDLY.get(err.code, err.message or "Couldn't read this document.")
    return "internal_error", "Couldn't read this document."


async def _set_stage(ctx: Ctx, job: dict, stage: str) -> None:
    await ctx.jobs.heartbeat(job["_id"], stage)
    await ctx.tickets.update(job["user_id"], job["ticket_id"], {"processing_stage": stage})


async def _sync_siblings(ctx: Ctx, ticket: dict, parts: list[DocumentExtraction], visuals: dict, raw_text: str, codes: list[dict | None]) -> None:
    """A round-trip document yields extra tickets (the return flight). Siblings are found by
    their shared document, so re-reading updates the existing pair instead of duplicating it."""
    user_id = ticket["user_id"]
    siblings = [t for t in await ctx.tickets.for_document(user_id, ticket["document_id"]) if t["_id"] != ticket["_id"]]
    for i, part in enumerate(parts):
        row = {
            **derive_columns(part),
            **visuals,
            "code": codes[i + 1] if i + 1 < len(codes) else None,
            "structured_data": part.model_dump(),
            "raw_text": raw_text,
            # Not "completed" yet: released only after the trip is updated (see process_job).
            "processing_status": "processing",
            "processing_stage": "finishing",
            "error_message": None,
            "updated_at": now(),
        }
        if i < len(siblings):
            keep = set(siblings[i].get("user_edits") or [])
            await ctx.tickets.update(user_id, siblings[i]["_id"], {k: v for k, v in row.items() if k not in keep})
        else:
            await ctx.tickets.insert(
                {
                    **_blank_ticket(),
                    "_id": str(uuid.uuid4()),
                    "user_id": user_id,
                    "trip_id": ticket["trip_id"],
                    "document_id": ticket["document_id"],
                    "file_name": ticket.get("file_name"),
                    "file_type": ticket.get("file_type"),
                    "mime_type": ticket.get("mime_type"),
                    "file_size": 0,
                    "created_at": now(),
                    **row,
                }
            )
    for stale in siblings[len(parts) :]:  # the document no longer yields as many journeys
        await ctx.tickets.delete(user_id, stale["_id"])


def assign_codes(found: list, n: int) -> list[dict | None]:
    """Which scannable code belongs to which of the document's `n` tickets (index 0 = the primary).
    One code per journey when the counts agree; a single code is shared; otherwise only the primary
    gets the first one rather than guessing which return leg a code belongs to."""
    refs = [{"format": c.format, "text": c.text, "index": i} for i, c in enumerate(found)]
    if len(refs) == n:
        return refs
    if len(refs) == 1:
        return refs * n
    return [refs[0] if refs else None] + [None] * (n - 1)


def _blank_ticket() -> dict:
    cols = [
        "title",
        "summary",
        "provider_name",
        "airline_name",
        "airline_code",
        "airline_logo_url",
        "booking_platform",
        "booking_platform_logo_url",
        "provider_logo_url",
        "image_url",
        "code",
        "booking_reference",
        "origin",
        "destination",
        "travel_date",
        "end_date",
        "start_time",
        "end_time",
        "notes",
        "error_message",
        "raw_text",
        "structured_data",
        "confidence",
    ]
    return {**dict.fromkeys(cols), "document_type": "unknown", "needs_review": False, "user_edits": []}


async def process_job(ctx: Ctx, job: dict) -> None:
    user_id, ticket_id = job["user_id"], job["ticket_id"]
    ticket = await ctx.tickets.get(user_id, ticket_id)
    if not ticket:  # deleted while queued
        await ctx.jobs.finish(job["_id"], error="ticket_deleted")
        return
    doc = await ctx.documents.get(user_id, ticket["document_id"])
    if not doc:
        raise AppError(422, "invalid_file", "The original file is missing.")

    usage, budget = Usage(), Budget(JOB_BUDGET_S)
    await ctx.tickets.update(user_id, ticket_id, {"processing_status": "processing", "error_message": None})
    await _set_stage(ctx, job, "reading")

    data = await ctx.storage.get_bytes(doc["r2_key"])
    mime = documents.sniff_mime(data[:16])
    if mime is None:
        raise AppError(422, "invalid_file", "Unsupported file.")

    text, images = None, None
    page_images: list[bytes] = []
    found_codes = await asyncio.to_thread(documents.find_codes, data, mime)
    if mime == "application/pdf":
        try:
            text, _pages = await asyncio.to_thread(documents.pdf_text, data)
        except Exception:
            raise AppError(422, "pdf_unreadable", "Unreadable PDF.") from None
        if len(text.replace(" ", "").replace("\n", "")) < MIN_PDF_TEXT:
            text, images = None, await asyncio.to_thread(documents.pdf_pages_as_data_urls, data, 2)
        page_images = await asyncio.to_thread(documents.render_pdf_pages, data)
    else:
        images = [await asyncio.to_thread(documents.image_to_data_url, data)]

    async def on_stage(stage: str) -> None:
        await _set_stage(ctx, job, stage)

    extraction, raw_text, used_vision = await run_extraction(
        ctx.ai,
        text=text,
        images=images,
        file_name=ticket.get("file_name") or "document",
        usage=usage,
        budget=budget,
        on_stage=on_stage,
    )

    await _set_stage(ctx, job, "building")
    visuals = await resolve_ticket_visuals(ctx.settings, extraction)
    parts = split_extraction(extraction)
    primary, extra = parts[0], parts[1:]
    raw_text = raw_text[:20_000]

    # Scannable QR / barcode crops, stored beside the original; each ticket points at its own.
    assigned = assign_codes(found_codes, len(parts))
    for i, c in enumerate(found_codes):
        if any(a and a["index"] == i for a in assigned):
            await ctx.storage.put_bytes(st.code_key(user_id, ticket["trip_id"], doc["_id"], i + 1), c.png, "image/png")
    code_refs = [
        {"format": a["format"], "text": a["text"], "key": st.code_key(user_id, ticket["trip_id"], doc["_id"], a["index"] + 1)} if a else None for a in assigned
    ]
    for stale in range(len(found_codes), 6):  # a re-read that finds fewer codes must not leave old crops behind
        await ctx.storage.delete_key(st.code_key(user_id, ticket["trip_id"], doc["_id"], stale + 1))

    row = {
        **derive_columns(primary),
        **visuals,
        "code": code_refs[0],
        "structured_data": primary.model_dump(),
        "raw_text": raw_text,
        "processing_status": "processing",
        "processing_stage": "finishing",
        "error_message": None,
        "updated_at": now(),
    }
    keep = set(ticket.get("user_edits") or [])  # the user's edits win over a re-read
    await ctx.tickets.update(user_id, ticket_id, {k: v for k, v in row.items() if k not in keep})
    await _sync_siblings(ctx, ticket, extra, visuals, raw_text, code_refs)

    # PDF page images for the in-app viewer (and offline cache), stored next to the original.
    if page_images:
        keys = []
        for n, img in enumerate(page_images, start=1):
            key = st.page_key(user_id, ticket["trip_id"], doc["_id"], n)
            await ctx.storage.put_bytes(key, img, "image/webp")
            keys.append(key)
        await ctx.documents.update(user_id, doc["_id"], {"page_keys": keys, "status": "ready"})
    else:
        await ctx.documents.update(user_id, doc["_id"], {"status": "ready"})

    await _set_stage(ctx, job, "finishing")
    try:
        await update_trip_from_tickets(ctx, user_id, ticket["trip_id"])
    except Exception:
        log.warning("trip update failed", extra={"trip_id": ticket["trip_id"]}, exc_info=True)

    # Tickets and trip are now consistent: release them to the app together, so the app never sees
    # finished tickets next to a trip that has no destination, dates or cover yet.
    await ctx.tickets.col.update_many(
        {"user_id": user_id, "document_id": doc["_id"], "processing_stage": "finishing"},
        {"$set": {"processing_status": "completed", "processing_stage": "done", "updated_at": now()}},
    )

    await ctx.jobs.finish(
        job["_id"],
        meta={
            "models": usage.models,
            "calls": usage.calls,
            "prompt_tokens": usage.prompt_tokens,
            "completion_tokens": usage.completion_tokens,
            "retries": usage.retries,
            "vision": used_vision,
            "confidence": extraction.confidence,
            "ungrounded": extraction.ungrounded_fields,
            "doc_type": extraction.document_type,
        },
    )
    log.info("job done", extra={"job_id": job["_id"], "doc_type": extraction.document_type, "tokens": usage.prompt_tokens + usage.completion_tokens})


async def run_one(ctx: Ctx, job: dict) -> None:
    try:
        await process_job(ctx, job)
    except Exception as err:
        code, message = _friendly(err)
        retryable = code not in PERMANENT and job["attempts"] < ctx.jobs.MAX_ATTEMPTS
        log.warning("job failed", extra={"job_id": job["_id"], "code": code, "retry": retryable}, exc_info=not isinstance(err, AppError))
        if retryable:
            await ctx.jobs.requeue(job["_id"], code)
            return
        failed = {"processing_status": "failed", "processing_stage": "failed", "error_message": message}
        await ctx.tickets.update(job["user_id"], job["ticket_id"], failed)
        # A late failure must not strand the document's other tickets (e.g. the return flight) in "finishing".
        t = await ctx.tickets.get(job["user_id"], job["ticket_id"])
        if t and t.get("document_id"):
            await ctx.tickets.col.update_many({"user_id": job["user_id"], "document_id": t["document_id"], "processing_stage": "finishing"}, {"$set": failed})
        await ctx.jobs.finish(job["_id"], error=code)


async def worker_loop(ctx: Ctx, stop: asyncio.Event, poll_s: float = 1.0) -> None:
    log.info("worker started")
    while not stop.is_set():
        try:
            # Jobs that died on their last attempt: surface as failed instead of hanging forever.
            for dead in await ctx.jobs.exhausted():
                await ctx.tickets.update(
                    dead["user_id"],
                    dead["ticket_id"],
                    {"processing_status": "failed", "processing_stage": "failed", "error_message": "This is taking longer than expected — tap Retry."},
                )
                await ctx.jobs.finish(dead["_id"], error="lease_expired")
            job = await ctx.jobs.claim()
            if job is None:
                await asyncio.wait_for(stop.wait(), timeout=poll_s)
                continue
            await run_one(ctx, job)
        except TimeoutError:
            continue
        except Exception:
            log.error("worker loop error", exc_info=True)
            await asyncio.sleep(2)
    log.info("worker stopped")
