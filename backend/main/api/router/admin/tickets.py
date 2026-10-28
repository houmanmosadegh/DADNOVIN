"""Ticket admin workflows."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ....db.session import get_db
from ....models.request_ops import RequestMessage
from ....models.ticket import Ticket
from ....services import thread as thread_svc
from ....repositories.requests import list_tickets
from ....schemas.common import Page
from ....schemas.ticket import StaffReplyIn, TicketMessageOut, TicketOut, TicketPatchIn
from ....services.audit import audit
from ...dependencies.auth import SupportDep
from ...dependencies.pagination import PageDep

router = APIRouter(prefix="/tickets", tags=["admin-tickets"])
DbDep = Annotated[AsyncSession, Depends(get_db)]


@router.get("")
async def list_all(
    _: SupportDep,
    db: DbDep,
    page: PageDep,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    q: Annotated[str | None, Query(max_length=100)] = None,
) -> Page[TicketOut]:
    items, total = await list_tickets(
        db, status=status_filter, q=q, offset=page.offset, limit=page.page_size
    )
    return Page[TicketOut](
        items=[TicketOut.model_validate(t) for t in items],
        total=total,
        page=page.page,
        page_size=page.page_size,
    )


@router.get("/{ticket_id}")
async def detail(ticket_id: uuid.UUID, _: SupportDep, db: DbDep) -> TicketOut:
    row = await db.get(Ticket, ticket_id)
    if row is None:
        raise HTTPException(404, {"code": "not_found", "message": "تیکت یافت نشد."})
    await thread_svc.migrate_legacy_thread(db, "ticket", ticket_id)
    out = TicketOut.model_validate(row)
    unified = (
        await db.execute(
            select(RequestMessage)
            .where(
                RequestMessage.request_type == "ticket",
                RequestMessage.request_id == ticket_id,
            )
            .order_by(RequestMessage.created_at)
        )
    ).scalars().all()
    # post-migration the unified thread already contains legacy rows
    out.messages = [
        TicketMessageOut(id=m.id, sender_type="note" if m.is_note else m.sender_type,
                         body=m.body, created_at=m.created_at)
        for m in unified
    ]
    return out


@router.patch("/{ticket_id}")
async def patch(
    ticket_id: uuid.UUID,
    payload: TicketPatchIn,
    request: Request,
    user: SupportDep,
    db: DbDep,
) -> TicketOut:
    row = await db.get(Ticket, ticket_id)
    if row is None:
        raise HTTPException(404, {"code": "not_found", "message": "تیکت یافت نشد."})
    data = payload.model_dump(exclude_unset=True)
    before = {"status": row.status, "priority": row.priority,
              "assigned_to": str(row.assigned_to or "")}
    if "status" in data and data["status"] != row.status:
        await thread_svc.set_status(
            db, "ticket", row, data.pop("status"),
            actor=user, reason=data.pop("reason", "") or "",
        )
    data.pop("reason", None)
    for field, value in data.items():
        setattr(row, field, value)
    await audit(
        db, actor=user, action="ticket.update", entity="ticket",
        entity_id=row.id,
        before=before,
        after={"status": row.status, "priority": row.priority,
               "assigned_to": str(row.assigned_to or "")},
        request=request,
    )
    await db.commit()
    return TicketOut.model_validate(row)


@router.post("/{ticket_id}/messages", status_code=status.HTTP_201_CREATED)
async def staff_reply(
    ticket_id: uuid.UUID,
    payload: StaffReplyIn,
    user: SupportDep,
    db: DbDep,
) -> TicketMessageOut:
    row = await db.get(Ticket, ticket_id)
    if row is None:
        raise HTTPException(404, {"code": "not_found", "message": "تیکت یافت نشد."})
    msg = await thread_svc.add_message(
        db, "ticket", row.id,
        sender_type="staff", sender_id=user.id,
        body=payload.body, is_note=payload.is_note,
    )
    await thread_svc.record_staff_reply(db, "ticket", row, msg, is_note=payload.is_note)
    if not payload.is_note and row.status == "reviewing":
        row.status = "waiting_reply"
    await db.commit()
    return TicketMessageOut(
        id=msg.id, sender_type="note" if msg.is_note else msg.sender_type,
        body=msg.body, created_at=msg.created_at,
    )
