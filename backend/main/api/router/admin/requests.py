"""Unified request inbox — consultations, tickets and contacts share one API."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ....db.session import get_db
from ....models.consultation import ConsultationRequest
from ....models.request_ops import (
    REQUEST_TYPES,
    TRANSITIONS,
    ContactRequest,
    Label,
    OutboundDelivery,
    RequestLabel,
    RequestMessage,
)
from ....models.media import MediaAsset
from ....models.ticket import Ticket
from ....models.user import User
from ....notify import dispatch_reply, retry_delivery
from ....schemas.common import Page
from ....services import commissions as commissions_svc
from ....services import inbox as inbox_svc
from ....services import notify_user as notify_svc
from ....schemas.requests import (
    DeliveryOut,
    EventOut,
    InboxRowOut,
    MessageOut,
    RequestDetailOut,
    RequestPatchIn,
    StaffMessageIn,
    StatusIn,
)
from ....services import thread as thread_svc
from ....services.audit import audit
from ...dependencies.auth import SupportDep
from ...dependencies.pagination import PageDep

router = APIRouter(tags=["admin-requests"])
DbDep = Annotated[AsyncSession, Depends(get_db)]

_MODELS = {
    "consultation": ConsultationRequest,
    "ticket": Ticket,
    "contact": ContactRequest,
}


class CallLogIn(BaseModel):
    outcome: str = Field(min_length=2, max_length=40)
    note: str = Field(default="", max_length=1000)


def _request_dict(row) -> dict:
    return {
        "id": str(row.id),
        "status": row.status,
        "priority": row.priority,
        "assigned_to": str(row.assigned_to) if row.assigned_to else None,
        "cancel_reason": getattr(row, "cancel_reason", ""),
        "first_response_at": row.first_response_at.isoformat()
        if getattr(row, "first_response_at", None)
        else None,
        "last_response_at": row.last_response_at.isoformat()
        if getattr(row, "last_response_at", None)
        else None,
        "sla_due_at": row.sla_due_at.isoformat()
        if getattr(row, "sla_due_at", None)
        else None,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def _requester_dict(row) -> dict:
    return {
        "name": thread_svc.requester_name(row),
        "phone": thread_svc.requester_phone(row),
        "email": thread_svc.requester_email(row),
        "subject": thread_svc.request_subject(row),
        "code": thread_svc.request_code(row),
        "body": getattr(row, "message", "") or getattr(row, "body", ""),
        "source_page": getattr(row, "source_page", ""),
        "extra": {
            k: getattr(row, k, "")
            for k in ("service_slug", "category", "preferred_time")
            if getattr(row, k, "")
        },
    }


@router.get("/inbox")
async def list_inbox(
    user: SupportDep,
    db: DbDep,
    page: PageDep,
    type_: Annotated[str | None, Query(alias="type")] = None,
    tab: Annotated[str, Query()] = "all",
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    priority: Annotated[str | None, Query()] = None,
    assignee: Annotated[uuid.UUID | None, Query()] = None,
    q: Annotated[str | None, Query(max_length=100)] = None,
    sort: Annotated[str, Query(pattern="^(updated_desc|updated_asc)$")] = "updated_desc",
) -> Page[InboxRowOut]:
    types = [type_] if type_ in REQUEST_TYPES else None
    rows, total = await inbox_svc.inbox(
        db,
        types=types,
        tab=tab,
        status=status_filter,
        priority=priority,
        assignee=assignee,
        q=q,
        user=user,
        offset=page.offset,
        limit=page.page_size,
        sort=sort,
    )
    return Page[InboxRowOut](
        items=[InboxRowOut(**r) for r in rows],
        total=total,
        page=page.page,
        page_size=page.page_size,
    )


@router.get("/inbox.csv")
async def inbox_csv(
    user: SupportDep,
    db: DbDep,
    type_: Annotated[str | None, Query(alias="type")] = None,
    tab: Annotated[str, Query()] = "all",
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    q: Annotated[str | None, Query(max_length=100)] = None,
) -> Response:
    types = [type_] if type_ in REQUEST_TYPES else None
    rows, _ = await inbox_svc.inbox(
        db, types=types, tab=tab, status=status_filter, q=q, user=user, limit=5000
    )
    return Response(
        content="﻿" + inbox_svc.inbox_csv(rows),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="inbox.csv"'},
    )


@router.get("/requests/{rtype}/{request_id}")
async def request_detail(
    rtype: str,
    request_id: uuid.UUID,
    _: SupportDep,
    db: DbDep,
) -> RequestDetailOut:
    row = await thread_svc.load_request(db, rtype, request_id)
    await thread_svc.migrate_legacy_thread(db, rtype, request_id)
    thread = await thread_svc.list_thread(db, rtype, request_id)
    deliveries = (
        await db.execute(
            select(OutboundDelivery)
            .join(RequestMessage, RequestMessage.id == OutboundDelivery.message_id)
            .where(
                RequestMessage.request_type == rtype,
                RequestMessage.request_id == request_id,
            )
            .order_by(OutboundDelivery.created_at)
        )
    ).scalars().all()
    labels = (
        await db.execute(
            select(Label.id, Label.name, Label.color)
            .join(RequestLabel, RequestLabel.label_id == Label.id)
            .where(
                RequestLabel.request_type == rtype,
                RequestLabel.request_id == request_id,
            )
        )
    ).all()
    return RequestDetailOut(
        type=rtype,
        request=_request_dict(row),
        messages=[MessageOut.model_validate(m) for m in thread["messages"]],
        events=[EventOut.model_validate(e) for e in thread["events"]],
        deliveries=[DeliveryOut.model_validate(d) for d in deliveries],
        labels=[
            {"id": str(lbl.id), "name": lbl.name, "color": lbl.color}
            for lbl in labels
        ],
        allowed_transitions=sorted(TRANSITIONS[rtype].get(row.status, frozenset())),
        requester=_requester_dict(row),
    )


@router.post("/requests/{rtype}/{request_id}/messages", status_code=201)
async def add_message(
    rtype: str,
    request_id: uuid.UUID,
    payload: StaffMessageIn,
    request: Request,
    user: SupportDep,
    db: DbDep,
) -> MessageOut:
    row = await thread_svc.load_request(db, rtype, request_id)
    if payload.attachment_ids:
        found = (
            await db.execute(
                select(MediaAsset.id).where(
                    MediaAsset.id.in_(payload.attachment_ids)
                )
            )
        ).scalars().all()
        if len(found) != len(set(payload.attachment_ids)):
            raise HTTPException(
                422, {"code": "bad_attachment", "message": "پیوست نامعتبر است."}
            )
    msg = await thread_svc.add_message(
        db,
        rtype,
        request_id,
        sender_type="staff",
        sender_id=user.id,
        body=payload.body,
        is_note=payload.is_note,
        attachments=[str(a) for a in payload.attachment_ids],
    )
    await thread_svc.record_staff_reply(db, rtype, row, msg, is_note=payload.is_note)
    deliveries = []
    if not payload.is_note:
        deliveries = await dispatch_reply(db, msg, row, channels=payload.channels)
        await notify_svc.notify(
            db, getattr(row, "user_id", None),
            title=f"پاسخ جدید برای درخواست {row.tracking_code}",
            body=payload.body[:300], kind="reply",
            link="/panel/requests",
        )
        await thread_svc.add_event(
            db, rtype, request_id, "reply_sent", actor=user,
            payload={
                "channels": payload.channels,
                "deliveries": [
                    {"channel": d.channel, "status": d.status} for d in deliveries
                ],
            },
        )
    await audit(
        db, actor=user, action="request.message", entity=rtype,
        entity_id=request_id,
        detail={"is_note": payload.is_note, "channels": payload.channels},
        request=request,
    )
    await db.commit()
    return MessageOut.model_validate(msg)


@router.post("/requests/{rtype}/{request_id}/status")
async def change_status(
    rtype: str,
    request_id: uuid.UUID,
    payload: StatusIn,
    request: Request,
    user: SupportDep,
    db: DbDep,
) -> dict:
    row = await thread_svc.load_request(db, rtype, request_id)
    before = row.status
    if payload.fee_amount is not None and rtype == "consultation":
        row.fee_amount = payload.fee_amount
    await thread_svc.set_status(
        db, rtype, row, payload.status, actor=user, reason=payload.reason
    )
    if payload.status == "accepted" and rtype == "consultation":
        comm = await commissions_svc.on_request_accepted(db, rtype, request_id, row)
        if comm is not None:
            await thread_svc.add_event(
                db, rtype, request_id, "commission_created",
                actor=user, payload={"commission_id": str(comm.id), "amount": comm.amount},
            )
    elif before == "accepted" and payload.status in ("cancelled", "rejected"):
        # برگشت/لغو پرونده از وضعیت پذیرفته → کمیسیون‌اش هم لغو می‌شود
        rolled = await commissions_svc.on_request_rolled_back(db, rtype, request_id)
        if rolled is not None:
            await thread_svc.add_event(
                db, rtype, request_id, "commission_cancelled",
                actor=user, payload={"commission_id": str(rolled.id)},
            )
    STATUS_FA = {
        "new": "جدید", "reviewing": "در حال بررسی", "awaiting_call": "در انتظار تماس",
        "followed_up": "پیگیری شد", "consulted": "مشاوره انجام شد",
        "accepted": "پرونده پذیرفته شد", "rejected": "رد شد",
        "completed": "تکمیل شد", "cancelled": "لغو شد",
    }
    await notify_svc.notify(
        db, getattr(row, "user_id", None),
        title=f"وضعیت درخواست {row.tracking_code} تغییر کرد",
        body=f"وضعیت جدید: {STATUS_FA.get(payload.status, payload.status)}",
        kind="status", link="/panel/requests",
    )
    await audit(
        db, actor=user, action="request.status", entity=rtype,
        entity_id=request_id,
        before={"status": before},
        after={"status": payload.status, "reason": payload.reason},
        request=request,
    )
    await db.commit()
    return {
        "status": row.status,
        "allowed_transitions": sorted(
            TRANSITIONS[rtype].get(row.status, frozenset())
        ),
    }


@router.patch("/requests/{rtype}/{request_id}")
async def patch_request(
    rtype: str,
    request_id: uuid.UUID,
    payload: RequestPatchIn,
    request: Request,
    user: SupportDep,
    db: DbDep,
) -> dict:
    row = await thread_svc.load_request(db, rtype, request_id)
    before = {"priority": row.priority, "assigned_to": str(row.assigned_to or "")}
    if payload.priority is not None:
        row.priority = payload.priority
    if "assigned_to" in payload.model_fields_set:
        if payload.assigned_to is not None:
            target = await db.get(User, payload.assigned_to)
            if target is None or not target.is_active:
                raise HTTPException(
                    404, {"code": "not_found", "message": "کاربر یافت نشد."}
                )
            row.assigned_to = payload.assigned_to
            await thread_svc.add_event(
                db, rtype, request_id, "assigned", actor=user,
                payload={"to": target.username},
            )
        else:
            row.assigned_to = None
            await thread_svc.add_event(
                db, rtype, request_id, "unassigned", actor=user, payload={}
            )
    if payload.label_ids is not None:
        await db.execute(
            RequestLabel.__table__.delete().where(
                RequestLabel.request_type == rtype,
                RequestLabel.request_id == request_id,
            )
        )
        for lid in payload.label_ids:
            db.add(
                RequestLabel(request_type=rtype, request_id=request_id, label_id=lid)
            )
        await db.flush()
        await thread_svc.add_event(
            db, rtype, request_id, "labels_updated", actor=user,
            payload={"count": len(payload.label_ids)},
        )
    await audit(
        db, actor=user, action="request.update", entity=rtype,
        entity_id=request_id,
        before=before,
        after={
            "priority": row.priority,
            "assigned_to": str(row.assigned_to or ""),
        },
        request=request,
    )
    await db.commit()
    return {"ok": True}


@router.post("/requests/{rtype}/{request_id}/call-log", status_code=201)
async def log_call(
    rtype: str,
    request_id: uuid.UUID,
    payload: "CallLogIn",
    request: Request,
    user: SupportDep,
    db: DbDep,
) -> EventOut:
    """Manual call log — real telephony needs a provider; honest manual entry."""
    await thread_svc.load_request(db, rtype, request_id)
    ev = await thread_svc.add_event(
        db, rtype, request_id, "call_logged", actor=user,
        payload={"outcome": payload.outcome, "note": payload.note},
    )
    if payload.note.strip():
        await thread_svc.add_message(
            db, rtype, request_id, sender_type="staff", sender_id=user.id,
            body=f"تماس تلفنی — {payload.outcome}: {payload.note.strip()}",
            is_note=True,
        )
    await audit(
        db, actor=user, action="request.call_logged", entity=rtype,
        entity_id=request_id, detail={"outcome": payload.outcome}, request=request,
    )
    await db.commit()
    return EventOut.model_validate(ev)


@router.post("/deliveries/{delivery_id}/retry")
async def redeliver(
    delivery_id: uuid.UUID,
    request: Request,
    user: SupportDep,
    db: DbDep,
) -> DeliveryOut:
    try:
        d = await retry_delivery(db, delivery_id)
    except KeyError:
        raise HTTPException(404, {"code": "not_found", "message": "ارسال یافت نشد."})
    await audit(
        db, actor=user, action="delivery.retry", entity="delivery",
        entity_id=delivery_id, request=request,
    )
    await db.commit()
    return DeliveryOut.model_validate(d)


@router.get("/assignees")
async def assignees(_: SupportDep, db: DbDep) -> list[dict]:
    rows = (
        await db.execute(
            select(User).where(User.is_active.is_(True)).order_by(User.full_name)
        )
    ).scalars().all()
    return [{"id": str(u.id), "name": u.full_name, "username": u.username} for u in rows]
