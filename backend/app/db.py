from datetime import UTC, datetime

from pymongo import ASCENDING, DESCENDING, AsyncMongoClient

from app.core.config import Settings


def make_client(settings: Settings) -> AsyncMongoClient:
    return AsyncMongoClient(settings.mongodb_uri, tz_aware=True, serverSelectionTimeoutMS=8000)


def now() -> datetime:
    return datetime.now(UTC)


async def ensure_indexes(db) -> None:
    """Idempotent. Query patterns: lists are always scoped by user_id first."""
    await db["trips"].create_index([("user_id", ASCENDING), ("start_date", ASCENDING)])
    await db["tickets"].create_index([("user_id", ASCENDING), ("trip_id", ASCENDING), ("travel_date", ASCENDING)])
    await db["tickets"].create_index([("user_id", ASCENDING), ("created_at", DESCENDING)])
    await db["tickets"].create_index([("user_id", ASCENDING), ("document_id", ASCENDING)])
    await db["documents"].create_index([("user_id", ASCENDING), ("sha256", ASCENDING)])
    await db["jobs"].create_index([("status", ASCENDING), ("lease_until", ASCENDING)])
    await db["jobs"].create_index([("user_id", ASCENDING), ("ticket_id", ASCENDING)])
    # Finished jobs expire after 30 days.
    await db["jobs"].create_index("finished_at", expireAfterSeconds=30 * 86400)
