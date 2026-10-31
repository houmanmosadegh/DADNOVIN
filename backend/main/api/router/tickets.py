"""Public ticket endpoints — ticket number + access code auth (no accounts)."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.config import get_settings
from ...core.rate_limit import client_key, limiter
from ...db.session import get_db
from ...models.ticket import Ticket
from ...schemas.ticket import (
    TicketCreatedOut,
    TicketCreateIn,
    TicketMessageOut,
    TicketPublicOut,
    TicketReplyIn,
    TicketTrackIn,
)
from ...security.passwords import hash_password, verify_password
from ...models.request_ops import RequestMessage
from ...services import thread as thread_svc
from ...utils.ids import access_code

router = APIRouter(prefix="/tickets", tags=["tickets"])
DbDep = Annotated[AsyncSession, Depends(get_db)]


async def _authenticate_ticket(
    db: AsyncSession, request: Request, number: str, code: str
) -> Ticket:
    """Lookup by number + verify access code — generic failure message."""
    limiter.check(
        "ticket_lookup",
        client_key(request),
        get_settings().rate_limit_public_post_per_minute,
    )
    ticket = (
        await db.execute(
            select(Ticket).where(Ticket.ticket_number == number.upper().strip())
        )
    ).scalar_one_or_none()
    if ticket is None or not verify_password(code, ticket.access_code_hash):
        raise HTTPException(
            404,
            {"code": "not_found", "message": "تیکت یافت نشد یا کد پیگیری اشتباه است."},
        )
    return ticket


async def _public_view(db: AsyncSession, ticket: Ticket) -> TicketPublicOut:
    """Public thread — unified messages preferred, legacy rows merged in."""
    unified = (
        (
            await db.execute(
                select(RequestMessage)
                .where(
                    RequestMessage.request_type == "ticket",
                    RequestMessage.request_id == ticket.id,
                    RequestMessage.is_note.is_(False),
                )
                .order_by(RequestMessage.created_at)
            )
        )
        .scalars()
        .all()
    )
    # once unified messages exist they already include migrated legacy rows
    msgs = (
        list(unified)
        if unified
        else [m for m in ticket.messages if m.sender_type != "note"]
    )
    msgs.sort(key=lambda m: m.created_at)
    return TicketPublicOut(
        ticket_number=ticket.ticket_number,
        subject=ticket.subject,
        category=ticket.category,
        status=ticket.status,
        created_at=ticket.created_at,
        messages=[TicketMessageOut.model_validate(m) for m in msgs],
    )


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_ticket(
    payload: TicketCreateIn, request: Request, db: DbDep
) -> TicketCreatedOut:
    limiter.check(
        "ticket_create",
        client_key(request),
        get_settings().rate_limit_public_post_per_minute,
    )
    if payload.website:  # honeypot
        return TicketCreatedOut(ticket_number="DN-00000", access_code="00000000")
    code = access_code()
    number = await thread_svc.next_tracking_code(db, "ticket")
    ticket = Ticket(
        ticket_number=number,
        access_code_hash=hash_password(code),
        requester_name=payload.requester_name.strip(),
        requester_phone=payload.requester_phone,
        requester_email=payload.requester_email.strip(),
        subject=payload.subject.strip(),
        category=payload.category,
    )
    db.add(ticket)
    await db.flush()
    await thread_svc.stamp_sla(db, "ticket", ticket)
    await thread_svc.add_event(
        db, "ticket", ticket.id, "created", payload={"category": ticket.category}
    )
    await thread_svc.add_message(
        db,
        "ticket",
        ticket.id,
        sender_type="customer",
        sender_id=None,
        body=payload.body,
    )
    await db.commit()
    return TicketCreatedOut(ticket_number=number, access_code=code)


@router.post("/track")
async def track_ticket(
    payload: TicketTrackIn, request: Request, db: DbDep
) -> TicketPublicOut:
    ticket = await _authenticate_ticket(
        db, request, payload.ticket_number, payload.access_code
    )
    return await _public_view(db, ticket)


@router.post("/reply", status_code=status.HTTP_201_CREATED)
async def customer_reply(payload: TicketReplyIn, request: Request, db: DbDep):
    ticket = await _authenticate_ticket(
        db, request, payload.ticket_number, payload.access_code
    )
    if ticket.status in ("closed", "cancelled"):
        raise HTTPException(
            409, {"code": "closed", "message": "این تیکت بسته شده است."}
        )
    await thread_svc.add_message(
        db,
        "ticket",
        ticket.id,
        sender_type="customer",
        sender_id=None,
        body=payload.body,
    )
    if ticket.status in ("resolved", "waiting_reply"):
        ticket.status = "reviewing"
    await thread_svc.add_event(db, "ticket", ticket.id, "customer_reply")
    await db.commit()
    return {"message": "پاسخ شما ثبت شد."}
