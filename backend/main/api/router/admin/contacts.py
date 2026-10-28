"""Admin contact-request module — list, detail and manual call logging.

Backed by the unified request model; convenience endpoints mirror the
generic ``/admin/requests/contact/*`` API for clients that address
contacts as their own module.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ....db.session import get_db
from ....models.request_ops import (
    TRANSITIONS,
    Label,
    OutboundDelivery,
    RequestLabel,
    RequestMessage,
)
from ....schemas.common import Page
from ....schemas.requests import (
    DeliveryOut,
    EventOut,
    InboxRowOut,
    MessageOut,
    RequestDetailOut,
)
from ....services import inbox as inbox_svc
from ....services import thread as thread_svc
from ...dependencies.auth import SupportDep
from ...dependencies.pagination import PageDep
from .requests import _request_dict, _requester_dict

router = APIRouter(prefix="/contacts", tags=["admin-contacts"])
DbDep = Annotated[AsyncSession, Depends(get_db)]


class CallLogIn(BaseModel):
    outcome: str = Field(min_length=2, max_length=40)
    note: str = Field(default="", max_length=1000)


class NoteIn(BaseModel):
    note: str = Field(min_length=1, max_length=2000)


@router.get("")
async def list_contacts(
    user: SupportDep,
    db: DbDep,
    page: PageDep,
    q: Annotated[str | None, Query(max_length=100)] = None,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    tab: Annotated[str, Query()] = "all",
) -> Page[InboxRowOut]:
    rows, total = await inbox_svc.inbox(
        db,
        types=["contact"],
        tab=tab,
        status=status_filter,
        q=q,
        user=user,
        offset=page.offset,
        limit=page.page_size,
    )
    return Page[InboxRowOut](
        items=[InboxRowOut(**r) for r in rows],
        total=total,
        page=page.page,
        page_size=page.page_size,
    )


@router.get("/{contact_id}")
async def contact_detail(
    contact_id: uuid.UUID, _: SupportDep, db: DbDep
) -> RequestDetailOut:
    row = await thread_svc.load_request(db, "contact", contact_id)
    if row is None:
        raise HTTPException(404, {"code": "not_found", "message": "تماس یافت نشد."})
    thread = await thread_svc.list_thread(db, "contact", contact_id)
    deliveries = (
        await db.execute(
            select(OutboundDelivery)
            .join(RequestMessage, RequestMessage.id == OutboundDelivery.message_id)
            .where(
                RequestMessage.request_type == "contact",
                RequestMessage.request_id == contact_id,
            )
            .order_by(OutboundDelivery.created_at)
        )
    ).scalars().all()
    labels = (
        await db.execute(
            select(Label.id, Label.name, Label.color)
            .join(RequestLabel, RequestLabel.label_id == Label.id)
            .where(
                RequestLabel.request_type == "contact",
                RequestLabel.request_id == contact_id,
            )
        )
    ).all()
    return RequestDetailOut(
        type="contact",
        request=_request_dict(row),
        messages=[MessageOut.model_validate(m) for m in thread["messages"]],
        events=[EventOut.model_validate(e) for e in thread["events"]],
        deliveries=[DeliveryOut.model_validate(d) for d in deliveries],
        labels=[
            {"id": str(lbl.id), "name": lbl.name, "color": lbl.color}
            for lbl in labels
        ],
        allowed_transitions=sorted(TRANSITIONS["contact"].get(row.status, frozenset())),
        requester=_requester_dict(row),
    )


@router.post("/{contact_id}/call-log", status_code=201)
async def log_call(
    contact_id: uuid.UUID,
    payload: CallLogIn,
    user: SupportDep,
    db: DbDep,
) -> dict:
    """Record a manual phone-call log — actual call tracking needs a
    telephony provider, so calls are logged by staff here."""
    row = await thread_svc.load_request(db, "contact", contact_id)
    if row is None:
        raise HTTPException(404, {"code": "not_found", "message": "تماس یافت نشد."})
    await thread_svc.add_message(
        db,
        "contact",
        row.id,
        sender_type="staff",
        sender_id=user.id,
        body=f"[تماس تلفنی — {payload.outcome}] {payload.note}".strip(),
        is_note=True,
    )
    await thread_svc.add_event(
        db, "contact", row.id, "call_logged",
        actor=user, payload={"outcome": payload.outcome},
    )
    if row.status == "new":
        row.status = "contacted"
        await thread_svc.add_event(
            db, "contact", row.id, "status", payload={"status": "contacted"}
        )
    await db.commit()
    return {"ok": True}


@router.post("/{contact_id}/note", status_code=201)
async def add_note(
    contact_id: uuid.UUID,
    payload: NoteIn,
    user: SupportDep,
    db: DbDep,
) -> dict:
    row = await thread_svc.load_request(db, "contact", contact_id)
    if row is None:
        raise HTTPException(404, {"code": "not_found", "message": "تماس یافت نشد."})
    await thread_svc.add_message(
        db, "contact", row.id,
        sender_type="staff", sender_id=user.id, body=payload.note, is_note=True,
    )
    await db.commit()
    return {"ok": True}
