from app.core.config import Settings
from app.schemas.extraction import DocumentExtraction, ProviderRef, TrainData
from app.services import resolvers as r


async def test_platform_logo_is_looked_up_from_the_name_alone(monkeypatch):
    calls = []

    async def fake(s, *, kind, name, domain, iata):
        calls.append((kind, name, domain))
        return {"url": f"https://logo/{name}"}

    monkeypatch.setattr(r, "resolve_logo", fake)
    ext = DocumentExtraction(document_type="train", confidence=0.9, details=TrainData(), booking_platform=ProviderRef(name="Yatra", domain=None))
    out = await r.resolve_ticket_visuals(Settings(), ext)
    assert out["booking_platform_logo_url"] == "https://logo/Yatra"
    assert calls[0] == ("platform", "Yatra", None)
