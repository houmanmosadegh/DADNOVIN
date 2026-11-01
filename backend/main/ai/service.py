"""Assistant orchestration: retrieve → guard → generate → persist."""

import uuid
from collections.abc import AsyncIterator

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import get_settings
from ..models.ai import AIConversation, AIMessage
from .provider import ProviderError, chat_complete, chat_stream
from .prompts import (
    BUSY_REPLY,
    FALLBACK_REPLY,
    GROUNDING_NOTE,
    SYSTEM_PROMPT,
    knowledge_block,
    sanitize_chunk,
)
from .render import sanitize_display_text
from .retrieval import search_knowledge
from .schemas import ChatIn


async def _get_or_create_conversation(
    db: AsyncSession, session_key: str
) -> AIConversation:
    if session_key:
        conv = (
            await db.execute(
                select(AIConversation).where(AIConversation.session_key == session_key)
            )
        ).scalar_one_or_none()
        if conv is not None:
            return conv
    conv = AIConversation(session_key=session_key or uuid.uuid4().hex[:24])
    db.add(conv)
    await db.flush()
    return conv


def _build_messages(settings, context: str, history: list[dict] | None) -> list[dict]:
    """System prompt + knowledge block + last N sanitized turns (spec: 10–20)."""
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "system", "content": context},
    ]
    for m in (history or [])[-settings.llm_history_messages :]:
        content = sanitize_chunk(m.get("content", ""))
        role = m.get("role", "user")
        if content and role in {"user", "assistant"}:
            messages.append({"role": role, "content": content})
    return messages


async def generate_reply(
    db: AsyncSession, user_text: str, history: list[dict] | None = None
) -> tuple[str, str, list[str]]:
    """Retrieve knowledge → call provider (or honest fallback) → (reply, provider, source_titles)."""
    settings = get_settings()
    sources = await search_knowledge(db, user_text)
    context = knowledge_block([(s.title, s.body) for s in sources])

    reply: str
    provider: str
    if settings.ai_configured:
        messages = _build_messages(settings, context, history)
        try:
            reply = await chat_complete(settings, messages)
            provider = "model"
        except ProviderError:
            reply = _retrieval_fallback(sources)
            provider = "retrieval"
    else:
        reply = _retrieval_fallback(sources)
        provider = "retrieval" if sources else "unavailable"

    if GROUNDING_NOTE not in reply and provider != "unavailable":
        reply = reply.rstrip() + "\n\n" + GROUNDING_NOTE
    return reply, provider, [s.title for s in sources]


async def consultation_draft(
    db: AsyncSession, *, topic: str, service_slug: str, message: str
) -> str | None:
    """First AI information message attached to a fresh consultation request.

    Returns None when nothing useful can be said — never invents an answer.
    """
    prompt = (
        f"موضوع درخواست مشاوره: {topic}\n"
        f"حوزهٔ خدمت: {service_slug}\n"
        f"شرح موکل: {message}\n\n"
        "بر اساس اطلاعات سایت، یک پاسخ اولیهٔ کلی و کوتاه بده: مسیر کلی قانونی، "
        "مدارک/اطلاعاتی که بهتر است آماده شود و اینکه کارشناسان به‌زودی تماس می‌گیرند."
    )
    reply, provider, _ = await generate_reply(db, prompt)
    if provider == "unavailable":
        return None
    return reply


async def stream_answer(db: AsyncSession, payload: ChatIn) -> AsyncIterator[dict]:
    """SSE event stream for /ai/chat: meta → delta* → done|error.

    Persists the user message up front and the full assistant reply after the
    stream ends; the router commits once the generator completes. When every
    model fails, the polite BUSY_REPLY is sent instead — provider internals
    and model names never reach the client.
    """
    settings = get_settings()
    conv = await _get_or_create_conversation(db, payload.session_key)
    last_user = next(
        (m.content for m in reversed(payload.messages) if m.role == "user"), ""
    )
    db.add(AIMessage(conversation_id=conv.id, role="user", content=last_user))
    await db.flush()

    sources = await search_knowledge(db, last_user)
    yield {
        "type": "meta",
        "session_key": conv.session_key,
        "sources": [s.title for s in sources][:5],
    }

    parts: list[str] = []
    provider = "model"
    if settings.ai_configured:
        context = knowledge_block([(s.title, s.body) for s in sources])
        messages = _build_messages(
            settings, context, [m.model_dump() for m in payload.messages]
        )
        cap = settings.ai_max_reply_chars
        try:
            async for delta in chat_stream(settings, messages):
                parts.append(delta)
                yield {"type": "delta", "text": delta}
                if sum(len(p) for p in parts) >= cap:
                    break
        except ProviderError:
            if parts:
                # mid-stream failure: keep what was shown, end with a clean error
                yield {"type": "error", "message": BUSY_REPLY}
            else:
                provider = "unavailable"
                parts = [BUSY_REPLY]
                yield {"type": "delta", "text": BUSY_REPLY}
    else:
        provider = "retrieval" if sources else "unavailable"
        parts = [_retrieval_fallback(sources)]
        yield {"type": "delta", "text": parts[0]}

    reply = "".join(parts).strip()
    if (
        provider != "unavailable"
        and reply
        and GROUNDING_NOTE not in reply
        and len(reply) < settings.ai_max_reply_chars
    ):
        note = "\n\n" + GROUNDING_NOTE
        reply += note
        yield {"type": "delta", "text": note}

    db.add(AIMessage(conversation_id=conv.id, role="assistant", content=reply))
    await db.flush()
    yield {"type": "done", "provider": provider}


def _retrieval_fallback(sources) -> str:
    """Honest answer built directly from retrieved info — no LLM needed."""
    if not sources:
        return FALLBACK_REPLY
    top = sources[0]
    body = sanitize_display_text(top.body).strip()
    if not body:
        return FALLBACK_REPLY
    if len(body) > 900:
        body = body[:900].rsplit(" ", 1)[0] + "…"
    return f"بر اساس اطلاعات سایت ({top.title}):\n\n{body}"
