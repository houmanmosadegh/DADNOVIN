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


async def answer(db: AsyncSession, payload: ChatIn) -> ChatOut:
    settings = get_settings()
    conv = await _get_or_create_conversation(db, payload.session_key)

    last_user = next(
        (m.content for m in reversed(payload.messages) if m.role == "user"), ""
    )
    sources = await search_knowledge(db, last_user)
    context = knowledge_block([(s.title, s.body) for s in sources])
    source_titles = [s.title for s in sources]

    db.add(AIMessage(conversation_id=conv.id, role="user", content=last_user))

    reply: str
    provider: str
    if settings.ai_configured and settings.ai_enabled:
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "system", "content": context},
        ]
        for m in payload.messages[-8:]:
            content = sanitize_chunk(m.content)
            if content:
                messages.append({"role": m.role, "content": content})
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
