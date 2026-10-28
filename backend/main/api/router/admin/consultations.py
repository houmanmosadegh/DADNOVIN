"""Consultation request admin workflows."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ....db.session import get_db
from ....models.consultation import ConsultationRequest
from ....models.request_ops import RequestMessage
from ....services import thread as thread_svc
from ....repositories.requests import list_consultations
from ....schemas.common import Page
from ....schemas.consultation import (
    ConsultationOut,
    ConsultationPatchIn,
    NoteIn,
    NoteOut,
)
from ....services.audit import audit
from ...dependencies.auth import SupportDep
from ...dependencies.pagination import PageDep

router = APIRouter(prefix="/consultations", tags=["admin-consultations"])
DbDep = Annotated[AsyncSession, Depends(get_db)]


@router.get("")
async def list_all(
    _: SupportDep,
    db: DbDep,
    page: PageDep,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    q: Annotated[str | None, Query(max_length=100)] = None,
) -> Page[ConsultationOut]:
    items, total = await list_consultations(
        db, status=status_filter, q=q, offset=page.offset, limit=page.page_size
    )
    return Page[ConsultationOut](
        items=[ConsultationOut.model_validate(r) for r in items],
        total=total,
        page=page.page,
        page_size=page.page_size,
    )


@router.get("/{request_id}")
async def detail(request_id: uuid.UUID, _: SupportDep, db: DbDep) -> ConsultationOut:
    row = await db.get(ConsultationRequest, request_id)
    if row is None:
        raise HTTPException(404, {"code": "not_found", "message": "درخواست یافت نشد."})
    await thread_svc.migrate_legacy_thread(db, "consultation", request_id)
    out = ConsultationOut.model_validate(row)
    # post-migration the unified thread already contains legacy notes
    unified = (
        await db.execute(
            select(RequestMessage)
            .where(
                RequestMessage.request_type == "consultation",
                RequestMessage.request_id == request_id,
                RequestMessage.is_note.is_(True),
            )
            .order_by(RequestMessage.created_at)
        )
    ).scalars().all()
    out.notes = [
        NoteOut(id=m.id, author_id=m.sender_id, body=m.body, created_at=m.created_at)
        for m in unified
    ]
    return out


@router.patch("/{request_id}")
async def patch(
    request_id: uuid.UUID,
    payload: ConsultationPatchIn,
    request: Request,
    user: SupportDep,
    db: DbDep,
) -> ConsultationOut:
    row = await db.get(ConsultationRequest, request_id)
    if row is None:
        raise HTTPException(404, {"code": "not_found", "message": "درخواست یافت نشد."})
    data = payload.model_dump(exclude_unset=True)
    before = {"status": row.status, "assigned_to": str(row.assigned_to or "")}
    if "status" in data and data["status"] != row.status:
        await thread_svc.set_status(
            db, "consultation", row, data.pop("status"),
            actor=user, reason=data.pop("reason", "") or "",
        )
    data.pop("reason", None)
    for field, value in data.items():
        setattr(row, field, value)
    await audit(
        db, actor=user, action="consultation.update", entity="consultation",
        entity_id=row.id,
        before=before,
        after={"status": row.status, "assigned_to": str(row.assigned_to or "")},
        request=request,
    )
    await db.commit()
    return ConsultationOut.model_validate(row)


@router.post("/{request_id}/notes", status_code=status.HTTP_201_CREATED)
async def add_note(
    request_id: uuid.UUID,
    payload: NoteIn,
    user: SupportDep,
    db: DbDep,
) -> NoteOut:
    row = await db.get(ConsultationRequest, request_id)
    if row is None:
        raise HTTPException(404, {"code": "not_found", "message": "درخواست یافت نشد."})
    msg = await thread_svc.add_message(
        db, "consultation", row.id,
        sender_type="staff", sender_id=user.id,
        body=payload.body, is_note=True,
    )
    await db.commit()
    return NoteOut(
        id=msg.id, author_id=msg.sender_id, body=msg.body, created_at=msg.created_at
    )
