"""What kind of paper is this? A small decision model (TypeSafe's Jev) labels each upload —
"Boarding pass", "Flight ticket", "Rail ticket"… — shown as a small tag above the ticket.

Jev (`typesafe/jev-router` on OpenRouter) answers one multiple-choice question; code decides what to do
with the answer. No model configured, a timeout or an unsure answer all fall back to keyword rules, so a
label is never missing and never blocks processing.
"""

import asyncio
import json
import logging
import re

from app.ai.client import Budget, OpenRouter, Usage
from app.schemas.extraction import TICKET_KINDS, DocumentExtraction

log = logging.getLogger("trippzy.jev")

MIN_CONFIDENCE = 0.5
TIMEOUT_S = 12.0

CRITERIA = {
    "flight_ticket": "An airline e-ticket, booking confirmation or itinerary receipt for a flight",
    "boarding_pass": "A boarding pass: gate, boarding time, seat, sequence number or a boarding QR / barcode",
    "train_ticket": "A railway ticket or reservation (PNR, coach, berth, train number, station)",
    "bus_ticket": "A bus ticket (operator, boarding point, dropping point)",
    "hotel_booking": "A hotel, hostel or apartment booking confirmation or voucher",
    "restaurant_reservation": "A table reservation at a restaurant",
    "activity_ticket": "An entry ticket, tour, event or experience booking",
    "travel_document": "Anything else travel related: visa, insurance, invoice, itinerary, passport copy",
}

# Which labels make sense for each extracted document type; anything outside is a model slip → fallback.
COMPATIBLE: dict[str, set[str]] = {
    "flight": {"flight_ticket", "boarding_pass"},
    "train": {"train_ticket"},
    "bus": {"bus_ticket"},
    "hotel": {"hotel_booking"},
    "restaurant": {"restaurant_reservation"},
    "activity": {"activity_ticket"},
}
DEFAULT_KIND = {
    "flight": "flight_ticket",
    "train": "train_ticket",
    "bus": "bus_ticket",
    "hotel": "hotel_booking",
    "restaurant": "restaurant_reservation",
    "activity": "activity_ticket",
}
_BOARDING = re.compile(r"boarding\s*pass|\bgate\b|boarding\s*time|\bseq(?:uence)?\b|\bgroup\s*\d\b", re.I)

SCHEMA = {
    "type": "object",
    "properties": {"kind": {"type": "string", "enum": list(TICKET_KINDS)}, "confidence": {"type": "number", "minimum": 0, "maximum": 1}},
    "required": ["kind", "confidence"],
    "additionalProperties": False,
}
SYSTEM = (
    "You label travel documents. Decide which kind of paper the document is, judging by what the paper itself is "
    "(a boarding pass is not an e-ticket receipt, even for the same flight). Options:\n"
    + "\n".join(f"- {k}: {v}" for k, v in CRITERIA.items())
    + "\nAnswer with the option name and your confidence (0-1) that it is right."
)


def fallback_kind(doc_type: str, raw_text: str) -> str:
    if doc_type == "flight":
        return "boarding_pass" if len(_BOARDING.findall(raw_text[:5000])) >= 2 else "flight_ticket"
    return DEFAULT_KIND.get(doc_type, "travel_document")


async def _ask_jev(ai: OpenRouter, doc_type: str, raw_text: str, file_name: str, usage: Usage, budget: Budget) -> tuple[str, float]:
    user = json.dumps({"file_name": file_name, "detected_category": doc_type, "document_text": raw_text[:3500]})
    out = await asyncio.wait_for(
        ai.structured(
            system=SYSTEM,
            user=user,
            schema_name="ticket_kind",
            schema=SCHEMA,
            usage=usage,
            budget=budget,
            max_tokens=200,
            model=ai.settings.jev_model,
        ),
        TIMEOUT_S,
    )
    conf = out.get("confidence")
    return str(out.get("kind")), float(conf) if isinstance(conf, (int, float)) else 0.0


async def classify_kind(ai: OpenRouter, extraction: DocumentExtraction, raw_text: str, file_name: str, usage: Usage, budget: Budget) -> str:
    doc_type = extraction.document_type
    fallback = fallback_kind(doc_type, raw_text)
    if not ai.settings.jev_model or not ai.settings.openrouter_api_key or budget.remaining() < 8:
        return fallback
    try:
        kind, confidence = await _ask_jev(ai, doc_type, raw_text, file_name, usage, budget)
    except Exception as e:  # network, quota, timeout, bad JSON: the label is cosmetic, never fail a ticket over it
        log.warning("jev unavailable (%s)", type(e).__name__)
        return fallback
    allowed = COMPATIBLE.get(doc_type)
    if kind not in TICKET_KINDS or confidence < MIN_CONFIDENCE or (allowed is not None and kind not in allowed):
        return fallback
    return kind
