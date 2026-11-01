"""OpenRouter chat provider — ordered free-model fallback + in-memory cooldown.

All configuration comes from Settings (env): LLM_API_KEY, LLM_BASE_URL and
LLM_MODELS — the comma-separated fallback chain. No keys or model names are
hard-coded here, logged to users, or returned in responses. The model that
actually answered is recorded in the server log only.
"""

import logging
import time
from collections.abc import AsyncIterator

from openai import APIStatusError, AsyncOpenAI

from ..core.config import Settings

log = logging.getLogger("dadnovin.ai")


class ProviderError(Exception):
    """One model failed — triggers fallback to the next in the chain."""


class AllModelsBusy(ProviderError):
    """Every configured model failed — show the polite busy message."""


# process-local cooldown: model -> monotonic-until. Fine for the single-node
# deploy (documented in README); a multi-worker setup would share via Redis.
_COOLDOWN_UNTIL: dict[str, float] = {}


def _mark_failed(settings: Settings, model: str, exc: BaseException) -> None:
    secs = max(60, settings.llm_cooldown_seconds)  # spec: 1–5 min
    _COOLDOWN_UNTIL[model] = time.monotonic() + secs
    log.warning(
        "llm model %s failed (%s: %s) — cooling %ds",
        model,
        type(exc).__name__,
        str(exc)[:160],
        secs,
    )


def _mark_ok(model: str) -> None:
    _COOLDOWN_UNTIL.pop(model, None)


async def _open_stream(client: AsyncOpenAI, model: str, messages, max_tokens: int):
    """Single model call — the seam tests patch to simulate failures."""
    return await client.chat.completions.create(
        model=model,
        messages=messages,
        max_tokens=max_tokens,
        temperature=0.3,
        stream=True,
    )


async def chat_stream(
    settings: Settings, messages: list[dict], *, max_tokens: int = 700
) -> AsyncIterator[str]:
    """Yield reply text deltas, falling through LLM_MODELS on failure.

    Fallback happens only while a model has emitted nothing — a stream that
    dies *after* its first token raises ProviderError so the caller can end
    cleanly instead of duplicating visible text.
    """
    if not settings.ai_configured:
        raise ProviderError("AI provider is not configured")

    now = time.monotonic()
    skipped = [m for m in settings.llm_model_list if _COOLDOWN_UNTIL.get(m, 0.0) > now]
    models = [m for m in settings.llm_model_list if m not in skipped]
    if skipped:
        log.info("llm models cooling, skipped: %s", skipped)
    if not models:
        raise AllModelsBusy("every model is in cooldown")

    client = AsyncOpenAI(
        base_url=settings.llm_base_url.rstrip("/"),
        api_key=settings.llm_api_key,
        timeout=settings.ai_timeout_seconds,
        max_retries=0,  # our own ordered fallback handles retries
    )
    last_err: BaseException | None = None
    try:
        for model in models:
            emitted = False
            try:
                stream = await _open_stream(client, model, messages, max_tokens)
                async for chunk in stream:
                    if not chunk.choices:
                        continue
                    delta = chunk.choices[0].delta.content
                    if delta:
                        emitted = True
                        yield delta
            except Exception as exc:
                if emitted:
                    raise ProviderError(f"{model}: stream interrupted") from exc
                # auth/config errors fail fast — no model will succeed on a bad key
                if isinstance(exc, APIStatusError) and exc.status_code in (
                    401,
                    403,
                ):
                    raise AllModelsBusy("provider rejected credentials") from exc
                _mark_failed(settings, model, exc)
                last_err = exc
            else:
                if emitted:
                    _mark_ok(model)
                    log.info("llm reply served by model %s", model)
                    return
                # stream completed with zero tokens → count as failure
                last_err = ProviderError(f"{model}: empty stream")
                _mark_failed(settings, model, last_err)
    finally:
        await client.close()

    raise AllModelsBusy(f"all models failed (last: {last_err!r})")


async def chat_complete(
    settings: Settings, messages: list[dict], *, max_tokens: int = 700
) -> str:
    """Non-streaming variant — used by the consultation first-reply draft."""
    parts = [
        delta async for delta in chat_stream(settings, messages, max_tokens=max_tokens)
    ]
    return "".join(parts).strip()
