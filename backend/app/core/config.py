import base64
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    env: str = "dev"
    log_level: str = "INFO"

    mongodb_uri: str = "mongodb://localhost:27017"
    mongodb_db: str = "trippzy"

    # Either set the issuer (your Clerk Frontend API URL) or just the publishable key, from which it is derived.
    clerk_issuer: str = ""
    clerk_publishable_key: str = ""
    # Only needed for account deletion and filling in name/email on first sign-in.
    clerk_secret_key: str = ""
    clerk_authorized_parties: str = ""

    r2_endpoint: str = ""
    r2_access_key_id: str = ""
    r2_secret_access_key: str = ""
    r2_bucket: str = "trippzy"

    openrouter_api_key: str = ""
    openrouter_model: str = "qwen/qwen3.7-flash"
    openrouter_fallback_model: str = ""
    openrouter_vision_model: str = ""
    # Strict json_schema output. Off by default: qwen/qwen3.7-flash advertises `response_format`
    # (JSON mode) but not `structured_outputs`. Our normaliser + Pydantic validate the result anyway.
    openrouter_json_schema: bool = False
    # qwen/qwen3.7-flash is a reasoning model: left on, it burned the whole token budget "thinking" and
    # returned an empty answer. Extraction is copy-and-normalise, so reasoning is off (faster, ~4x cheaper).
    openrouter_reasoning: bool = False

    # Replaces the built-in "photo editor" prompt that decides what to photograph for a trip's cover (see prompts.COVER_IMAGE_SYSTEM).
    cover_image_prompt: str = ""
    # TomTom (routing with live + predicted traffic, place search) for the "Trippzy Note" on Home.
    tomtom_api_key: str = ""
    unsplash_access_key: str = ""
    pexels_api_key: str = ""
    google_places_api_key: str = ""
    logo_dev_token: str = ""

    run_worker_in_api: bool = True

    # App updates: the GitHub repo ("owner/name") whose Releases carry the APK + notes. A token is only needed for a private repo.
    github_repo: str = ""
    github_token: str = ""
    # Public https URL of this API (Railway domain). Used for the download link handed to the app.
    public_base_url: str = ""

    # Upload limits (match the app)
    max_upload_bytes: int = 20 * 1024 * 1024
    upload_url_ttl_s: int = 600
    download_url_ttl_s: int = 600

    @property
    def authorized_parties(self) -> list[str]:
        return [p.strip() for p in self.clerk_authorized_parties.split(",") if p.strip()]

    @property
    def issuer(self) -> str:
        """Clerk's token issuer: decoded from the publishable key (`pk_test_<base64 of
        "<frontend-api-domain>$">`), which can't be mistyped; CLERK_ISSUER is only a fallback."""
        key = self.clerk_publishable_key.strip()
        if key.startswith(("pk_test_", "pk_live_")):
            try:
                raw = key.split("_", 2)[2]
                domain = base64.b64decode(raw + "=" * (-len(raw) % 4)).decode("ascii").rstrip("$")
                if domain and "." in domain:
                    return f"https://{domain}"
            except Exception:
                pass
        if self.clerk_issuer.strip():
            url = self.clerk_issuer.strip().rstrip("/")
            return url if url.startswith("http") else f"https://{url}"
        return ""

    @property
    def vision_model(self) -> str:
        return self.openrouter_vision_model or self.openrouter_model

    @property
    def is_prod(self) -> bool:
        return self.env == "prod"


# Wikimedia (photos, "About" text) answers 403 to User-Agents that don't identify the app with a
# contact URL. Replace with your real site / repo URL once you have one.
USER_AGENT = "Trippzy/1.0 (+https://trippzy.app; travel document organizer) httpx"


@lru_cache
def get_settings() -> Settings:
    return Settings()
