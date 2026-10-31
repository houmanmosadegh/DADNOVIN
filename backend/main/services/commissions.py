"""Commission rules + lifecycle — created on case acceptance, settled
manually by an admin (pending → approved → paid / cancelled). No wallet:
the amount is what the office owes the marketer until it is marked paid."""

import json
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.account import (
    CaseFeeReceipt,
    Commission,
    CommissionRule,
    MarketerProfile,
    MarketingTerms,
    ReferralAttribution,
)
from ..models.content import SiteSetting
from ..models.consultation import ConsultationRequest
from . import commission_engine as engine

REFERRAL_DEFAULTS = {
    # master switch — OFF by default; when off every marketing route/API hides
    "marketing_enabled": False,
    "default_rate": 0,  # global fallback commission percent (0..100)
    "cookie_days": 30,
    "holdback_days": 0,  # optional wait before a new accrual may be approved
    "monthly_cap": 0,
    "reapply_days": 14,  # min days before re-applying after a rejection
    "attribution_model": "first_touch",  # first_touch | last_touch
}


async def referral_settings(db: AsyncSession) -> dict:
    row = await db.get(SiteSetting, "commission")
    cfg = dict(REFERRAL_DEFAULTS)
    if row and isinstance(row.value, dict):
        cfg.update(row.value)
    # legacy key alias — older installs stored `commission_enabled`
    if "marketing_enabled" not in (row.value if row and isinstance(row.value, dict) else {}):
        cfg["marketing_enabled"] = bool(cfg.get("commission_enabled"))
    return cfg


async def marketing_enabled(db: AsyncSession) -> bool:
    return bool((await referral_settings(db)).get("marketing_enabled"))


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


async def rate_for(
    db: AsyncSession, profile: MarketerProfile | None, cfg: dict | None = None
) -> tuple[int, str]:
    """Effective commission rate in basis points + its provenance.

    Order: profile.custom_rate → active per-marketer percent rule →
    active global percent rule → settings.default_rate. 0 when marketing
    is off or nothing is configured.
    """
    if cfg is None:
        cfg = await referral_settings(db)
    if not cfg.get("marketing_enabled"):
        return 0, "off"
    if profile is not None and profile.custom_rate:
        return int(profile.custom_rate) * 100, "custom"
    rows = (
        await db.execute(
            select(CommissionRule).where(
                CommissionRule.kind == "percent",
                CommissionRule.is_active.is_(True),
            ).order_by(CommissionRule.tier_min.desc())
        )
    ).scalars().all()
    now = datetime.now(UTC)
    mid = profile.id if profile else None
    for scope, source in ((mid, "rule_override"), (None, "rule")):
        for r in rows:
            if r.marketer_id == scope and engine.rule_active_at(r, now):
                return int(r.value) * 100, source
    default = int(cfg.get("default_rate") or 0)
    if default > 0:
        return default * 100, "default"
    return 0, "none"


async def accrue_for_receipt(
    db: AsyncSession, receipt: CaseFeeReceipt, actor_id: uuid.UUID | None
) -> Commission | None:
    """Create one accrual entry per fee receipt — the only commission trigger.

    base = the office's received attorney fee (never the client's claim).
    Idempotent via the unique receipt_id; a no-op when marketing is off, the
    case was not referred, or the referral is flagged for review.
    """
    cfg = await referral_settings(db)
    if not cfg.get("marketing_enabled"):
        return None
    attr = (
        await db.execute(
            select(ReferralAttribution).where(
                ReferralAttribution.request_type == "consultation",
                ReferralAttribution.request_id == receipt.request_id,
            )
        )
    ).scalar_one_or_none()
    if attr is None or attr.flag == "review":
        return None
    profile = await db.get(MarketerProfile, attr.marketer_id)
    if profile is None or not profile.is_active:
        return None
    rate_bp, source = await rate_for(db, profile, cfg)
    if rate_bp <= 0:
        return None
    amount = receipt.amount * rate_bp // 10_000
    if amount <= 0:
        return None
    cap = int(cfg.get("monthly_cap") or 0)
    if cap > 0:
        headroom = cap - await monthly_commission_total(db, profile.id)
        if headroom <= 0:
            return None
        amount = min(amount, headroom)
    snap = json.dumps({"rate_bp": rate_bp, "source": source}, ensure_ascii=False)
    comm = Commission(
        marketer_id=profile.id,
        request_type="consultation",
        request_id=receipt.request_id,
        referral_id=attr.id,
        entry_type="accrual",
        receipt_id=receipt.id,
        basis_kind="percent",
        basis_amount=receipt.amount,
        rate_bp=rate_bp,
        amount=amount,
        status="pending",
        rule_snapshot=snap,
        created_by=actor_id,
    )
    db.add(comm)
    try:
        await db.flush()
    except IntegrityError:  # receipt already accrued — idempotent
        await db.rollback()
        return None
    return comm


async def reverse_accrual(
    db: AsyncSession,
    accrual: Commission,
    actor_id: uuid.UUID | None,
    note: str = "",
    amount: int | None = None,
) -> Commission:
    """Post a negative ledger entry against an accrual — refunds/cancellations
    never delete rows. A fully-reversed unpaid accrual becomes `cancelled`;
    a paid one keeps its status (the reversal records money owed back)."""
    reversed_so_far = (
        await db.execute(
            select(func.coalesce(func.sum(Commission.amount), 0)).where(
                Commission.parent_id == accrual.id,
                Commission.entry_type == "reversal",
            )
        )
    ).scalar_one()
    outstanding = accrual.amount + reversed_so_far  # reversals are negative
    reversal_amount = -min(abs(amount), outstanding) if amount is not None else -outstanding
    if reversal_amount == 0:
        raise HTTPException(
            409, {"code": "already_reversed", "message": "این کمیسیون قبلاً کامل برگشت خورده است."}
        )
    entry = Commission(
        marketer_id=accrual.marketer_id,
        request_type=accrual.request_type,
        request_id=accrual.request_id,
        referral_id=accrual.referral_id,
        entry_type="reversal",
        parent_id=accrual.id,
        basis_kind=accrual.basis_kind,
        basis_amount=accrual.basis_amount,
        rate_bp=accrual.rate_bp,
        amount=reversal_amount,
        status="cancelled",
        rule_snapshot=accrual.rule_snapshot,
        created_by=actor_id,
    )
    db.add(entry)
    if accrual.status in ("pending", "approved") and outstanding + reversal_amount <= 0:
        accrual.status = "cancelled"
    await db.flush()
    return entry


async def on_request_rolled_back(
    db: AsyncSession, request_type: str, request_id: uuid.UUID, actor_id=None
) -> int:
    """Case cancelled/unravelled → post a full reversal for every unpaid
    accrual on it. Paid accruals are untouched — money already moved."""
    rows = (
        await db.execute(
            select(Commission).where(
                Commission.request_type == request_type,
                Commission.request_id == request_id,
                Commission.entry_type == "accrual",
                Commission.status.in_(["pending", "approved"]),
            )
        )
    ).scalars().all()
    n = 0
    for accrual in rows:
        await reverse_accrual(
            db, accrual, actor_id, note="برگشت/لغو پرونده"
        )
        n += 1
    return n


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
    holdback = int((await referral_settings(db)).get("holdback_days") or 0)
    if holdback > 0:
        from ..db.base import aware

        unlock = aware(comm.created_at) + timedelta(days=holdback)
        if unlock > datetime.now(UTC):
            raise HTTPException(
                409,
                {
                    "code": "holdback",
                    "message": f"تا {unlock.date().isoformat()} به‌خاطر دورهٔ نگه‌داشت قابل تأیید نیست.",
                },
            )
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


# ─── versioned marketing terms ──────────────────────────────────────

DEFAULT_TERMS = (
    "همکاری در بازاریابی دادنوین بر پایهٔ امانت و شفافیت است. کمیسیون فقط از "
    "محل حق‌الوکاله‌ی دریافت‌شدهٔ دفتر محاسبه می‌شود و هزینه‌ای از "
    "مراجعه‌کننده دریافت نمی‌شود. بازاریاب هیچ‌گونه دسترسی به محتوای پرونده "
    "ندارد و وعدهٔ نتیجه دادن ممنوع است."
)


async def current_terms(db: AsyncSession) -> MarketingTerms | None:
    return (
        await db.execute(
            select(MarketingTerms)
            .where(MarketingTerms.is_active.is_(True))
            .order_by(MarketingTerms.version.desc())
            .limit(1)
        )
    ).scalar_one_or_none()


async def terms_view(db: AsyncSession) -> dict:
    """Current terms for the apply screen — falls back to a sane default text."""
    row = await current_terms(db)
    if row is None:
        return {"version": 0, "body": DEFAULT_TERMS}
    return {"version": row.version, "body": row.body}


async def create_terms_version(
    db: AsyncSession, body: str, actor_id: uuid.UUID | None
) -> MarketingTerms:
    latest = (
        await db.execute(select(func.max(MarketingTerms.version)))
    ).scalar_one() or 0
    for t in (
        await db.execute(select(MarketingTerms).where(MarketingTerms.is_active.is_(True)))
    ).scalars():
        t.is_active = False
    row = MarketingTerms(
        version=latest + 1, body=body.strip(), is_active=True, created_by=actor_id
    )
    db.add(row)
    await db.flush()
    return row


# ─── marketer-safe serializer (whitelist — legal confidentiality) ───

_STAGE_FA = {
    "new": "در انتظار",
    "reviewing": "در حال بررسی",
    "awaiting_call": "در حال بررسی",
    "followed_up": "در حال بررسی",
    "consulted": "در حال بررسی",
    "accepted": "پرونده پذیرفته شد",
    "rejected": "بسته شد",
    "completed": "بسته شد",
    "cancelled": "بسته شد",
}


def mask_name(name: str) -> str:
    """«علی رضایی» → «علی ر.» — the only identity a marketer may see."""
    parts = (name or "").strip().split()
    if not parts:
        return "—"
    return f"{parts[0]} {parts[1][0]}." if len(parts) > 1 else parts[0]


def marketer_commission_row(
    comm: Commission, referred_name: str, stage: str
) -> dict:
    """Whitelist ONLY: masked name, coarse stage, received office fee, own
    rate, own commission, status, dates. No subject/type/parties/claim/
    phone/tracking — the marketer must learn nothing about the case itself."""
    return {
        "id": str(comm.id),
        "masked_name": referred_name,
        "stage": stage,
        "fee_amount": comm.basis_amount,
        "rate": comm.rate_bp / 100,
        "amount": comm.amount,
        "status": comm.status,
        "entry_type": comm.entry_type,
        "paid_at": comm.paid_at.isoformat() if comm.paid_at else None,
        "created_at": comm.created_at.isoformat(),
    }


def net_totals(rows: list[Commission]) -> dict:
    """per-status sums where each accrual is netted by its reversal entries —
    the same number for marketer and admin."""
    totals = dict.fromkeys(("pending", "approved", "paid", "cancelled"), 0)
    reversal_by_parent: dict = {}
    for r in rows:
        if r.entry_type == "reversal" and r.parent_id:
            reversal_by_parent[r.parent_id] = reversal_by_parent.get(r.parent_id, 0) + r.amount
    for c in rows:
        if c.entry_type != "accrual":
            continue
        net = c.amount + reversal_by_parent.get(c.id, 0)
        if c.status in totals:
            totals[c.status] += net
    return totals
