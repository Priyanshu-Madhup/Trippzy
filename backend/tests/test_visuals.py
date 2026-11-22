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


def test_curated_logos_win_for_known_platforms():
    assert r._curated_logo("Yatra.com", None) == "https://trippzy.app/logos/yatra.png"
    assert r._curated_logo("MakeMyTrip", "makemytrip.com") == "https://trippzy.app/logos/makemytrip.png"
    assert r._curated_logo("Goibibo", "goibibo.com") is None


async def test_resolve_logo_serves_the_curated_logo_without_any_lookup(monkeypatch):
    async def boom(*a, **k):
        raise AssertionError("no network lookup expected")

    monkeypatch.setattr(r, "_by_domain", boom)
    out = await r.resolve_logo(Settings(), kind="platform", name="Yatra.com", domain=None, iata=None)
    assert out["url"] == "https://trippzy.app/logos/yatra.png" and out["source"] == "curated"
