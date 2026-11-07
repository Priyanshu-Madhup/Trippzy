"""One place that wires settings, database, repositories, storage and AI together."""

from dataclasses import dataclass

from app.ai.client import OpenRouter
from app.core.config import Settings
from app.repositories.repos import DocumentsRepo, JobsRepo, TicketsRepo, TripsRepo, UsersRepo
from app.services.storage import Storage


@dataclass
class Ctx:
    settings: Settings
    db: object
    users: UsersRepo
    trips: TripsRepo
    tickets: TicketsRepo
    documents: DocumentsRepo
    jobs: JobsRepo
    storage: Storage
    ai: OpenRouter


def build_ctx(settings: Settings, db, storage: Storage | None = None, ai: OpenRouter | None = None) -> Ctx:
    return Ctx(
        settings=settings,
        db=db,
        users=UsersRepo(db),
        trips=TripsRepo(db),
        tickets=TicketsRepo(db),
        documents=DocumentsRepo(db),
        jobs=JobsRepo(db),
        storage=storage or Storage(settings),
        ai=ai or OpenRouter(settings),
    )
