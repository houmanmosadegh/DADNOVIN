"""AI assistant admin — knowledge CRUD, sync, status, conversations."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ....ai.knowledge import sync_knowledge
from ....ai.schemas import (
    AiStatusOut,
    ConversationOut,
    KnowledgeIn,
    KnowledgeOut,
    KnowledgePatchIn,
)
from ....core.config import get_settings
from ....db.session import get_db
from ....models.ai import AIConversation, AIKnowledgeSource
from ....services.audit import audit
from ...dependencies.auth import AdminDep, EditorDep
from ...dependencies.pagination import PageDep

router = APIRouter(prefix="/ai", tags=["admin-ai"])
DbDep = Annotated[AsyncSession, Depends(get_db)]


@router.get("/status")
async def ai_status(_: AdminDep, db: DbDep) -> AiStatusOut:
    settings = get_settings()
    sources = (await db.execute(select(func.count(AIKnowledgeSource.id)))).scalar_one()
    return AiStatusOut(
        configured=settings.ai_configured,
        enabled=settings.ai_enabled,
        knowledge_sources=sources,
    )


@router.get("/knowledge")
async def list_knowledge(_: AdminDep, db: DbDep, page: PageDep) -> dict:
    total = (await db.execute(select(func.count(AIKnowledgeSource.id)))).scalar_one()
    items = (
        await db.execute(
            select(AIKnowledgeSource)
            .order_by(AIKnowledgeSource.updated_at.desc())
            .offset(page.offset)
            .limit(page.page_size)
        )
    ).scalars()
    return {
        "items": [KnowledgeOut.model_validate(r) for r in items],
        "total": total,
        "page": page.page,
        "page_size": page.page_size,
    }


@router.post("/knowledge", status_code=status.HTTP_201_CREATED)
async def create_knowledge(
    payload: KnowledgeIn, request: Request, user: EditorDep, db: DbDep
) -> KnowledgeOut:
    import hashlib

    row = AIKnowledgeSource(
        source_type=payload.source_type,
        ref_id=payload.ref_id or uuid.uuid4().hex[:12],
        title=payload.title.strip(),
        body=payload.body.strip(),
        is_active=payload.is_active,
        content_hash=hashlib.sha256(payload.body.encode()).hexdigest(),
    )
    db.add(row)
    await db.flush()
    await audit(
        db,
        actor=user,
        action="knowledge.create",
        entity="knowledge",
        entity_id=row.id,
        request=request,
    )
    await db.commit()
    return KnowledgeOut.model_validate(row)


@router.patch("/knowledge/{row_id}")
async def patch_knowledge(
    row_id: uuid.UUID,
    payload: KnowledgePatchIn,
    request: Request,
    user: EditorDep,
    db: DbDep,
) -> KnowledgeOut:
    row = await db.get(AIKnowledgeSource, row_id)
    if row is None:
        raise HTTPException(404, {"code": "not_found", "message": "رکورد یافت نشد."})
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    await audit(
        db,
        actor=user,
        action="knowledge.update",
        entity="knowledge",
        entity_id=row.id,
        request=request,
    )
    await db.commit()
    return KnowledgeOut.model_validate(row)


@router.delete("/knowledge/{row_id}")
async def delete_knowledge(
    row_id: uuid.UUID, request: Request, user: EditorDep, db: DbDep
):
    row = await db.get(AIKnowledgeSource, row_id)
    if row is None:
        raise HTTPException(404, {"code": "not_found", "message": "رکورد یافت نشد."})
    await audit(
        db,
        actor=user,
        action="knowledge.delete",
        entity="knowledge",
        entity_id=row.id,
        request=request,
    )
    await db.delete(row)
    await db.commit()
    return {"message": "رکورد حذف شد."}


@router.post("/sync")
async def sync(request: Request, user: EditorDep, db: DbDep) -> dict:
    """Rebuild knowledge from published pages/settings/lawyers (idempotent)."""
    changed = await sync_knowledge(db)
    await audit(
        db,
        actor=user,
        action="knowledge.sync",
        entity="knowledge",
        detail={"changed": changed},
        request=request,
    )
    await db.commit()
    return {"message": f"{changed} رکورد به‌روزرسانی شد.", "changed": changed}


@router.get("/conversations")
async def conversations(_: AdminDep, db: DbDep, page: PageDep) -> dict:
    total = (await db.execute(select(func.count(AIConversation.id)))).scalar_one()
    items = (
        await db.execute(
            select(AIConversation)
            .order_by(AIConversation.created_at.desc())
            .offset(page.offset)
            .limit(page.page_size)
        )
    ).scalars()
    return {
        "items": [
            {
                "id": str(c.id),
                "session_key": c.session_key,
                "created_at": c.created_at.isoformat(),
                "message_count": len(c.messages),
            }
            for c in items
        ],
        "total": total,
        "page": page.page,
        "page_size": page.page_size,
    }


@router.get("/conversations/{conv_id}")
async def conversation_detail(
    conv_id: uuid.UUID, _: AdminDep, db: DbDep
) -> ConversationOut:
    row = await db.get(AIConversation, conv_id)
    if row is None:
        raise HTTPException(404, {"code": "not_found", "message": "گفتگو یافت نشد."})
    return ConversationOut.model_validate(row)
