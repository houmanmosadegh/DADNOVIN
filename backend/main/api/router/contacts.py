"""Public contact requests + unified /track for all request types."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.config import get_settings
from ...core.rate_limit import client_key, limiter
from ...security.passwords import hash_password, verify_password
from ...db.session import get_db
from ...models.consultation import ConsultationRequest
from ...models.request_ops import ContactRequest, RequestMessage
from ...models.ticket import Ticket
from ...schemas.requests import (
    ContactCreatedOut,
    ContactIn,
    MessageOut,
    TrackIn,
    TrackPublicOut,
    TrackReplyIn,
)
from ...services import thread as thread_svc
from ...utils.ids import access_code
from ...utils.phone import normalize_phone

router = APIRouter(tags=["contacts"])
DbDep = Annotated[AsyncSession, Depends(get_db)]


@router.post("/contacts", status_code=status.HTTP_201_CREATED)
async def submit_contact(
    payload: ContactIn, request: Request, db: DbDep
) -> ContactCreatedOut:
    limiter.check(
        "public_post", client_key(request), get_settings().rate_limit_public_post_per_minute
    )
    if payload.website.strip():  # honeypot — silent accept, store nothing
        return ContactCreatedOut(tracking_code="DN-0000-0000", access_code="00000000")
    code_str = access_code()
    row = ContactRequest(
        tracking_code=await thread_svc.next_tracking_code(db, "contact"),
        access_code_hash=hash_password(code_str),
        full_name=payload.full_name.strip(),
        phone=payload.phone,
        email=payload.email.strip(),
        subject=payload.subject.strip(),
        message=payload.message.strip(),
        preferred_time=payload.preferred_time.strip(),
        source_page=payload.source_page.strip(),
    )
    db.add(row)
    await db.flush()
    await thread_svc.stamp_sla(db, "contact", row)
    await thread_svc.add_event(db, "contact", row.id, "created", payload={"source": row.source_page})
    await db.commit()
    return ContactCreatedOut(tracking_code=row.tracking_code, access_code=code_str)


async def _find_request(db: AsyncSession, code: str):
    """Locate any request by its public code (ticket_number or tracking_code)."""
    code = code.upper().strip()
    for model, col, rtype in (
        (Ticket, Ticket.ticket_number, "ticket"),
        (ConsultationRequest, ConsultationRequest.tracking_code, "consultation"),
        (ContactRequest, ContactRequest.tracking_code, "contact"),
    ):
        row = (
            await db.execute(select(model).where(col == code))
        ).scalar_one_or_none()
        if row is not None:
            return rtype, row
    return None, None


def _credential_ok(row, credential: str) -> bool:
    credential = credential.strip()
    if not credential:
        return False
    stored = getattr(row, "access_code_hash", "")
    if stored and verify_password(credential, stored):
        return True
    phone = normalize_phone(credential)
    return bool(phone) and phone == thread_svc.requester_phone(row)


@router.post("/public/track")
async def track(payload: TrackIn, request: Request, db: DbDep) -> TrackPublicOut:
    limiter.check(
        "public_post", client_key(request), get_settings().rate_limit_public_post_per_minute
    )
    rtype, row = await _find_request(db, payload.code)
    if row is None or not _credential_ok(row, payload.credential):
        # generic — don't reveal whether the code exists
        raise HTTPException(404, {"code": "not_found", "message": "درخواستی با این مشخصات یافت نشد."})
    msgs = (
        await db.execute(
            select(RequestMessage)
            .where(
                RequestMessage.request_type == rtype,
                RequestMessage.request_id == row.id,
                RequestMessage.is_note.is_(False),
            )
            .order_by(RequestMessage.created_at)
        )
    ).scalars().all()
    # legacy ticket thread may still hold messages
    if rtype == "ticket" and not msgs:
        from ...models.ticket import TicketMessage
        legacy = (
            await db.execute(
                select(TicketMessage).where(TicketMessage.ticket_id == row.id)
            )
        ).scalars().all()
        msgs = [
            RequestMessage(
                request_type="ticket", request_id=row.id, sender_type=m.sender_type,
                sender_id=m.sender_id, body=m.body, is_note=False,
                created_at=m.created_at,
            )
            for m in legacy if m.sender_type != "note"
        ]
    return TrackPublicOut(
        type=rtype,
        code=thread_svc.request_code(row),
        subject=thread_svc.request_subject(row),
        status=row.status,
        created_at=row.created_at,
        messages=[MessageOut.model_validate(m) for m in msgs],
    )


@router.post("/public/track/reply", status_code=status.HTTP_201_CREATED)
async def track_reply(payload: TrackReplyIn, request: Request, db: DbDep) -> MessageOut:
    limiter.check(
        "public_post", client_key(request), get_settings().rate_limit_public_post_per_minute
    )
    rtype, row = await _find_request(db, payload.code)
    if row is None or not _credential_ok(row, payload.credential):
        raise HTTPException(404, {"code": "not_found", "message": "درخواستی با این مشخصات یافت نشد."})
    if row.status in ("closed", "cancelled", "completed"):
        raise HTTPException(
            409,
            {"code": "closed", "message": "این درخواست بسته شده است."},
        )
    msg = await thread_svc.add_message(
        db, rtype, row.id, sender_type="customer", sender_id=None, body=payload.body
    )
    # customer replied → move back to an open state for the inbox
    if row.status in ("awaiting_call", "waiting_reply"):
        row.status = "reviewing"
    elif rtype == "contact" and row.status == "contacted":
        row.status = "new"
    await thread_svc.add_event(db, rtype, row.id, "customer_reply")
    await db.commit()
    return MessageOut.model_validate(msg)
