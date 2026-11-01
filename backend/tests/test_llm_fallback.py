"""LLM fallback chain: 429/5xx/empty/cooldown ordering + no model leakage.

`_open_stream` is the seam — tests replace it with fakes that raise real
openai exceptions or yield fake chunks, without any network.
"""

import httpx
import pytest
from openai import (
    APIConnectionError,
    InternalServerError,
    RateLimitError,
)

from main.ai import provider
from main.ai.prompts import BUSY_REPLY
from main.ai.provider import AllModelsBusy, ProviderError, chat_stream
from main.core.config import get_settings

from .test_ai import parse_sse


def _resp(status: int) -> httpx.Response:
    return httpx.Response(status, request=httpx.Request("POST", "https://x.test"))


class _Delta:
    def __init__(self, content: str | None):
        self.content = content


class _Choice:
    def __init__(self, content: str | None):
        self.delta = _Delta(content)


class _Chunk:
    def __init__(self, content: str | None):
        self.choices = [_Choice(content)]


class FakeStream:
    """Mimics the openai async stream: yields _Chunk objects per delta."""

    def __init__(self, texts: list[str], fail_after: Exception | None = None):
        self._texts = texts
        self._fail_after = fail_after

    async def __aiter__(self):
        for t in self._texts:
            yield _Chunk(t)
        if self._fail_after:
            raise self._fail_after


@pytest.fixture
def llm_settings(monkeypatch):
    """Configure two fake models on the cached settings object."""
    provider._COOLDOWN_UNTIL.clear()
    s = get_settings()
    monkeypatch.setattr(s, "llm_api_key", "test-key")
    monkeypatch.setattr(s, "llm_models", "model-a:free,model-b:free,model-c:free")
    monkeypatch.setattr(s, "ai_enabled", True)
    return s


async def test_429_falls_back_to_next_model(llm_settings, monkeypatch):
    calls = []

    async def fake(_client, model, _messages, _max_tokens):
        calls.append(model)
        if model == "model-a:free":
            raise RateLimitError("slow down", response=_resp(429), body=None)
        return FakeStream(["پاسخ ", "مدل دوم"])

    monkeypatch.setattr(provider, "_open_stream", fake)
    out = "".join([d async for d in chat_stream(llm_settings, [])])
    assert calls == ["model-a:free", "model-b:free"]
    assert out == "پاسخ مدل دوم"


async def test_5xx_and_empty_stream_also_fallback(llm_settings, monkeypatch):
    calls = []

    async def fake(_client, model, _messages, _max_tokens):
        calls.append(model)
        if model == "model-a:free":
            raise InternalServerError("boom", response=_resp(503), body=None)
        if model == "model-b:free":
            return FakeStream([])  # zero-token stream counts as failure
        return FakeStream(["ok"])

    monkeypatch.setattr(provider, "_open_stream", fake)
    out = "".join([d async for d in chat_stream(llm_settings, [])])
    assert calls == ["model-a:free", "model-b:free", "model-c:free"]
    assert out == "ok"


async def test_failed_model_enters_cooldown(llm_settings, monkeypatch):
    calls = []

    async def fake(_client, model, _messages, _max_tokens):
        calls.append(model)
        if model == "model-a:free":
            raise APIConnectionError(request=httpx.Request("POST", "https://x"))
        return FakeStream(["hi"])

    monkeypatch.setattr(provider, "_open_stream", fake)
    async for _ in chat_stream(llm_settings, []):
        pass
    # second call must skip model-a entirely — it is cooling
    calls.clear()
    async for _ in chat_stream(llm_settings, []):
        pass
    assert calls == ["model-b:free"]


async def test_all_models_failed_raises_busy(llm_settings, monkeypatch):
    async def fake(_client, model, _messages, _max_tokens):
        raise RateLimitError("rl", response=_resp(429), body=None)

    monkeypatch.setattr(provider, "_open_stream", fake)
    with pytest.raises(AllModelsBusy):
        async for _ in chat_stream(llm_settings, []):
            pass


async def test_midstream_failure_does_not_duplicate(llm_settings, monkeypatch):
    """A stream that dies after tokens must NOT silently fall to next model."""

    async def fake(_client, model, _messages, _max_tokens):
        return FakeStream(
            ["نیمه‌کاره"],
            fail_after=APIConnectionError(request=httpx.Request("POST", "https://x")),
        )

    monkeypatch.setattr(provider, "_open_stream", fake)
    got = []
    with pytest.raises(ProviderError):
        async for d in chat_stream(llm_settings, []):
            got.append(d)
    assert got == ["نیمه‌کاره"]


async def test_endpoint_fallback_429_and_busy_message(
    client, seeded_session, llm_settings, monkeypatch
):
    """End-to-end: 429 on model A → SSE deltas from B; all-fail → BUSY_REPLY."""

    async def fake(_client, model, _messages, _max_tokens):
        if model == "model-a:free":
            raise RateLimitError("rl", response=_resp(429), body=None)
        return FakeStream(["سلام"])

    monkeypatch.setattr(provider, "_open_stream", fake)
    resp = await client.post(
        "/api/v1/ai/chat",
        json={"messages": [{"role": "user", "content": "سلام"}]},
    )
    assert resp.status_code == 200
    body = parse_sse(resp.text)
    assert "سلام" in body["reply"]
    assert "model-a" not in resp.text and "model-b" not in resp.text

    async def fail_all(_client, model, _messages, _max_tokens):
        raise RateLimitError("rl", response=_resp(429), body=None)

    monkeypatch.setattr(provider, "_open_stream", fail_all)
    provider._COOLDOWN_UNTIL.clear()
    resp2 = await client.post(
        "/api/v1/ai/chat",
        json={"messages": [{"role": "user", "content": "باز"}]},
    )
    body2 = parse_sse(resp2.text)
    assert BUSY_REPLY in body2["reply"]
    assert body2["provider"] == "unavailable"
