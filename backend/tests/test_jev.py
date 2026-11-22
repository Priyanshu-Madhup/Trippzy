import pytest

from app.ai import jev
from app.ai.client import Budget, Usage
from app.core.config import Settings
from app.schemas.extraction import DocumentExtraction, FlightData, TrainData


class FakeAI:
    def __init__(self, key="k", **settings):
        self.settings = Settings(openrouter_api_key=key, **settings)


def ext(doc_type: str) -> DocumentExtraction:
    details = FlightData() if doc_type == "flight" else TrainData()
    return DocumentExtraction(document_type=doc_type, confidence=0.9, details=details)


def run(ai, doc_type: str):
    return jev.classify_kind(ai, ext(doc_type), "x", "a.pdf", Usage(), Budget(30))


def _patch(monkeypatch, choice: str, confidence: float):
    async def fake(*a):
        return choice, confidence

    monkeypatch.setattr(jev, "_ask_jev", fake)


def test_fallback_rules():
    assert jev.fallback_kind("train", "") == "train_ticket"
    assert jev.fallback_kind("flight", "Boarding Pass  Gate 12  Boarding time 10:05") == "boarding_pass"
    assert jev.fallback_kind("flight", "E-ticket receipt") == "flight_ticket"
    assert jev.fallback_kind("generic_travel_document", "visa") == "travel_document"


async def test_disabled_uses_fallback():
    assert await run(FakeAI(jev_model=""), "train") == "train_ticket"
    assert await run(FakeAI(key=""), "train") == "train_ticket"


async def test_jev_answer_used(monkeypatch):
    _patch(monkeypatch, "boarding_pass", 0.9)
    assert await run(FakeAI(), "flight") == "boarding_pass"


@pytest.mark.parametrize("choice,conf", [("boarding_pass", 0.2), ("hotel_booking", 0.95), ("nonsense", 0.9)])
async def test_unsure_or_incompatible_falls_back(monkeypatch, choice, conf):
    _patch(monkeypatch, choice, conf)
    assert await run(FakeAI(), "flight") == "flight_ticket"


async def test_failure_falls_back(monkeypatch):
    async def boom(*a):
        raise TimeoutError

    monkeypatch.setattr(jev, "_ask_jev", boom)
    assert await run(FakeAI(), "train") == "train_ticket"


async def test_sends_jev_model_through_openrouter():
    seen = {}

    class AI(FakeAI):
        async def structured(self, **kw):
            seen.update(kw)
            return {"kind": "train_ticket", "confidence": 0.95}

    assert await run(AI(), "train") == "train_ticket"
    assert seen["model"] == "typesafe/jev-router"
    assert seen["schema"]["properties"]["kind"]["enum"]
