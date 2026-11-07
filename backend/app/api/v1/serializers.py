from app.repositories.base import to_api


def ticket_out(doc: dict) -> dict:
    """API shape of a ticket: no raw OCR text, plus a `has_file` flag instead of storage paths."""
    out = to_api(doc) or {}
    out.pop("raw_text", None)
    out["has_file"] = bool(out.get("document_id"))
    return out


def trip_out(doc: dict) -> dict:
    return to_api(doc) or {}
