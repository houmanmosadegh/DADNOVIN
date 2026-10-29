"""Assistant orchestration: retrieve → guard → generate → persist."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import get_settings
from ..models.ai import AIConversation, AIMessage
from .provider import ProviderError, chat_complete
from .prompts import (
    FALLBACK_REPLY,
    GROUNDING_NOTE,
    SYSTEM_PROMPT,
    knowledge_block,
    sanitize_chunk,
)
from .retrieval import search_knowledge
from .schemas import ChatIn, ChatOut


async def _get_or_create_conversation(
    db: AsyncSession, session_key: str
) -> AIConversation:
    if session_key:
        conv = (
            await db.execute(
                select(AIConversation).where(
                    AIConversation.session_key == session_key
                )
            )
        ).scalar_one_or_none()
        if conv is not None:
            return conv
    conv = AIConversation(session_key=session_key or uuid.uuid4().hex[:24])
    db.add(conv)
    await db.flush()
    return conv


async def generate_reply(
    db: AsyncSession, user_text: str, history: list[dict] | None = None
) -> tuple[str, str, list[str]]:
    """Retrieve knowledge → call provider (or honest fallback) → (reply, provider, source_titles)."""
    settings = get_settings()
    sources = await search_knowledge(db, user_text)
    context = knowledge_block([(s.title, s.body) for s in sources])

    reply: str
    provider: str
    if settings.ai_configured and settings.ai_enabled:
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "system", "content": context},
        ]
        for m in (history or [])[-8:]:
            content = sanitize_chunk(m.get("content", ""))
            role = m.get("role", "user")
            if content and role in {"user", "assistant"}:
                messages.append({"role": role, "content": content})
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


async def answer(db: AsyncSession, payload: ChatIn) -> ChatOut:
    conv = await _get_or_create_conversation(db, payload.session_key)

    last_user = next(
        (m.content for m in reversed(payload.messages) if m.role == "user"), ""
    )

    db.add(AIMessage(conversation_id=conv.id, role="user", content=last_user))

    reply, provider, source_titles = await generate_reply(
        db, last_user, [m.model_dump() for m in payload.messages]
    )

    db.add(AIMessage(conversation_id=conv.id, role="assistant", content=reply))
    await db.flush()
    return ChatOut(
        reply=reply,
        session_key=conv.session_key,
        sources=source_titles[:5],
        provider=provider,
    )


def _retrieval_fallback(sources) -> str:
    """Honest answer built directly from retrieved info — no LLM needed."""
    if not sources:
        return FALLBACK_REPLY
    top = sources[0]
    body = top.body.strip()
    if len(body) > 900:
        body = body[:900].rsplit(" ", 1)[0] + "…"
    return f"بر اساس اطلاعات سایت ({top.title}):\n\n{body}"
