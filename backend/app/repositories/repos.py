from datetime import timedelta

from pymongo import ReturnDocument

from app.db import now
from app.repositories.base import Doc, OwnedRepo


class TripsRepo(OwnedRepo):
    name = "trips"


class TicketsRepo(OwnedRepo):
    name = "tickets"

    async def for_trip(self, user_id: str, trip_id: str) -> list[Doc]:
        return await self.list(
            user_id,
            {"trip_id": trip_id},
            sort=[("travel_date", 1), ("start_time", 1), ("created_at", 1)],
        )

    async def for_document(self, user_id: str, document_id: str) -> list[Doc]:
        return await self.list(user_id, {"document_id": document_id}, sort=[("created_at", 1)])

    async def count_for_document(self, user_id: str, document_id: str) -> int:
        return await self.col.count_documents({"user_id": user_id, "document_id": document_id})

    async def delete_for_trip(self, user_id: str, trip_id: str) -> int:
        res = await self.col.delete_many({"user_id": user_id, "trip_id": trip_id})
        return res.deleted_count


class DocumentsRepo(OwnedRepo):
    name = "documents"

    async def for_trip(self, user_id: str, trip_id: str) -> list[Doc]:
        return await self.list(user_id, {"trip_id": trip_id})


class JobsRepo(OwnedRepo):
    """Durable queue on MongoDB: workers claim a job atomically and hold a lease,
    so a crashed worker's job is picked up again."""

    name = "jobs"
    LEASE_S = 120
    MAX_ATTEMPTS = 3

    async def enqueue(self, user_id: str, ticket_id: str, job_id: str) -> Doc:
        doc = {
            "_id": job_id,
            "user_id": user_id,
            "ticket_id": ticket_id,
            "status": "queued",
            "stage": "queued",
            "attempts": 0,
            "error": None,
            "lease_until": None,
            "created_at": now(),
            "finished_at": None,
        }
        await self.col.insert_one(doc)
        return doc

    async def claim(self) -> Doc | None:
        t = now()
        return await self.col.find_one_and_update(
            {
                "$or": [
                    {"status": "queued"},
                    {"status": "running", "lease_until": {"$lt": t}},
                ],
                "attempts": {"$lt": self.MAX_ATTEMPTS},
            },
            {
                "$set": {"status": "running", "lease_until": t + timedelta(seconds=self.LEASE_S)},
                "$inc": {"attempts": 1},
            },
            sort=[("created_at", 1)],
            return_document=ReturnDocument.AFTER,
        )

    async def heartbeat(self, job_id: str, stage: str) -> None:
        await self.col.update_one(
            {"_id": job_id},
            {"$set": {"stage": stage, "lease_until": now() + timedelta(seconds=self.LEASE_S)}},
        )

    async def finish(self, job_id: str, *, error: str | None = None, meta: Doc | None = None) -> None:
        await self.col.update_one(
            {"_id": job_id},
            {
                "$set": {
                    "status": "failed" if error else "done",
                    "stage": "failed" if error else "done",
                    "error": error,
                    "finished_at": now(),
                    "lease_until": None,
                    **({"meta": meta} if meta else {}),
                }
            },
        )

    async def requeue(self, job_id: str, error: str) -> None:
        await self.col.update_one({"_id": job_id}, {"$set": {"status": "queued", "stage": "queued", "error": error, "lease_until": None}})

    async def exhausted(self) -> list[Doc]:
        """Jobs whose lease expired after the final attempt — mark them failed."""
        return await self.col.find({"status": "running", "lease_until": {"$lt": now()}, "attempts": {"$gte": self.MAX_ATTEMPTS}}).to_list(length=None)


class UsersRepo:
    """Users are keyed by the Clerk id (`_id`), so they have no separate user_id field."""

    def __init__(self, db) -> None:
        self.col = db["users"]

    async def get(self, user_id: str) -> Doc | None:
        return await self.col.find_one({"_id": user_id})

    async def update(self, user_id: str, patch: Doc) -> Doc | None:
        return await self.col.find_one_and_update({"_id": user_id}, {"$set": patch}, return_document=ReturnDocument.AFTER)

    async def accept_terms(self, user_id: str, version: str, at, app_version: str | None) -> Doc | None:
        """Records that the user agreed to `version` (current state + an append-only history). Idempotent per version."""
        entry = {"version": version, "accepted_at": at, "app_version": app_version}
        return await self.col.find_one_and_update(
            {"_id": user_id, "terms_history.version": {"$ne": version}},
            {"$set": {"terms_version": version, "terms_accepted_at": at}, "$push": {"terms_history": entry}},
            return_document=ReturnDocument.AFTER,
        ) or await self.col.find_one_and_update({"_id": user_id}, {"$set": {"terms_version": version}}, return_document=ReturnDocument.AFTER)

    async def delete(self, user_id: str) -> bool:
        return (await self.col.delete_one({"_id": user_id})).deleted_count > 0
