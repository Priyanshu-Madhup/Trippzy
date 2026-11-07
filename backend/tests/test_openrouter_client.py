"""The OpenRouter client against a mocked transport: request shape, retries, fallback, budget."""

import json

import httpx
import pytest

from app.ai.client import Budget, OpenRouter, Usage
from app.core.config import Settings
from app.core.errors import AppError

SCHEMA = {"type": "object", "properties": {"a": {"type": "integer"}}, "required": ["a"], "additionalProperties": False}


def make(handler, **settings):
    s = Settings(_env_file=None, openrouter_api_key="k", openrouter_model="m/primary", **settings)
    return OpenRouter(s, httpx.AsyncClient(transport=httpx.MockTransport(handler)))


def ok(content: str, usage=None):
    return httpx.Response(200, json={"choices": [{"message": {"content": content}}], "usage": usage or {"prompt_tokens": 10, "completion_tokens": 5}})


async def call(ai, **kw):
    return await ai.structured(system="s", user="u", schema_name="x", schema=SCHEMA, usage=kw.pop("usage", Usage()), budget=kw.pop("budget", Budget(30)), **kw)


async def test_default_uses_json_mode_with_schema_in_prompt_and_opts_out_of_data_retention():
    seen = []

    def handler(req):
        seen.append(json.loads(req.content))
        return ok('{"a": 1}')

    usage = Usage()
    assert await call(make(handler), usage=usage) == {"a": 1}
    body = seen[0]
    assert body["response_format"] == {"type": "json_object"}
    assert body["provider"] == {"data_collection": "deny"}
    assert body["reasoning"] == {"enabled": False}  # a reasoning model would otherwise spend the whole budget thinking
    assert "JSON Schema" in body["messages"][0]["content"]
    assert (usage.calls, usage.prompt_tokens, usage.completion_tokens, usage.models) == (1, 10, 5, ["m/primary"])
    assert len(seen) == 1  # no wasted strict-mode attempt


async def test_strict_schema_is_opt_in_and_falls_back_when_unsupported():
    seen = []

    def handler(req):
        body = json.loads(req.content)
        seen.append(body["response_format"]["type"])
        return httpx.Response(404, json={"error": {"message": "No endpoints found"}}) if body["response_format"]["type"] == "json_schema" else ok('{"a": 2}')

    assert await call(make(handler, openrouter_json_schema=True)) == {"a": 2}
    assert seen == ["json_schema", "json_object"]


async def test_rate_limit_uses_the_fallback_model():
    models = []

    def handler(req):
        m = json.loads(req.content)["model"]
        models.append(m)
        return httpx.Response(429, headers={"retry-after": "60"}, json={}) if m == "m/primary" else ok('{"a": 3}')

    ai = make(handler, openrouter_fallback_model="m/backup")
    assert await call(ai, budget=Budget(30)) == {"a": 3}
    assert models == ["m/primary", "m/backup"]


async def test_server_errors_are_retried(monkeypatch):
    async def no_sleep(_):
        return None

    monkeypatch.setattr("app.ai.client.asyncio.sleep", no_sleep)
    calls = {"n": 0}

    def handler(req):
        calls["n"] += 1
        return httpx.Response(503, json={}) if calls["n"] < 3 else ok('{"a": 4}')

    usage = Usage()
    assert await call(make(handler), usage=usage) == {"a": 4}
    assert calls["n"] == 3 and usage.retries == 2


async def test_gives_up_when_the_time_budget_is_spent():
    with pytest.raises(AppError) as e:
        await call(make(lambda r: ok('{"a": 1}')), budget=Budget(0))
    assert e.value.status in (502, 504)


async def test_missing_api_key_is_a_clear_error():
    ai = OpenRouter(Settings(_env_file=None, openrouter_api_key=""), httpx.AsyncClient(transport=httpx.MockTransport(lambda r: ok("{}"))))
    with pytest.raises(AppError) as e:
        await call(ai)
    assert e.value.code == "ai_not_configured"
