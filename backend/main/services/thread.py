"""Shared request-thread operations — messages, events, status transitions."""

import uuid
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import get_settings
from ..models.consultation import ConsultationRequest
from ..models.request_ops import (
    REQUEST_TYPES,
    TRANSITIONS,
    ContactRequest,
    RequestEvent,
    RequestMessage,
    TrackingCounter,
)
from ..models.ticket import Ticket
from ..models.user import User
from ..utils.ids import tracking_code
from ..utils.persian import jalali_year

_MODELS = {
    "consultation": ConsultationRequest,
    "ticket": Ticket,
    "contact": ContactRequest,
}


# the public-facing subject line shown in the inbox for each type
def request_subject(row) -> str:
    if isinstance(row, Ticket):
        return row.subject
    if isinstance(row, ContactRequest):
        return row.subject or "درخواست تماس"
    return row.topic or row.service_slug or "درخواست مشاوره"


def requester_name(row) -> str:
    return row.requester_name if isinstance(row, Ticket) else row.full_name


def requester_phone(row) -> str:
    return row.requester_phone if isinstance(row, Ticket) else row.phone


def requester_email(row) -> str:
    return row.requester_email if isinstance(row, Ticket) else row.email


def request_code(row) -> str:
    return row.ticket_number if isinstance(row, Ticket) else row.tracking_code


async def next_tracking_code(db: AsyncSession, request_type: str) -> str:
    """Atomic DN-YYYY-NNNN — one shared sequence per Jalali year.

    Codes must be unique ACROSS types: the public /track endpoint resolves a
    bare code to its request, so per-type sequences would collide.
    """
    year = jalali_year()
    row = (
        await db.execute(
            select(TrackingCounter)
            .where(
                TrackingCounter.year == year,
                TrackingCounter.request_type == "all",
            )
            .with_for_update()
        )
    ).scalar_one_or_none()
    if row is None:
        row = TrackingCounter(year=year, request_type="all", seq=0)
        db.add(row)
        await db.flush()
    row.seq += 1
    await db.flush()
    return tracking_code(year, row.seq)


async def load_request(db: AsyncSession, request_type: str, request_id: uuid.UUID):
    if request_type not in REQUEST_TYPES:
        raise HTTPException(
            400, {"code": "bad_type", "message": "نوع درخواست نامعتبر است."}
        )
    row = await db.get(_MODELS[request_type], request_id)
    if row is None:
        raise HTTPException(404, {"code": "not_found", "message": "درخواست یافت نشد."})
    return row


def _sla_due(row) -> datetime | None:
    return row.sla_due_at


async def add_event(
    db: AsyncSession,
    request_type: str,
    request_id: uuid.UUID,
    event_type: str,
    *,
    actor: User | None = None,
    payload: dict | None = None,
) -> RequestEvent:
    ev = RequestEvent(
        request_type=request_type,
        request_id=request_id,
        event_type=event_type,
        actor_id=actor.id if actor else None,
        actor_username=actor.username if actor else "",
        payload=payload or {},
    )
    db.add(ev)
    await db.flush()
    return ev


async def add_message(
    db: AsyncSession,
    request_type: str,
    request_id: uuid.UUID,
    *,
    sender_type: str,
    sender_id: uuid.UUID | None,
    body: str,
    is_note: bool = False,
    attachments: list | None = None,
) -> RequestMessage:
    msg = RequestMessage(
        request_type=request_type,
        request_id=request_id,
        sender_type=sender_type,
        sender_id=sender_id,
        body=body.strip(),
        is_note=is_note,
        attachments=attachments or [],
    )
    db.add(msg)
    await db.flush()
    return msg


# first staff reply moves a fresh request to its "in progress" state
_IN_PROGRESS = {
    "consultation": "reviewing",
    "ticket": "reviewing",
    "contact": "contacted",
}


async def record_staff_reply(
    db: AsyncSession, request_type: str, row, msg: RequestMessage, *, is_note: bool
) -> None:
    """First non-note staff response → in-progress state + response stamps."""
    now = datetime.now(UTC)
    if is_note:
        return
    row.last_response_at = now
    if row.first_response_at is None:
        row.first_response_at = now
        target = _IN_PROGRESS[request_type]
        if row.status == "new" and target in TRANSITIONS[request_type].get(
            "new", set()
        ):
            row.status = target
    await db.flush()


async def set_status(
    db: AsyncSession,
    request_type: str,
    row,
    new_status: str,
    *,
    actor: User,
    reason: str = "",
) -> None:
    allowed = TRANSITIONS[request_type].get(row.status, frozenset())
    if new_status not in allowed:
        raise HTTPException(
            409,
            {
                "code": "invalid_transition",
                "message": f"انتقال از «{row.status}» به «{new_status}» مجاز نیست.",
            },
        )
    if new_status == "cancelled":
        if not reason.strip():
            raise HTTPException(
                422,
                {"code": "reason_required", "message": "لغو بدون دلیل مجاز نیست."},
            )
        row.cancel_reason = reason.strip()
    before = row.status
    row.status = new_status
    await db.flush()
    await add_event(
        db,
        request_type,
        row.id,
        "status_change",
        actor=actor,
        payload={"from": before, "to": new_status, "reason": reason.strip()},
    )


async def stamp_sla(db: AsyncSession, request_type: str, row) -> None:
    """Give a fresh request a response deadline."""
    if row.sla_due_at is None:
        row.sla_due_at = datetime.now(UTC) + timedelta(
            hours=get_settings().request_sla_hours
        )
        await db.flush()


async def list_thread(
    db: AsyncSession,
    request_type: str,
    request_id: uuid.UUID,
    *,
    include_notes: bool = True,
) -> dict:
    """Merged timeline: messages + events + deliveries, oldest first."""
    msgs = (
        (
            await db.execute(
                select(RequestMessage)
                .where(
                    RequestMessage.request_type == request_type,
                    RequestMessage.request_id == request_id,
                )
                .order_by(RequestMessage.created_at)
            )
        )
        .scalars()
        .all()
    )
    events = (
        (
            await db.execute(
                select(RequestEvent)
                .where(
                    RequestEvent.request_type == request_type,
                    RequestEvent.request_id == request_id,
                )
                .order_by(RequestEvent.created_at)
            )
        )
        .scalars()
        .all()
    )
    if not include_notes:
        msgs = [m for m in msgs if not m.is_note]
    return {"messages": msgs, "events": events}


async def migrate_legacy_thread(
    db: AsyncSession, request_type: str, request_id: uuid.UUID
) -> int:
    """One-off copy of legacy ticket_messages/consultation_notes → request_messages."""
    from ..models.consultation import ConsultationNote
    from ..models.ticket import TicketMessage

    existing = (
        await db.execute(
            select(RequestMessage.id)
            .where(
                RequestMessage.request_type == request_type,
                RequestMessage.request_id == request_id,
            )
            .limit(1)
        )
    ).scalar_one_or_none()
    if existing:
        return 0
    copied = 0
    if request_type == "ticket":
        rows = (
            (
                await db.execute(
                    select(TicketMessage).where(TicketMessage.ticket_id == request_id)
                )
            )
            .scalars()
            .all()
        )
        for r in rows:
            db.add(
                RequestMessage(
                    request_type="ticket",
                    request_id=request_id,
                    sender_type="staff"
                    if r.sender_type in ("staff", "note")
                    else "customer",
                    sender_id=r.sender_id,
                    body=r.body,
                    is_note=r.sender_type == "note",
                    created_at=r.created_at,
                )
            )
            copied += 1
    elif request_type == "consultation":
        rows = (
            (
                await db.execute(
                    select(ConsultationNote).where(
                        ConsultationNote.request_id == request_id
                    )
                )
            )
            .scalars()
            .all()
        )
        for r in rows:
            db.add(
                RequestMessage(
                    request_type="consultation",
                    request_id=request_id,
                    sender_type="staff",
                    sender_id=r.author_id,
                    body=r.body,
                    is_note=True,
                    created_at=r.created_at,
                )
            )
            copied += 1
    if copied:
        await db.flush()
    return copied
