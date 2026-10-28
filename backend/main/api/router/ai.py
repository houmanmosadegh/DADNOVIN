"""Public AI assistant endpoint."""

from typing import Annotated

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from ...ai.schemas import ChatIn, ChatOut
from ...ai.service import answer
from ...core.config import get_settings
from ...core.rate_limit import client_key, limiter
from ...db.session import get_db

router = APIRouter(prefix="/ai", tags=["ai"])
DbDep = Annotated[AsyncSession, Depends(get_db)]


@router.post("/chat")
async def chat(payload: ChatIn, request: Request, db: DbDep) -> ChatOut:
    """Answer using approved site knowledge only (rate-limited)."""
    limiter.check("ai_chat", client_key(request), get_settings().rate_limit_ai_per_minute)
    result = await answer(db, payload)
    await db.commit()
    return result
