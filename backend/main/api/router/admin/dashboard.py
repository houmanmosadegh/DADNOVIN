"""Dashboard — real operational metrics for the legal office."""

from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ....db.session import get_db
from ....models.ai import AIConversation
from ....models.consultation import ConsultationRequest
from ....models.lawyer import Lawyer
from ....models.request_ops import ContactRequest, RequestEvent
from ....models.ticket import Ticket
from ....models.user import User
from ...dependencies.auth import AdminDep

router = APIRouter(prefix="/dashboard", tags=["admin-dashboard"])
DbDep = Annotated[AsyncSession, Depends(get_db)]

_OPEN_TICKET = ("new", "reviewing", "waiting_reply")
_CLOSED_ALL = ("completed", "resolved", "closed", "cancelled")


async def _count(db: AsyncSession, model, *where) -> int:
    return (
        await db.execute(select(func.count(model.id)).where(*where))
    ).scalar_one()


@router.get("/overview")
async def overview(user: AdminDep, db: DbDep) -> dict:
    now = datetime.now(UTC)
    week_ago = now - timedelta(days=7)

    stats = {
        "consultations_total": await _count(db, ConsultationRequest),
        "consultations_new": await _count(
            db, ConsultationRequest, ConsultationRequest.status == "new"
        ),
        "consultations_week": await _count(
            db, ConsultationRequest, ConsultationRequest.created_at >= week_ago
        ),
        "contacts_unanswered": await _count(
            db, ContactRequest, ContactRequest.status == "new"
        ),
        "tickets_open": await _count(
            db, Ticket, Ticket.status.in_(_OPEN_TICKET)
        ),
        "awaiting_followup": await _count(
            db, ConsultationRequest,
            ConsultationRequest.status.in_(("awaiting_call", "followed_up")),
        ) + await _count(db, Ticket, Ticket.status == "waiting_reply"),
        "consultations_completed": await _count(
            db, ConsultationRequest, ConsultationRequest.status == "completed"
        ),
        "overdue": await _count(
            db, ConsultationRequest,
            ConsultationRequest.sla_due_at < now,
            ConsultationRequest.status.not_in(_CLOSED_ALL),
        ) + await _count(
            db, Ticket, Ticket.sla_due_at < now,
            Ticket.status.not_in(_CLOSED_ALL),
        ) + await _count(
            db, ContactRequest, ContactRequest.sla_due_at < now,
            ContactRequest.status.not_in(_CLOSED_ALL),
        ),
        "mine_open": await _count(
            db, ConsultationRequest,
            ConsultationRequest.assigned_to == user.id,
            ConsultationRequest.status.not_in(_CLOSED_ALL),
        ) + await _count(
            db, Ticket, Ticket.assigned_to == user.id,
            Ticket.status.not_in(_CLOSED_ALL),
        ) + await _count(
            db, ContactRequest, ContactRequest.assigned_to == user.id,
            ContactRequest.status.not_in(_CLOSED_ALL),
        ),
        "lawyers_visible": await _count(db, Lawyer, Lawyer.is_visible.is_(True)),
        "users_active": await _count(db, User, User.is_active.is_(True)),
        "ai_conversations": await _count(db, AIConversation),
    }

    first_resp = []
    for model in (ConsultationRequest, Ticket, ContactRequest):
        val = (
            await db.execute(
                select(
                    func.avg(
                        func.extract(
                            "epoch", model.first_response_at - model.created_at
                        )
                    )
                ).where(model.first_response_at.is_not(None))
            )
        ).scalar_one_or_none()
        if val:
            first_resp.append(float(val))
    stats["avg_first_response_hours"] = (
        round(sum(first_resp) / len(first_resp) / 3600, 1) if first_resp else None
    )

    recent_consultations = [
        {
            "id": str(r.id), "name": r.full_name, "phone": r.phone,
            "subject": r.topic or r.service_slug, "status": r.status,
            "created_at": r.created_at.isoformat(),
            "tracking_code": r.tracking_code,
        }
        for r in (
            await db.execute(
                select(ConsultationRequest)
                .order_by(ConsultationRequest.created_at.desc())
                .limit(8)
            )
        ).scalars().all()
    ]

    attention_tickets = [
        {
            "id": str(t.id), "ticket_number": t.ticket_number, "subject": t.subject,
            "client": t.requester_name, "priority": t.priority, "status": t.status,
            "sla_due_at": t.sla_due_at.isoformat() if t.sla_due_at else None,
            "updated_at": t.updated_at.isoformat(),
        }
        for t in (
            await db.execute(
                select(Ticket)
                .where(Ticket.status.in_(_OPEN_TICKET))
                .order_by(
                    Ticket.sla_due_at.asc().nulls_last(), Ticket.updated_at.desc()
                )
                .limit(8)
            )
        ).scalars().all()
    ]

    recent_contacts = [
        {
            "id": str(c.id), "name": c.full_name, "phone": c.phone,
            "status": c.status, "tracking_code": c.tracking_code,
            "created_at": c.created_at.isoformat(),
        }
        for c in (
            await db.execute(
                select(ContactRequest)
                .order_by(ContactRequest.created_at.desc())
                .limit(6)
            )
        ).scalars().all()
    ]

    activity = [
        {
            "type": e.request_type, "event": e.event_type,
            "actor": e.actor_username, "payload": e.payload,
            "at": e.created_at.isoformat(), "request_id": str(e.request_id),
        }
        for e in (
            await db.execute(
                select(RequestEvent)
                .order_by(RequestEvent.created_at.desc())
                .limit(12)
            )
        ).scalars().all()
    ]

    return {
        "stats": stats,
        "recent_consultations": recent_consultations,
        "attention_tickets": attention_tickets,
        "recent_contacts": recent_contacts,
        "activity": activity,
    }


@router.get("/trends")
async def trends(
    _: AdminDep,
    db: DbDep,
    days: Annotated[int, Query(ge=1, le=180)] = 30,
) -> dict:
    """Daily consultation+contact+ticket volume for the last N days."""
    since = datetime.now(UTC) - timedelta(days=days)
    series: dict[str, dict[str, int]] = {
        "consultation": {}, "ticket": {}, "contact": {},
    }
    for model, key in (
        (ConsultationRequest, "consultation"),
        (Ticket, "ticket"),
        (ContactRequest, "contact"),
    ):
        rows = (
            await db.execute(
                select(
                    func.date_trunc("day", model.created_at).label("d"),
                    func.count(model.id),
                )
                .where(model.created_at >= since)
                .group_by("d")
                .order_by("d")
            )
        ).all()
        series[key] = {r.d.date().isoformat(): r[1] for r in rows}
    return {"days": days, "series": series}
