"""OpenRouter client. All AI traffic goes through the backend; the key never leaves it.

Reliability: one overall time budget per call chain, retry on 429/5xx with the server's
suggested delay, a fallback model on rate limits, strict JSON-schema output with a
JSON-mode fallback, and salvage of fenced / padded JSON.
Privacy: requests ask OpenRouter to route only to providers that don't retain/train on data.
"""

import asyncio
import json
import logging
import re
import time
from dataclasses import dataclass, field

import httpx

from app.core.config import Settings
from app.core.errors import AppError

log = logging.getLogger("trippzy.ai")
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


@dataclass
class Usage:
    """Accumulated per job for observability — numbers only, never content."""

    calls: int = 0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    retries: int = 0
    models: list[str] = field(default_factory=list)

    def add(self, model: str, usage: dict | None) -> None:
        self.calls += 1
        if model not in self.models:
            self.models.append(model)
        if usage:
            self.prompt_tokens += int(usage.get("prompt_tokens") or 0)
            self.completion_tokens += int(usage.get("completion_tokens") or 0)


class Budget:
    def __init__(self, seconds: float) -> None:
        self._end = time.monotonic() + seconds

    def remaining(self) -> float:
        return max(0.0, self._end - time.monotonic())


def _retry_delay(res: httpx.Response) -> float:
    try:
        v = float(res.headers.get("retry-after", ""))
        if v > 0:
            return v
    except ValueError:
        pass
    return 2.0


def parse_json_object(content: str) -> dict:
    t = re.sub(r"```$", "", re.sub(r"^```(?:json)?\s*", "", content.strip(), flags=re.I))
    try:
        v = json.loads(t)
    except json.JSONDecodeError:
        start, end = t.find("{"), t.rfind("}")
        if start < 0 or end <= start:
            raise AppError(502, "ai_invalid_json", "The AI returned an unreadable response.") from None
        try:
            v = json.loads(t[start : end + 1])
        except json.JSONDecodeError:
            raise AppError(502, "ai_invalid_json", "The AI returned an unreadable response.") from None
    if not isinstance(v, dict):
        raise AppError(502, "ai_invalid_json", "The AI returned an unreadable response.")
    return v


class OpenRouter:
    def __init__(self, settings: Settings, http: httpx.AsyncClient | None = None) -> None:
        self.settings = settings
        self._http = http

    def _key(self) -> str:
        if not self.settings.openrouter_api_key:
            raise AppError(503, "ai_not_configured", "AI extraction is not configured on the server.")
        return self.settings.openrouter_api_key

    async def _post(self, payload: dict, budget: Budget, usage: Usage, per_try_timeout: float) -> str:
        """One logical request with retries, bounded by the budget."""
        last: AppError = AppError(502, "ai_error", "The AI service returned an error.")
        for attempt in range(4):
            if budget.remaining() < 3:
                break
            try:
                client = self._http or httpx.AsyncClient()
                try:
                    res = await client.post(
                        OPENROUTER_URL,
                        headers={"authorization": f"Bearer {self._key()}", "content-type": "application/json", "x-title": "Trippzy"},
                        json=payload,
                        timeout=min(per_try_timeout, budget.remaining()),
                    )
                finally:
                    if self._http is None:
                        await client.aclose()
            except httpx.TimeoutException:
                last = AppError(504, "ai_timeout", "The AI took too long to respond.")
                usage.retries += 1
                continue
            except httpx.HTTPError:
                last = AppError(502, "ai_error", "Could not reach the AI service.")
                usage.retries += 1
                await asyncio.sleep(min(1.5 * (attempt + 1), budget.remaining()))
                continue

            if res.status_code == 200:
                data = res.json()
                usage.add(payload["model"], data.get("usage"))
                choice = (data.get("choices") or [{}])[0]
                if choice.get("error"):
                    last = AppError(502, "ai_error", "The AI service returned an error.")
                    usage.retries += 1
                    continue
                return (choice.get("message") or {}).get("content") or ""

            log.warning("openrouter %s %s", payload["model"], res.status_code)
            if res.status_code == 429:
                last = AppError(429, "rate_limited", "The AI is busy right now. Please retry in a minute.")
                delay = _retry_delay(res) + 0.25
                if delay > budget.remaining() - 3:
                    break
                usage.retries += 1
                await asyncio.sleep(delay)
                continue
            if res.status_code >= 500:
                last = AppError(502, "ai_error", "The AI service returned an error.")
                usage.retries += 1
                await asyncio.sleep(min(0.8 * (attempt + 1) ** 2, budget.remaining()))
                continue
            # other 4xx: retrying won't help
            last = AppError(502 if res.status_code != 400 else 400, "ai_bad_request" if res.status_code == 400 else "ai_error", "The AI request was rejected.")
            break
        raise last

    def _base(self, model: str, messages: list[dict], max_tokens: int, temperature: float) -> dict:
        reasoning = {} if self.settings.openrouter_reasoning else {"reasoning": {"enabled": False}}
        return {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            **reasoning,
            # Travel documents can contain passport/visa details: opt out of provider data retention.
            "provider": {"data_collection": "deny"},
        }

    async def structured(
        self,
        *,
        system: str,
        user: str,
        schema_name: str,
        schema: dict,
        usage: Usage,
        budget: Budget,
        max_tokens: int = 3000,
        model: str | None = None,
    ) -> dict:
        primary = model or self.settings.openrouter_model
        try:
            return await self._structured_once(primary, system, user, schema_name, schema, usage, budget, max_tokens)
        except AppError as err:
            fb = self.settings.openrouter_fallback_model
            if err.status == 429 and fb and fb != primary and budget.remaining() > 8:
                log.warning("primary model rate-limited, using fallback")
                return await self._structured_once(fb, system, user, schema_name, schema, usage, budget, max_tokens)
            raise

    async def _structured_once(self, model, system, user, schema_name, schema, usage, budget, max_tokens) -> dict:
        messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
        if self.settings.openrouter_json_schema:
            strict = self._base(model, messages, max_tokens, 0.1)
            strict["response_format"] = {"type": "json_schema", "json_schema": {"name": schema_name, "strict": True, "schema": schema}}
            strict["provider"]["require_parameters"] = True
            try:
                return parse_json_object(await self._post(strict, budget, usage, 60))
            except AppError as err:
                if err.code not in ("ai_bad_request", "ai_invalid_json", "ai_error") or budget.remaining() < 8:
                    raise
        # JSON mode with the schema in the prompt (default; also the fallback for strict mode).
        loose = self._base(
            model,
            [
                {"role": "system", "content": f"{system}\n\nRespond with one JSON object matching this JSON Schema exactly:\n{json.dumps(schema)}"},
                {"role": "user", "content": user},
            ],
            max_tokens,
            0.1,
        )
        loose["response_format"] = {"type": "json_object"}
        return parse_json_object(await self._post(loose, budget, usage, 60))

    async def vision_transcribe(self, images: list[str], prompt: str, usage: Usage, budget: Budget) -> str:
        payload = self._base(
            self.settings.vision_model,
            [{"role": "user", "content": [{"type": "text", "text": prompt}, *({"type": "image_url", "image_url": {"url": u}} for u in images)]}],
            4096,
            0.0,
        )
        return await self._post(payload, budget, usage, 60)
