import base64

from app.core.config import Settings


def pk(domain: str, kind="pk_test") -> str:
    return f"{kind}_" + base64.b64encode(f"{domain}$".encode()).decode().rstrip("=")


def test_issuer_is_derived_from_the_publishable_key():
    assert Settings(_env_file=None, clerk_publishable_key=pk("sharp-fox-12.clerk.accounts.dev")).issuer == "https://sharp-fox-12.clerk.accounts.dev"
    assert Settings(_env_file=None, clerk_publishable_key=pk("clerk.trippzy.app", "pk_live")).issuer == "https://clerk.trippzy.app"


def test_publishable_key_beats_a_stale_issuer():
    # a wrong CLERK_ISSUER left in .env must not break auth once the key is set
    s = Settings(_env_file=None, clerk_issuer="wrong.example", clerk_publishable_key=pk("right.clerk.accounts.dev"))
    assert s.issuer == "https://right.clerk.accounts.dev"


def test_issuer_fallback_gets_a_scheme_and_no_trailing_slash():
    assert Settings(_env_file=None, clerk_issuer="foo.clerk.accounts.dev/").issuer == "https://foo.clerk.accounts.dev"
    assert Settings(_env_file=None, clerk_issuer="https://foo.clerk.accounts.dev").issuer == "https://foo.clerk.accounts.dev"


def test_missing_or_malformed_key_gives_no_issuer_so_auth_refuses_to_run():
    for key in ("", "sk_test_abc", "pk_test_%%%", "pk_test_" + base64.b64encode(b"nodots$").decode()):
        assert Settings(_env_file=None, clerk_publishable_key=key).issuer == ""
