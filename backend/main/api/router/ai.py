"""Public AI assistant endpoint — SSE streaming chat."""

import json
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from ...ai.prompts import BUSY_REPLY
from ...ai.schemas import ChatIn
from ...ai.service import stream_answer
from ...core.config import get_settings
from ...core.rate_limit import client_key, limiter
from ...db.session import get_db

router = APIRouter(prefix="/ai", tags=["ai"])
DbDep = Annotated[AsyncSession, Depends(get_db)]


@router.post("/chat")
async def chat(payload: ChatIn, request: Request, db: DbDep) -> StreamingResponse:
    """Stream the assistant reply as SSE `data:` events (rate-limited per IP).

    Event shapes: {"type":"meta"} → {"type":"delta"}* → {"type":"done"} —
    or {"type":"error"} when a reply breaks after text was already shown.
    """
    limiter.check(
        "ai_chat", client_key(request), get_settings().rate_limit_ai_per_minute
    )

    async def event_stream():
        try:
            async for ev in stream_answer(db, payload):
                yield f"data: {json.dumps(ev, ensure_ascii=False)}\n\n"
            await db.commit()
        except Exception:
            await db.rollback()
            # no internals leak — the same polite busy message the spec wants
            err = json.dumps(
                {"type": "error", "message": BUSY_REPLY}, ensure_ascii=False
            )
            yield f"data: {err}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # let nginx pass chunks through
        },
    )
