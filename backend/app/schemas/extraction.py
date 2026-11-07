"""AI extraction contract (port of Trippy's `types/extraction.ts`).

Every leaf is nullable: the engine returns null rather than inventing data. These models
validate what the normaliser produces and give the OpenAPI schema (and so the app's
generated TypeScript types) a precise shape for `structured_data`.
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

DOCUMENT_TYPES = (
    "flight",
    "hotel",
    "train",
    "bus",
    "restaurant",
    "activity",
    "generic_travel_document",
    "unknown",
)
DocumentType = Literal["flight", "hotel", "train", "bus", "restaurant", "activity", "generic_travel_document", "unknown"]


class _M(BaseModel):
    model_config = ConfigDict(extra="ignore")


class ProviderRef(_M):
    name: str | None = None
    domain: str | None = None


class PlaceRef(_M):
    city: str | None = None
    country: str | None = None
    country_code: str | None = None


class Money(_M):
    amount: float | None = None
    currency: str | None = None


class FlightEndpoint(_M):
    airport: str | None = None
    airport_code: str | None = None
    city: str | None = None
    country: str | None = None
    date: str | None = None
    time: str | None = None
    terminal: str | None = None
    timezone: str | None = None  # IANA zone, derived from the airport code (never from the model)


class FlightSegment(_M):
    flight_number: str | None = None
    departure: FlightEndpoint = Field(default_factory=FlightEndpoint)
    arrival: FlightEndpoint = Field(default_factory=FlightEndpoint)
    seat: str | None = None
    cabin_class: str | None = None
    duration: str | None = None  # as printed on the ticket
    duration_minutes: int | None = None  # computed from time zones when both are known


class Airline(_M):
    name: str | None = None
    iata_code: str | None = None
    domain: str | None = None


class FlightData(_M):
    airline: Airline = Field(default_factory=Airline)
    segments: list[FlightSegment] = []
    pnr: str | None = None
    ticket_number: str | None = None
    baggage: str | None = None
    passengers: list[str] = []


class HotelInfo(_M):
    name: str | None = None
    address: str | None = None
    city: str | None = None
    country: str | None = None
    phone: str | None = None
    domain: str | None = None


class DateTimeRef(_M):
    date: str | None = None
    time: str | None = None


class HotelData(_M):
    hotel: HotelInfo = Field(default_factory=HotelInfo)
    check_in: DateTimeRef = Field(default_factory=DateTimeRef)
    check_out: DateTimeRef = Field(default_factory=DateTimeRef)
    nights: int | None = None
    rooms: int | None = None
    room_type: str | None = None
    guests: int | None = None
    confirmation_number: str | None = None


class TransitEndpoint(_M):
    station: str | None = None
    station_code: str | None = None
    city: str | None = None
    date: str | None = None
    time: str | None = None


class TrainData(_M):
    operator: ProviderRef = Field(default_factory=ProviderRef)
    train_name: str | None = None
    train_number: str | None = None
    departure: TransitEndpoint = Field(default_factory=TransitEndpoint)
    arrival: TransitEndpoint = Field(default_factory=TransitEndpoint)
    pnr: str | None = None
    coach: str | None = None
    seat: str | None = None
    berth: str | None = None
    travel_class: str | None = None
    passengers: list[str] = []


class BusData(_M):
    operator: ProviderRef = Field(default_factory=ProviderRef)
    bus_type: str | None = None
    departure: TransitEndpoint = Field(default_factory=TransitEndpoint)
    arrival: TransitEndpoint = Field(default_factory=TransitEndpoint)
    seat: str | None = None
    ticket_number: str | None = None
    pnr: str | None = None
    passengers: list[str] = []


class RestaurantData(_M):
    name: str | None = None
    address: str | None = None
    city: str | None = None
    date: str | None = None
    time: str | None = None
    party_size: int | None = None
    reservation_number: str | None = None
    domain: str | None = None


class ActivityData(_M):
    name: str | None = None
    venue: str | None = None
    address: str | None = None
    city: str | None = None
    date: str | None = None
    time: str | None = None
    end_time: str | None = None
    ticket_count: int | None = None
    reference: str | None = None
    domain: str | None = None


class KeyFact(_M):
    label: str
    value: str


class DatedItem(_M):
    label: str
    date: str


class GenericData(_M):
    issuer: str | None = None
    key_facts: list[KeyFact] = []
    dates: list[DatedItem] = []
    city: str | None = None


Details = FlightData | HotelData | TrainData | BusData | RestaurantData | ActivityData | GenericData


class Reminder(_M):
    """A calendar notification the model words for this booking (shown on the phone shortly before it starts)."""

    title: str | None = None
    body: str | None = None
    lead_minutes: int | None = None


class DocumentExtraction(_M):
    schema_version: Literal[1] = 1
    document_type: DocumentType
    confidence: float = Field(ge=0, le=1)
    title: str | None = None
    summary: str | None = None
    booking_platform: ProviderRef = Field(default_factory=ProviderRef)
    booking_reference: str | None = None
    primary_location: PlaceRef = Field(default_factory=PlaceRef)
    start_date: str | None = None
    end_date: str | None = None
    total_price: Money = Field(default_factory=Money)
    details: Details
    ungrounded_fields: list[str] = []
    reminder: Reminder = Field(default_factory=Reminder)
    leg: Literal["outbound", "return"] | None = None
