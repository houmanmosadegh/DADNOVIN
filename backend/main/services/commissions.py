"""Commission rules, creation on case acceptance, settlement and payouts."""

import uuid
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.account import (
    Commission,
    CommissionRule,
    MarketerProfile,
    PayoutRequest,
    ReferralAttribution,
)
from ..models.content import SiteSetting
from ..models.consultation import ConsultationRequest
from ..models.user import User
from . import commission_engine as engine
from . import wallet

REFERRAL_DEFAULTS = {
    "cookie_days": 30,
    "min_payout": 1_000_000,
    "hold_days": 14,
    "basis": "fixed",  # fixed | percent — admin decides
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
    """Hook called when a request reaches `accepted` — creates the commission.

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
        hold_until=datetime.now(UTC) + timedelta(days=int(cfg.get("hold_days", 14))),
        rule_snapshot=engine.snapshot_rule(rule),
    )
    db.add(comm)
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


async def settle_due(db: AsyncSession, actor_id: uuid.UUID | None = None) -> int:
    """Approve pending commissions whose hold elapsed → credit the ledger."""
    now = datetime.now(UTC)
    due = (
        await db.execute(
            select(Commission).where(
                Commission.status == "pending",
                Commission.hold_until.is_not(None),
                Commission.hold_until <= now,
            )
        )
    ).scalars().all()
    n = 0
    for comm in due:
        await approve_commission(db, comm, actor_id)
        n += 1
    return n


async def approve_commission(
    db: AsyncSession, comm: Commission, actor_id: uuid.UUID | None
) -> None:
    if comm.status != "pending":
        return
    comm.status = "approved"
    await wallet.append_entry(
        db,
        comm.marketer_id,
        kind="commission_credit",
        amount=comm.amount,
        ref_type="commission",
        ref_id=comm.id,
        memo=f"کمیسیون پرونده {comm.request_id}",
        actor_id=actor_id,
        idem_key=f"comm:{comm.id}",
    )
    await db.flush()


async def cancel_commission(
    db: AsyncSession, comm: Commission, actor_id: uuid.UUID | None
) -> None:
    if comm.status == "paid":
        raise HTTPException(409, {"code": "paid", "message": "پرداخت شده است؛ قابل لغو نیست."})
    if comm.status == "approved":
        # reverse the credit with a matching adjustment
        await wallet.append_entry(
            db,
            comm.marketer_id,
            kind="adjustment",
            amount=-comm.amount,
            ref_type="commission",
            ref_id=comm.id,
            memo="برگشت کمیسیون لغوشده",
            actor_id=actor_id,
            idem_key=f"comm_cancel:{comm.id}",
        )
    comm.status = "cancelled"
    await db.flush()


async def request_payout(
    db: AsyncSession, profile: MarketerProfile, amount: int
) -> PayoutRequest:
    cfg = await referral_settings(db)
    minimum = int(cfg.get("min_payout", 0))
    if minimum and amount < minimum:
        raise HTTPException(
            400,
            {"code": "below_min", "message": f"حداقل مبلغ برداشت {minimum:,} ریال است."},
        )
    bal = await wallet.balance(db, profile.id)
    if amount > bal:
        raise HTTPException(
            400, {"code": "insufficient", "message": "مبلغ از موجودی قابل برداشت بیشتر است."}
        )
    iban_masked = _mask_iban(profile)
    payout = PayoutRequest(
        marketer_id=profile.id, amount=amount, iban_masked=iban_masked
    )
    db.add(payout)
    await db.flush()
    return payout


async def approve_payout(
    db: AsyncSession, payout: PayoutRequest, admin: User, payment_ref: str = ""
) -> None:
    """Approve → ledger debit (idempotent). Re-check balance at approval time."""
    if payout.status != "pending":
        raise HTTPException(409, {"code": "already_reviewed", "message": "قبلاً بررسی شده است."})
    bal = await wallet.balance(db, payout.marketer_id)
    if payout.amount > bal:
        raise HTTPException(
            409, {"code": "insufficient", "message": "موجودی بازاریاب کافی نیست."}
        )
    await wallet.append_entry(
        db,
        payout.marketer_id,
        kind="payout_debit",
        amount=-payout.amount,
        ref_type="payout",
        ref_id=payout.id,
        memo="برداشت کیف پول",
        actor_id=admin.id,
        idem_key=f"payout:{payout.id}",
    )
    payout.status = "paid"
    payout.payment_ref = payment_ref.strip()
    payout.reviewed_by = admin.id
    payout.reviewed_at = datetime.now(UTC)
    await db.flush()


async def reject_payout(
    db: AsyncSession, payout: PayoutRequest, admin: User, note: str = ""
) -> None:
    if payout.status != "pending":
        raise HTTPException(409, {"code": "already_reviewed", "message": "قبلاً بررسی شده است."})
    payout.status = "rejected"
    payout.reject_reason = note[:300]
    payout.reviewed_by = admin.id
    payout.reviewed_at = datetime.now(UTC)
    await db.flush()


def _mask_iban(profile: MarketerProfile) -> str:
    """Never expose full bank coordinates — keep only the tail."""
    from ..security.vault import decrypt_field

    raw = decrypt_field(profile.iban_enc) if profile.iban_enc else ""
    digits = "".join(ch for ch in raw if ch.isdigit())
    return f"IR••••{digits[-4:]}" if digits else ""
