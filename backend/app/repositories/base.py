"""Ownership is enforced here, in one place: every read/update/delete filters by user_id,
so a route cannot accidentally reach another user's data. Another user's id simply
looks like a missing document (404)."""

from datetime import UTC, datetime
from typing import Any

from pymongo import ReturnDocument

Doc = dict[str, Any]


def to_api(doc: Doc | None) -> Doc | None:
    """`_id` → `id`, and make every datetime timezone-aware (UTC)."""
    if doc is None:
        return None
    out: Doc = {}
    for k, v in doc.items():
        if k == "_id":
            out["id"] = v
        elif isinstance(v, datetime):
            out[k] = v if v.tzinfo else v.replace(tzinfo=UTC)
        else:
            out[k] = v
    return out


class OwnedRepo:
    name: str

    def __init__(self, db) -> None:
        self.col = db[self.name]

    async def get(self, user_id: str, id: str) -> Doc | None:
        return await self.col.find_one({"_id": id, "user_id": user_id})

    async def list(self, user_id: str, filt: Doc | None = None, sort: list | None = None, limit: int = 0) -> list[Doc]:
        cursor = self.col.find({**(filt or {}), "user_id": user_id})
        if sort:
            cursor = cursor.sort(sort)
        if limit:
            cursor = cursor.limit(limit)
        return await cursor.to_list(length=None)

    async def insert(self, doc: Doc) -> Doc:
        assert doc.get("user_id"), "user_id is required"
        await self.col.insert_one(doc)
        return doc

    async def update(self, user_id: str, id: str, patch: Doc) -> Doc | None:
        return await self.col.find_one_and_update({"_id": id, "user_id": user_id}, {"$set": patch}, return_document=ReturnDocument.AFTER)

    async def delete(self, user_id: str, id: str) -> bool:
        res = await self.col.delete_one({"_id": id, "user_id": user_id})
        return res.deleted_count > 0

    async def delete_all(self, user_id: str) -> int:
        res = await self.col.delete_many({"user_id": user_id})
        return res.deleted_count
