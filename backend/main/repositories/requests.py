"""Consultation + ticket queries."""

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.consultation import ConsultationRequest
from ..models.ticket import Ticket


async def list_consultations(
    db: AsyncSession,
    *,
    status: str | None = None,
    q: str | None = None,
    offset: int = 0,
    limit: int = 20,
) -> tuple[list[ConsultationRequest], int]:
    stmt = select(ConsultationRequest)
    count = select(func.count(ConsultationRequest.id))
    if status:
        stmt = stmt.where(ConsultationRequest.status == status)
        count = count.where(ConsultationRequest.status == status)
    if q:
        like = f"%{q}%"
        cond = or_(
            ConsultationRequest.full_name.ilike(like),
            ConsultationRequest.phone.ilike(like),
            ConsultationRequest.message.ilike(like),
        )
        stmt = stmt.where(cond)
        count = count.where(cond)
    total = (await db.execute(count)).scalar_one()
    items = (
        await db.execute(
            stmt.order_by(ConsultationRequest.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
    ).scalars()
    return list(items), total


async def count_new_consultations(db: AsyncSession) -> int:
    return (
        await db.execute(
            select(func.count(ConsultationRequest.id)).where(
                ConsultationRequest.status == "new"
            )
        )
    ).scalar_one()


async def list_tickets(
    db: AsyncSession,
    *,
    status: str | None = None,
    q: str | None = None,
    offset: int = 0,
    limit: int = 20,
) -> tuple[list[Ticket], int]:
    stmt = select(Ticket)
    count = select(func.count(Ticket.id))
    if status:
        stmt = stmt.where(Ticket.status == status)
        count = count.where(Ticket.status == status)
    if q:
        like = f"%{q}%"
        cond = or_(
            Ticket.ticket_number.ilike(like),
            Ticket.requester_name.ilike(like),
            Ticket.requester_phone.ilike(like),
            Ticket.subject.ilike(like),
        )
        stmt = stmt.where(cond)
        count = count.where(cond)
    total = (await db.execute(count)).scalar_one()
    items = (
        await db.execute(
            stmt.order_by(Ticket.created_at.desc()).offset(offset).limit(limit)
        )
    ).scalars()
    return list(items), total


async def count_open_tickets(db: AsyncSession) -> int:
    return (
        await db.execute(
            select(func.count(Ticket.id)).where(
                Ticket.status.in_(("new", "reviewing", "waiting_reply"))
            )
        )
    ).scalar_one()


async def recent_consultations(db: AsyncSession, limit: int = 5):
    return list(
        (
            await db.execute(
                select(ConsultationRequest)
                .order_by(ConsultationRequest.created_at.desc())
                .limit(limit)
            )
        ).scalars()
    )
