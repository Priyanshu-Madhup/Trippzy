"""Document → structured extraction. quick-classify (no LLM) → classify → extract → ground."""

import re

from app.ai import prompts
from app.ai.client import Budget, OpenRouter, Usage
from app.ai.llm_schemas import CLASSIFY_SCHEMA, extraction_schema
from app.ai.normalize import build_extraction, clamp01, is_empty_extraction
from app.core.errors import AppError
from app.schemas.extraction import DOCUMENT_TYPES, DocumentExtraction

MAX_TEXT = 12_000  # key details are on the first page; fewer tokens = cheaper and faster

_FLIGHT_CODE = r"\b(?:[A-Z]{2}|[A-Z]\d|\d[A-Z])\s?\d{2,4}\b"  # "AI 502", "6E 123" — not bare dates
SIGNALS: dict[str, list[re.Pattern]] = {
    t: [re.compile(p, f) for p, f in pats]
    for t, pats in {
        "flight": [
            (r"\bpnr\b", re.I),
            (r"\bflight\b", re.I),
            (r"\bairlines?\b|\bairways\b|\bair india\b|\bindigo\b|\bemirates\b", re.I),
            (r"\bboarding\b", re.I),
            (r"\bterminal\b", re.I),
            (r"\bairport\b", re.I),
            (r"\b(cabin|check-in) baggage\b", re.I),
            (_FLIGHT_CODE, 0),
        ],
        "hotel": [
            (r"\bcheck-?in\b", re.I),
            (r"\bcheck-?out\b", re.I),
            (r"\bhotel\b|\bresort\b|\bhostel\b|\bapartment\b", re.I),
            (r"\broom\b", re.I),
            (r"\bnights?\b", re.I),
            (r"\bguests?\b", re.I),
        ],
        "train": [
            (r"\btrain\b", re.I),
            (r"\bcoach\b", re.I),
            (r"\bberth\b", re.I),
            (r"\birctc\b|\brailways?\b|\beurostar\b|\bamtrak\b|\bsncf\b", re.I),
            (r"\bstation\b", re.I),
            (r"\bplatform\b", re.I),
        ],
        "bus": [
            (r"\bbus\b", re.I),
            (r"\bboarding point\b", re.I),
            (r"\bdropping point\b", re.I),
            (r"\bredbus\b|\bflixbus\b|\bvolvo\b|\bsleeper\b", re.I),
            (r"\boperator\b", re.I),
        ],
        "restaurant": [
            (r"\brestaurant\b", re.I),
            (r"\btable\b", re.I),
            (r"\breservation\b", re.I),
            (r"\bparty of\b|\bdiners?\b", re.I),
            (r"\bdinner\b|\blunch\b", re.I),
        ],
        "activity": [
            (r"\badmission\b", re.I),
            (r"\bentry\b", re.I),
            (r"\bmuseum\b|\btour\b|\bexperience\b|\battraction\b", re.I),
            (r"\bevent\b|\bshow\b|\bconcert\b", re.I),
            (r"\bvisit\b", re.I),
        ],
    }.items()
}


def quick_classify(raw_text: str) -> tuple[str, float] | None:
    """Keyword scoring for the obvious cases so most uploads skip the classification call."""
    head = raw_text[:5000]
    scores = sorted(((t, sum(1 for p in pats if p.search(head))) for t, pats in SIGNALS.items()), key=lambda x: -x[1])
    (top, top_score), (_, second_score) = scores[0], scores[1]
    if top_score >= 4 and top_score >= second_score * 2:
        return top, 0.9
    return None


def assert_readable(raw_text: str) -> None:
    readable = re.sub(r"\[illegible\]", "", re.sub(r"VISUAL NOTES:.*$", "", raw_text, flags=re.S)).strip()
    if "NO_TEXT_FOUND" in raw_text or len(readable) < 15:
        raise AppError(422, "unreadable", "Couldn't read this document.")


async def classify(ai: OpenRouter, raw_text: str, file_name: str, usage: Usage, budget: Budget) -> tuple[str, float]:
    quick = quick_classify(raw_text)
    if quick:
        return quick
    out = await ai.structured(
        system=prompts.CLASSIFY_SYSTEM,
        user=prompts.document_user_message(file_name, raw_text),
        schema_name="document_classification",
        schema=CLASSIFY_SCHEMA,
        usage=usage,
        budget=budget,
        max_tokens=1500,
    )
    t = str(out.get("document_type"))
    conf = out.get("confidence")
    return (t if t in DOCUMENT_TYPES else "unknown"), clamp01(float(conf) if isinstance(conf, (int, float)) else 0.5)


async def extract_by_type(
    ai: OpenRouter, doc_type: str, raw_text: str, file_name: str, classify_conf: float, usage: Usage, budget: Budget
) -> DocumentExtraction:
    req = dict(
        system=prompts.extraction_system(doc_type),
        user=prompts.document_user_message(file_name, raw_text),
        schema_name=f"{doc_type}_extraction",
        schema=extraction_schema(doc_type),
        usage=usage,
        budget=budget,
    )
    extraction = build_extraction(doc_type, await ai.structured(**req), raw_text, classify_conf)

    if is_empty_extraction(extraction) and ai.settings.openrouter_fallback_model and budget.remaining() > 10:
        try:
            retry = build_extraction(doc_type, await ai.structured(**req, model=ai.settings.openrouter_fallback_model), raw_text, classify_conf)
            if not is_empty_extraction(retry):
                extraction = retry
        except AppError:
            pass  # keep the first result

    if is_empty_extraction(extraction):
        # Never present an empty result as a confident, finished card.
        extraction = extraction.model_copy(update={"confidence": min(extraction.confidence, 0.4)})
    return extraction


async def run_extraction(
    ai: OpenRouter,
    *,
    text: str | None,
    images: list[str] | None,
    file_name: str,
    usage: Usage,
    budget: Budget,
    on_stage=None,
) -> tuple[DocumentExtraction, str, bool]:
    """Returns (extraction, source_text, used_vision)."""

    async def _noop(_stage: str) -> None:
        return None

    stage = on_stage or _noop
    used_vision = False
    if images:
        raw = await ai.vision_transcribe(images[:3], prompts.OCR_PROMPT, usage, budget)
        used_vision = True
    else:
        raw = text or ""
    raw = raw.replace("\x00", "").strip()[:MAX_TEXT]
    assert_readable(raw)

    await stage("identifying")
    doc_type, conf = await classify(ai, raw, file_name, usage, budget)
    await stage("extracting")
    extraction = await extract_by_type(ai, doc_type, raw, file_name, conf, usage, budget)
    return extraction, raw, used_vision
