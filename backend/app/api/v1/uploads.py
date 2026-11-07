"""Direct-to-R2 uploads: the app PUTs the file to a short-lived presigned URL, then calls
`complete`. R2 presigned PUTs can't enforce size, so the server verifies size and magic bytes
after the upload and deletes anything invalid."""

import uuid

from fastapi import APIRouter

from app.ai.documents import sniff_mime
from app.api.deps import AuthedUser, Ctx, CtxDep, IpGuard, UserDep
from app.api.v1.serializers import ticket_out
from app.core.errors import AppError, not_found
from app.core.ratelimit import user_limit
from app.db import now
from app.schemas.api import TicketOut, UploadOut, UploadRequest
from app.services import storage as st
from app.services.worker import _blank_ticket

router = APIRouter(prefix="/v1", tags=["uploads"], dependencies=[IpGuard])


@router.post("/trips/{trip_id}/uploads", response_model=UploadOut, status_code=201)
async def create_upload(trip_id: str, body: UploadRequest, user: AuthedUser = UserDep, ctx: Ctx = CtxDep):
    if not await ctx.trips.get(user.id, trip_id):
        raise not_found("Trip")
    if body.size > ctx.settings.max_upload_bytes:
        raise AppError(413, "payload_too_large", "This file is larger than 20 MB.")
    user_limit(user.id, "upload", 30, 60)

    doc_id, ticket_id = str(uuid.uuid4()), str(uuid.uuid4())
    key = st.original_key(user.id, trip_id, doc_id, body.mime_type)
    t = now()
    await ctx.documents.insert(
        {
            "_id": doc_id,
            "user_id": user.id,
            "trip_id": trip_id,
            "file_name": body.file_name,
            "mime_type": body.mime_type,
            "size": body.size,
            "r2_key": key,
            "page_keys": [],
            "status": "pending",
            "created_at": t,
        }
    )
    ticket = await ctx.tickets.insert(
        {
            **_blank_ticket(),
            "_id": ticket_id,
            "user_id": user.id,
            "trip_id": trip_id,
            "document_id": doc_id,
            "file_name": body.file_name,
            "file_type": "pdf" if body.mime_type == "application/pdf" else "image",
            "mime_type": body.mime_type,
            "file_size": body.size,
            "processing_status": "uploaded",
            "processing_stage": "uploading",
            "created_at": t,
            "updated_at": t,
        }
    )
    ttl = ctx.settings.upload_url_ttl_s
    return {
        "ticket": ticket_out(ticket),
        "upload": {"url": ctx.storage.presign_put(key, body.mime_type, ttl), "method": "PUT", "headers": {"Content-Type": body.mime_type}, "expires_in": ttl},
    }


@router.post("/tickets/{ticket_id}/upload-complete", response_model=TicketOut)
async def upload_complete(ticket_id: str, user: AuthedUser = UserDep, ctx: Ctx = CtxDep):
    ticket = await ctx.tickets.get(user.id, ticket_id)
    doc = await ctx.documents.get(user.id, ticket["document_id"]) if ticket and ticket.get("document_id") else None
    if not ticket or not doc:
        raise not_found("Upload")
    if ticket["processing_status"] != "uploaded":  # idempotent: a repeated call changes nothing
        return ticket_out(ticket)

    head = await ctx.storage.head(doc["r2_key"])
    if head is None:
        raise AppError(409, "upload_missing", "The file wasn't uploaded. Please try again.")
    size = int(head.get("ContentLength", 0))
    magic = await ctx.storage.get_range(doc["r2_key"], 0, 15)
    mime = sniff_mime(magic)
    if size <= 0 or size > ctx.settings.max_upload_bytes or mime is None or mime != doc["mime_type"]:
        await ctx.storage.delete_key(doc["r2_key"])
        await ctx.tickets.delete(user.id, ticket_id)
        await ctx.documents.delete(user.id, doc["_id"])
        raise AppError(422, "invalid_file", "This file isn’t a supported PDF, PNG, JPG or WEBP (max 20 MB).")

    user_limit(user.id, "ai", 20, 600)
    await ctx.documents.update(user.id, doc["_id"], {"size": size})
    updated = await ctx.tickets.update(
        user.id, ticket_id, {"processing_status": "processing", "processing_stage": "queued", "file_size": size, "updated_at": now()}
    )
    await ctx.jobs.enqueue(user.id, ticket_id, str(uuid.uuid4()))
    return ticket_out(updated or ticket)
