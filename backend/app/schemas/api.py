"""Request / response models. These drive the OpenAPI schema the mobile app's TypeScript
types are generated from, so the API contract has a single source of truth."""

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from app.schemas.extraction import DocumentExtraction, DocumentType

DateStr = Annotated[str, StringConstraints(pattern=r"^\d{4}-\d{2}-\d{2}$")]
TimeStr = Annotated[str, StringConstraints(pattern=r"^\d{2}:\d{2}$")]
ProcessingStatus = Literal["uploaded", "processing", "completed", "failed"]
ProcessingStage = Literal["uploading", "queued", "reading", "identifying", "extracting", "building", "finishing", "done", "failed"]


class _Out(BaseModel):
    model_config = ConfigDict(extra="ignore")


# ─── Profile ────────────────────────────────────────────────────────


# Widgets on the Home screen, in default order. `hero` (the next-trip photo) is always first and can't be moved.
HOME_WIDGETS = ("hero", "note", "weather", "essentials", "about", "news", "upcoming")
Gender = Literal["female", "male", "non_binary", "prefer_not"]


def clean_widgets(value: list[str] | None) -> list[str] | None:
    """Keep known widgets only, once each, in the given order; add any missing ones at the end; `hero` stays first."""
    if value is None:
        return None
    seen: list[str] = []
    for w in value:
        if w in HOME_WIDGETS and w not in seen:
            seen.append(w)
    rest = [w for w in HOME_WIDGETS if w not in seen]
    return ["hero", *[w for w in seen + rest if w != "hero"]]


class Preferences(BaseModel):
    notifications: bool = True
    home_widgets: list[str] | None = None  # None = the default order


class PreferencesPatch(BaseModel):
    """Only the keys that are sent are changed (the rest are kept)."""

    notifications: bool | None = None
    home_widgets: list[str] | None = None

    @model_validator(mode="after")
    def _widgets(self):
        if "home_widgets" in self.model_fields_set:  # assigning would otherwise mark it as "sent" and wipe the saved order
            self.home_widgets = clean_widgets(self.home_widgets)
        return self


class ProfileOut(_Out):
    id: str
    email: str | None = None
    name: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    gender: Gender | None = None
    age: int | None = None
    country: str | None = None  # ISO 3166-1 alpha-2
    avatar_url: str | None = None
    preferences: Preferences = Field(default_factory=Preferences)
    created_at: datetime
    # Terms & Privacy: which version this user agreed to (null = never), and the version they must agree to now.
    terms_accepted_version: str | None = None
    terms_accepted_at: datetime | None = None
    terms_current_version: str | None = None


class TermsAccept(BaseModel):
    version: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=32)]
    app_version: Annotated[str, StringConstraints(strip_whitespace=True, max_length=32)] | None = None


NameStr = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]


class ProfilePatch(BaseModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)] | None = None
    first_name: NameStr | None = None
    last_name: NameStr | None = None
    gender: Gender | None = None
    age: Annotated[int, Field(ge=5, le=120)] | None = None
    country: Annotated[str, StringConstraints(to_upper=True, pattern=r"^[A-Za-z]{2}$")] | None = None
    preferences: PreferencesPatch | None = None


class StatsOut(BaseModel):
    trips: int
    tickets: int
    documents: int
    storage_bytes: int


# ─── Trips ──────────────────────────────────────────────────────────


class TripPlaceOut(_Out):
    place_name: str
    place_type: Literal["city", "hotel", "airport", "station", "venue", "country"]
    ticket_id: str | None = None
    image_url: str | None = None
    source: str | None = None


class TripOut(_Out):
    id: str
    user_id: str
    name: str
    destination: str | None = None
    country: str | None = None
    country_code: str | None = None
    destination_source: Literal["user", "ai"] = "ai"
    start_date: str | None = None
    end_date: str | None = None
    cover_image_url: str | None = None
    cover_image_source: str | None = None
    cover_image_attribution: str | None = None
    cover_image_query: str | None = None
    places: list[TripPlaceOut] = []
    created_at: datetime
    updated_at: datetime


class TripTicketSummary(BaseModel):
    id: str
    document_type: DocumentType
    processing_status: ProcessingStatus


class TripWithStats(TripOut):
    tickets: list[TripTicketSummary] = []


Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
Short = Annotated[str, StringConstraints(strip_whitespace=True, max_length=80)]


class TripCreate(BaseModel):
    name: Name
    destination: Short | None = None
    start_date: DateStr | None = None
    end_date: DateStr | None = None

    @model_validator(mode="after")
    def _dates(self):
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError("end_date must not be before start_date")
        return self


class TripPatch(BaseModel):
    name: Name | None = None
    destination: Short | None = None
    start_date: DateStr | None = None
    end_date: DateStr | None = None

    @model_validator(mode="after")
    def _dates(self):
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError("end_date must not be before start_date")
        return self


# ─── Tickets ────────────────────────────────────────────────────────


class TicketOut(_Out):
    id: str
    trip_id: str
    user_id: str
    document_id: str | None = None
    has_file: bool = False
    has_code: bool = False
    code_format: Literal["qr", "pdf417", "aztec", "datamatrix", "code128", "barcode"] | None = None
    file_name: str | None = None
    file_type: Literal["pdf", "image"] | None = None
    mime_type: str | None = None
    file_size: int | None = None
    document_type: DocumentType = "unknown"
    processing_status: ProcessingStatus = "uploaded"
    processing_stage: ProcessingStage | None = None
    error_message: str | None = None
    structured_data: DocumentExtraction | None = None
    confidence: float | None = None
    needs_review: bool = False
    title: str | None = None
    summary: str | None = None
    provider_name: str | None = None
    airline_name: str | None = None
    airline_code: str | None = None
    airline_logo_url: str | None = None
    booking_platform: str | None = None
    booking_platform_logo_url: str | None = None
    provider_logo_url: str | None = None
    image_url: str | None = None
    booking_reference: str | None = None
    origin: str | None = None
    destination: str | None = None
    travel_date: str | None = None
    end_date: str | None = None
    start_time: str | None = None
    end_time: str | None = None
    notes: str | None = None
    user_edits: list[str] = []
    created_at: datetime
    updated_at: datetime


class TripRef(BaseModel):
    id: str
    name: str
    destination: str | None = None


class TicketWithTrip(TicketOut):
    trip: TripRef | None = None


class DocumentRow(_Out):
    """An uploaded file, with the trip and ticket it became."""

    id: str
    file_name: str | None = None
    mime_type: str | None = None
    size: int = 0
    status: str | None = None
    created_at: datetime
    trip: TripRef | None = None
    ticket_id: str | None = None
    ticket_title: str | None = None
    document_type: str | None = None


Text = Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)]


class TicketPatch(BaseModel):
    """Only these fields are user-editable; each edited field is remembered in `user_edits`
    so re-reading the document never overwrites it."""

    document_type: DocumentType | None = None
    title: Annotated[str, StringConstraints(strip_whitespace=True, max_length=140)] | None = None
    travel_date: DateStr | None = None
    start_time: TimeStr | None = None
    end_date: DateStr | None = None
    end_time: TimeStr | None = None
    origin: Text | None = None
    destination: Text | None = None
    provider_name: Text | None = None
    airline_name: Text | None = None
    booking_reference: Annotated[str, StringConstraints(strip_whitespace=True, max_length=60)] | None = None
    notes: Annotated[str, StringConstraints(max_length=1000)] | None = None


# ─── Uploads / files ────────────────────────────────────────────────


class UploadRequest(BaseModel):
    file_name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
    mime_type: Literal["application/pdf", "image/png", "image/jpeg", "image/webp"]
    size: int = Field(gt=0)


class UploadTarget(BaseModel):
    url: str
    method: Literal["PUT"] = "PUT"
    headers: dict[str, str]
    expires_in: int


class UploadOut(BaseModel):
    ticket: TicketOut
    upload: UploadTarget


class FileUrlOut(BaseModel):
    url: str
    expires_in: int


class CodeOut(BaseModel):
    url: str
    format: Literal["qr", "pdf417", "aztec", "datamatrix", "code128", "barcode"]
    expires_in: int


class PagesOut(BaseModel):
    pages: list[str]
    expires_in: int


class JobOut(_Out):
    id: str
    ticket_id: str
    status: Literal["queued", "running", "done", "failed"]
    stage: str
    error: str | None = None


# --- Trippzy Note (where to be and when to leave) -------------------


class NoteRequest(BaseModel):
    """The phone's position, sent only to compute this note — never stored or logged."""

    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    timezone: str | None = Field(default=None, max_length=64)  # IANA zone of the phone, e.g. "Asia/Kolkata"
    refresh: bool = False  # the user tapped refresh: skip the cached answer


class NoteTraffic(_Out):
    delay_minutes: int = 0
    jams: int = 0
    roadworks: int = 0
    closures: int = 0
    basis: Literal["live", "typical"] = "typical"


class NoteConnection(_Out):
    ticket_id: str
    kind: str
    title: str
    departs_local: str | None = None
    gap_minutes: int | None = None
    tight: bool = False


class TripNote(_Out):
    state: Literal["ok", "no_departure"]
    ticket_id: str | None = None
    ticket_title: str | None = None
    mode: Literal["flight", "train", "bus"] | None = None
    place_name: str | None = None
    departs_local: str | None = None
    leave_by_local: str | None = None
    arrive_by_local: str | None = None
    buffer_minutes: int | None = None
    distance_km: float | None = None
    drive_minutes: int | None = None
    traffic: NoteTraffic | None = None
    connections: list[NoteConnection] = []
    headline: str | None = None
    body: str | None = None
    tips: list[str] = []
    route_checked: bool = False
    fresh_for_s: int | None = None  # how long the app may reuse this note without asking again
