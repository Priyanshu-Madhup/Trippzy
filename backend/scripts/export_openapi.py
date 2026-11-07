"""Write the API's OpenAPI schema to ../openapi.json. The mobile app generates its TypeScript
types from this file (`npm run api:types` in /mobile), so Pydantic stays the single source of truth.

    uv run python scripts/export_openapi.py
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # make `app` importable when run as a script

from mongomock_motor import AsyncMongoMockClient  # noqa: E402

from app.context import build_ctx  # noqa: E402
from app.core.config import Settings  # noqa: E402
from app.main import create_app  # noqa: E402


class _NoStorage:  # the schema doesn't need a real bucket
    pass


def main() -> None:
    settings = Settings(env="dev")
    app = create_app(settings, build_ctx(settings, AsyncMongoMockClient()["schema"], storage=_NoStorage()))  # type: ignore[arg-type]
    out = Path(__file__).resolve().parents[2] / "openapi.json"
    out.write_text(json.dumps(app.openapi(), indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
