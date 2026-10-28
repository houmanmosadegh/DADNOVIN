"""AI provider adapter — OpenAI-compatible chat completions.

Configured purely through environment variables; no keys in code or DB.
"""

import httpx

from ..core.config import Settings


class ProviderError(Exception):
    pass


async def chat_complete(
    settings: Settings, messages: list[dict], *, max_tokens: int = 700
) -> str:
    if not settings.ai_configured:
        raise ProviderError("AI provider is not configured")
    payload = {
        "model": settings.ai_model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": 0.3,
    }
    try:
        async with httpx.AsyncClient(
            base_url=settings.ai_base_url.rstrip("/"),
            headers={"Authorization": f"Bearer {settings.ai_api_key}"},
            timeout=settings.ai_timeout_seconds,
        ) as client:
            resp = await client.post("/chat/completions", json=payload)
            resp.raise_for_status()
            data = resp.json()
    except (httpx.HTTPError, ValueError, KeyError) as exc:
        raise ProviderError(str(exc)) from exc
    try:
        return data["choices"][0]["message"]["content"].strip()
    except (KeyError, IndexError, TypeError) as exc:
        raise ProviderError("malformed provider response") from exc
