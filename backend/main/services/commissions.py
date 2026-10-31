"""Commission rules + lifecycle — created on case acceptance, settled
manually by an admin (pending → approved → paid / cancelled). No wallet:
the amount is what the office owes the marketer until it is marked paid."""

import uuid
from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.account import Commission, CommissionRule, ReferralAttribution
from ..models.content import SiteSetting
from ..models.consultation import ConsultationRequest
from . import commission_engine as engine

REFERRAL_DEFAULTS = {
    "cookie_days": 30,
    "commission_enabled": False,  # OFF by default — see README compliance note
    "monthly_cap": 0,
    "reapply_days": 14,  # min days before re-applying after a rejection
    "attribution_model": "first_touch",  # first_touch | last_touch
}


async def referral_settings(db: AsyncSession) -> dict:
    row = await db.get(SiteSetting, "commission")
    cfg = dict(REFERRAL_DEFAULTS)
    if row and isinstance(row.value, dict):
        cfg.update(row.value)
    return cfg


async def pick_rule(
    db: AsyncSession,
    marketer_id: uuid.UUID,
    accepted_count: int,
    now: datetime | None = None,
) -> CommissionRule | None:
    """Per-marketer override first, then the highest global tier reached —
    honouring each rule's validity window via the pure engine."""
    rows = (
        await db.execute(select(CommissionRule).order_by(CommissionRule.tier_min.desc()))
    ).scalars().all()
    return engine.resolve_rule(list(rows), marketer_id, accepted_count, now)


async def monthly_commission_total(db: AsyncSession, marketer_id: uuid.UUID) -> int:
    """Pending+approved+paid commissions this calendar month — for the cap."""
    now = datetime.now(UTC)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return (
        await db.execute(
            select(func.coalesce(func.sum(Commission.amount), 0)).where(
                Commission.marketer_id == marketer_id,
                Commission.status.in_(["pending", "approved", "paid"]),
                Commission.created_at >= month_start,
            )
        )
    ).scalar_one()


async def accepted_count(db: AsyncSession, marketer_id: uuid.UUID) -> int:
    """Cases this marketer referred that reached `accepted`."""
    subq = select(ReferralAttribution.request_id).where(
        ReferralAttribution.marketer_id == marketer_id,
        ReferralAttribution.request_type == "consultation",
    )
    return (
        await db.execute(
            select(func.count(ConsultationRequest.id)).where(
                ConsultationRequest.id.in_(subq),
                ConsultationRequest.status == "accepted",
            )
        )
    ).scalar_one()


async def on_request_accepted(
    db: AsyncSession, request_type: str, request_id: uuid.UUID, row
) -> Commission | None:
    """Hook called when a request reaches `accepted` — creates the commission
    with a snapshot of the rule, so later rate edits never rewrite history.

    Idempotent by the unique (request_type, request_id) constraint; a no-op
    when commissions are disabled or the request was not referred.
    """
    cfg = await referral_settings(db)
    if not cfg.get("commission_enabled"):
        return None
    attr = (
        await db.execute(
            select(ReferralAttribution).where(
                ReferralAttribution.request_type == request_type,
                ReferralAttribution.request_id == request_id,
            )
        )
    ).scalar_one_or_none()
    if attr is None:
        return None
    exists = (
        await db.execute(
            select(Commission.id).where(
                Commission.request_type == request_type,
                Commission.request_id == request_id,
            )
        )
    ).scalar_one_or_none()
    if exists is not None:
        return None
    count = await accepted_count(db, attr.marketer_id)
    rule = await pick_rule(db, attr.marketer_id, count)
    if rule is None:
        return None
    fee = getattr(row, "fee_amount", 0) or 0
    amount = engine.compute_amount(rule, fee)
    if amount <= 0:
        return None
    # monthly cap — remaining headroom shrinks the commission, never blocks fully
    cap = int(cfg.get("monthly_cap") or 0)
    if cap > 0:
        headroom = cap - await monthly_commission_total(db, attr.marketer_id)
        if headroom <= 0:
            return None
        amount = min(amount, headroom)
    comm = Commission(
        marketer_id=attr.marketer_id,
        request_type=request_type,
        request_id=request_id,
        basis_kind=rule.kind,
        basis_amount=fee if rule.kind == "percent" else 0,
        amount=amount,
        status="pending",
        rule_snapshot=engine.snapshot_rule(rule),
    )
    db.add(comm)
    await db.flush()
    return comm


async def on_request_rolled_back(
    db: AsyncSession, request_type: str, request_id: uuid.UUID
) -> Commission | None:
    """Case left `accepted` (cancelled/rolled back) → cancel its commission.
    Paid commissions are left untouched — money already moved."""
    comm = (
        await db.execute(
            select(Commission).where(
                Commission.request_type == request_type,
                Commission.request_id == request_id,
            )
        )
    ).scalar_one_or_none()
    if comm is None or comm.status in ("cancelled", "paid"):
        return None
    comm.status = "cancelled"
    await db.flush()
    return comm


async def preview_commission(
    db: AsyncSession,
    marketer_id: uuid.UUID | None,
    basis_amount: int,
    accepted_count: int | None = None,
) -> dict:
    """What-if calculator for admins — runs the same engine without writes."""
    rows = (
        await db.execute(select(CommissionRule).order_by(CommissionRule.tier_min.desc()))
    ).scalars().all()
    count = (
        accepted_count
        if accepted_count is not None
        else (await accepted_count(db, marketer_id) if marketer_id else 0)
    )
    rule = engine.resolve_rule(list(rows), marketer_id, count)
    if rule is None:
        return {"matched": False, "amount": 0, "rule": None, "accepted_count": count}
    amount = engine.compute_amount(rule, basis_amount)
    return {
        "matched": True,
        "amount": amount,
        "accepted_count": count,
        "rule": {
            "id": str(rule.id),
            "kind": rule.kind,
            "value": rule.value,
            "tier_min": rule.tier_min,
            "marketer_id": str(rule.marketer_id) if rule.marketer_id else None,
            "min_amount": rule.min_amount,
            "max_amount": rule.max_amount,
        },
    }


async def approve_commission(
    db: AsyncSession, comm: Commission, actor_id: uuid.UUID | None
) -> None:
    if comm.status != "pending":
        return
    comm.status = "approved"
    await db.flush()


async def mark_paid(
    db: AsyncSession, comm: Commission, admin, note: str = ""
) -> None:
    """Manual settlement — admin marks the commission paid with date + note."""
    if comm.status != "approved":
        raise HTTPException(
            409,
            {
                "code": "not_approved",
                "message": "فقط کمیسیون تأییدشده قابل علامت‌خوردن به‌عنوان پرداخت‌شده است.",
            },
        )
    comm.status = "paid"
    comm.paid_at = datetime.now(UTC)
    comm.paid_note = note.strip()[:300]
    comm.paid_by = admin.id
    await db.flush()


async def cancel_commission(
    db: AsyncSession, comm: Commission, actor_id: uuid.UUID | None
) -> None:
    if comm.status == "paid":
        raise HTTPException(409, {"code": "paid", "message": "پرداخت شده است؛ قابل لغو نیست."})
    comm.status = "cancelled"
    await db.flush()
