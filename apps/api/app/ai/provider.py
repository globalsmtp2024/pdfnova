import json
import os
from dataclasses import dataclass
from typing import Any, Protocol

import httpx

from app.tools.base import JobContext, ToolFailedError

REQUEST_TIMEOUT_SECONDS = 120.0
DEFAULT_MODELS = {
    "anthropic": "claude-sonnet-5-5",
    "openai": "gpt-4.1-mini",
    "google": "gemini-2.0-flash",
    "mistral": "mistral-small-latest",
}
BASE_URLS = {
    "anthropic": "https://api.anthropic.com",
    "openai": "https://api.openai.com",
    "google": "https://generativelanguage.googleapis.com",
    "mistral": "https://api.mistral.ai",
}
MAX_OUTPUT_TOKENS = 4096


class Provider(Protocol):
    def complete(self, system: str, prompt: str, max_tokens: int = MAX_OUTPUT_TOKENS) -> str: ...


@dataclass(frozen=True)
class HttpProvider:
    name: str
    key: str
    model: str
    base_url: str

    def complete(self, system: str, prompt: str, max_tokens: int = MAX_OUTPUT_TOKENS) -> str:
        try:
            with httpx.Client(timeout=REQUEST_TIMEOUT_SECONDS) as client:
                response = self._request(client, system, prompt, max_tokens)
        except httpx.TimeoutException as exc:
            raise ToolFailedError("The AI provider took too long to answer.", code="ai_timeout") from exc
        except httpx.HTTPError as exc:
            raise ToolFailedError("The AI provider could not be reached.", code="ai_unreachable") from exc
        if response.status_code in {401, 403}:
            raise ToolFailedError("The AI key was rejected by the provider.", code="ai_key_rejected")
        if response.status_code == 429:
            raise ToolFailedError(
                "The AI provider is rate limiting this key. Try again soon.", code="ai_rate_limited"
            )
        if response.status_code >= 400:
            raise ToolFailedError("The AI provider returned an error.", code="ai_provider_error")
        return self._text(response.json())

    def _request(self, client: httpx.Client, system: str, prompt: str, max_tokens: int) -> httpx.Response:
        if self.name == "anthropic":
            return client.post(
                f"{self.base_url}/v1/messages",
                headers={"x-api-key": self.key, "anthropic-version": "2023-06-01"},
                json={
                    "model": self.model,
                    "max_tokens": max_tokens,
                    "system": system,
                    "messages": [{"role": "user", "content": prompt}],
                },
            )
        if self.name == "google":
            return client.post(
                f"{self.base_url}/v1beta/models/{self.model}:generateContent",
                headers={"x-goog-api-key": self.key},
                json={
                    "systemInstruction": {"parts": [{"text": system}]},
                    "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                    "generationConfig": {"maxOutputTokens": max_tokens},
                },
            )
        return client.post(
            f"{self.base_url}/v1/chat/completions",
            headers={"authorization": f"Bearer {self.key}"},
            json={
                "model": self.model,
                "max_tokens": max_tokens,
                "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}],
            },
        )

    def _text(self, payload: dict[str, Any]) -> str:
        try:
            if self.name == "anthropic":
                return "".join(block.get("text", "") for block in payload["content"])
            if self.name == "google":
                return "".join(part.get("text", "") for part in payload["candidates"][0]["content"]["parts"])
            return str(payload["choices"][0]["message"]["content"])
        except (KeyError, IndexError, TypeError) as exc:
            raise ToolFailedError(
                "The AI provider sent an unexpected answer.", code="ai_bad_response"
            ) from exc


def provider_for(ctx: JobContext[Any]) -> Provider:
    name = ctx.optional_secret("ai_provider") or "anthropic"
    key = ctx.secret("ai_key")
    base = os.environ.get("AI_BASE_URL_OVERRIDE") or BASE_URLS.get(name, BASE_URLS["anthropic"])
    model = os.environ.get("AI_MODEL_OVERRIDE") or DEFAULT_MODELS.get(name, DEFAULT_MODELS["anthropic"])
    return HttpProvider(name=name, key=key, model=model, base_url=base.rstrip("/"))


def parse_json_block(text: str) -> Any:
    start = min((index for index in (text.find("["), text.find("{")) if index >= 0), default=-1)
    end = max(text.rfind("]"), text.rfind("}"))
    if start < 0 or end < start:
        raise ToolFailedError("The AI answer could not be understood.", code="ai_bad_response")
    try:
        return json.loads(text[start : end + 1])
    except json.JSONDecodeError as exc:
        raise ToolFailedError("The AI answer could not be understood.", code="ai_bad_response") from exc
