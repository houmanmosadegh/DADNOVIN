"""Commission lifecycle — percentage-only, settled manually by an admin
(pending → approved → paid / cancelled). No wallet: the amount is what the
office owes the marketer until it is marked paid.

Effective rate: marketer's own percent → global default percent. Nothing else.
All amounts are integer تومان.
"""

import uuid
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.account import (
    CaseFeeReceipt,
    Commission,
    MarketerProfile,
    MarketingTerms,
    Payout,
    ReferralAttribution,
)
from ..models.content import SiteSetting

REFERRAL_DEFAULTS = {
    # master switch — OFF by default; when off every marketing route/API hides
    "marketing_enabled": False,
    "default_rate": 15,  # global fallback commission percent (0..100)
    "cookie_days": 30,
    "reapply_days": 14,  # min days before re-applying after a rejection
}


async def referral_settings(db: AsyncSession) -> dict:
    row = await db.get(SiteSetting, "commission")
    cfg = dict(REFERRAL_DEFAULTS)
    if row and isinstance(row.value, dict):
        cfg.update(row.value)
    # legacy key alias — older installs stored `commission_enabled`
    if "marketing_enabled" not in (
        row.value if row and isinstance(row.value, dict) else {}
    ):
        cfg["marketing_enabled"] = bool(cfg.get("commission_enabled"))
    return cfg


async def marketing_enabled(db: AsyncSession) -> bool:
    return bool((await referral_settings(db)).get("marketing_enabled"))


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


async def rate_for(
    db: AsyncSession, profile: MarketerProfile | None, cfg: dict | None = None
) -> tuple[int, str]:
    """Effective commission rate in basis points + its provenance.

    Order: profile.custom_rate → settings.default_rate. 0 when marketing is
    off or nothing is configured.
    """
    if cfg is None:
        cfg = await referral_settings(db)
    if not cfg.get("marketing_enabled"):
        return 0, "off"
    if profile is not None and profile.custom_rate:
        return int(profile.custom_rate) * 100, "custom"
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
    case was not referred, the referral is flagged, or the client did NOT
    consent to name/contract-status exposure (legal confidentiality).
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
    if attr is None or attr.flag == "review" or attr.consent_at is None:
        return None
    profile = await db.get(MarketerProfile, attr.marketer_id)
    if profile is None or not profile.is_active:
        return None
    rate_bp, _source = await rate_for(db, profile, cfg)
    if rate_bp <= 0:
        return None
    amount = receipt.amount * rate_bp // 10_000
    if amount <= 0:
        return None
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
    reversal_amount = (
        -min(abs(amount), outstanding) if amount is not None else -outstanding
    )
    if reversal_amount == 0:
        raise HTTPException(
            409,
            {
                "code": "already_reversed",
                "message": "این کمیسیون قبلاً کامل برگشت خورده است.",
            },
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
        (
            await db.execute(
                select(Commission).where(
                    Commission.request_type == request_type,
                    Commission.request_id == request_id,
                    Commission.entry_type == "accrual",
                    Commission.status.in_(["pending", "approved"]),
                )
            )
        )
        .scalars()
        .all()
    )
    n = 0
    for accrual in rows:
        await reverse_accrual(db, accrual, actor_id, note="برگشت/لغو پرونده")
        n += 1
    return n


async def approve_commission(
    db: AsyncSession, comm: Commission, actor_id: uuid.UUID | None
) -> None:
    if comm.status != "pending":
        return
    comm.status = "approved"
    await db.flush()


async def mark_paid(
    db: AsyncSession,
    comm: Commission,
    admin,
    note: str = "",
    payout: Payout | None = None,
) -> None:
    """Manual settlement — mark the commission paid (optionally inside a
    payout batch that carries the bank receipt)."""
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
    if payout is not None:
        comm.payout_id = payout.id
        comm.paid_at = payout.paid_at
    await db.flush()


async def cancel_commission(
    db: AsyncSession, comm: Commission, actor_id: uuid.UUID | None
) -> None:
    if comm.status == "paid":
        raise HTTPException(
            409, {"code": "paid", "message": "پرداخت شده است؛ قابل لغو نیست."}
        )
    comm.status = "cancelled"
    await db.flush()


# ─── payouts (settlement batches + receipt) ─────────────────────────

BANK_CHANGE_HOLD = timedelta(hours=24)


async def net_outstanding(db: AsyncSession, accrual: Commission) -> int:
    """Accrual minus its reversal entries — the live amount still owed."""
    rev = (
        await db.execute(
            select(func.coalesce(func.sum(Commission.amount), 0)).where(
                Commission.parent_id == accrual.id,
                Commission.entry_type == "reversal",
            )
        )
    ).scalar_one()
    return accrual.amount + rev


async def payable_balance(db: AsyncSession, marketer_id: uuid.UUID) -> int:
    """Net approved total — what the office may pay out right now."""
    rows = (
        (
            await db.execute(
                select(Commission).where(
                    Commission.marketer_id == marketer_id,
                    Commission.entry_type == "accrual",
                    Commission.status == "approved",
                )
            )
        )
        .scalars()
        .all()
    )
    total = 0
    for c in rows:
        total += await net_outstanding(db, c)
    return max(total, 0)


async def approved_accruals(
    db: AsyncSession, marketer_id: uuid.UUID
) -> list[Commission]:
    """Approved accruals with positive net balance, oldest first."""
    rows = (
        (
            await db.execute(
                select(Commission)
                .where(
                    Commission.marketer_id == marketer_id,
                    Commission.entry_type == "accrual",
                    Commission.status == "approved",
                )
                .order_by(Commission.created_at)
            )
        )
        .scalars()
        .all()
    )
    out = []
    for c in rows:
        if await net_outstanding(db, c) > 0:
            out.append(c)
    return out


async def create_payout(
    db: AsyncSession,
    profile: MarketerProfile,
    admin,
    *,
    amount: int | None = None,
    commission_ids: list[uuid.UUID] | None = None,
    paid_at: datetime | None = None,
    tracking_ref: str = "",
    note: str = "",
    file_id: uuid.UUID | None = None,
) -> Payout:
    """Settle approved commissions in one payout batch.

    `commission_ids` picks specific rows; otherwise FIFO across all approved
    accruals. `amount` caps the batch — partial coverage of the last entry is
    NOT allowed (a payout covers whole rows only), so the batch settles the
    largest prefix of rows that fits. Total never exceeds payable balance.
    """
    if profile.payout_hold_until and profile.payout_hold_until > datetime.now(UTC):
        raise HTTPException(
            409,
            {
                "code": "payout_hold",
                "message": "اطلاعات بانکی به‌تازگی تغییر کرده؛ پرداخت تا ۲۴ ساعت پس از تغییر ممکن نیست.",
            },
        )
    candidates = await approved_accruals(db, profile.id)
    if amount is not None:
        payable = 0
        for c in candidates:
            payable += await net_outstanding(db, c)
        if amount > payable:
            raise HTTPException(
                409,
                {
                    "code": "exceeds_payable",
                    "message": "مبلغ بیش از ماندهٔ قابل پرداخت است.",
                },
            )
    if commission_ids:
        wanted = set(commission_ids)
        picked = [c for c in candidates if c.id in wanted]
        if len(picked) != len(wanted):
            raise HTTPException(
                409,
                {"code": "bad_selection", "message": "برخی ردیف‌ها قابل پرداخت نیستند."},
            )
    else:
        picked = candidates
    if not picked:
        raise HTTPException(
            409,
            {"code": "nothing_payable", "message": "ماندهٔ قابل پرداختی وجود ندارد."},
        )
    picked_with_net = [(c, await net_outstanding(db, c)) for c in picked]
    if amount is not None:
        if amount <= 0:
            raise HTTPException(
                400, {"code": "bad_amount", "message": "مبلغ نامعتبر است."}
            )
        fitted, total = [], 0
        for c, net in picked_with_net:
            if total + net > amount:
                break
            fitted.append((c, net))
            total += net
        if not fitted:
            raise HTTPException(
                409,
                {
                    "code": "amount_too_small",
                    "message": "مبلغ برای پوشش حتی یک ردیف کافی نیست.",
                },
            )
        picked_with_net = fitted
    total = sum(net for _, net in picked_with_net)
    payout = Payout(
        marketer_id=profile.id,
        amount=total,
        paid_at=paid_at or datetime.now(UTC),
        tracking_ref=tracking_ref.strip()[:120],
        note=note.strip()[:300],
        file_id=file_id,
        created_by=admin.id,
    )
    db.add(payout)
    await db.flush()
    for comm, _net in picked_with_net:
        await mark_paid(db, comm, admin, note=note, payout=payout)
    await db.flush()
    return payout


# ─── versioned marketing terms ──────────────────────────────────────

DEFAULT_TERMS = (
    "همکاری در بازاریابی دادنوین بر پایهٔ امانت و شفافیت است.\n\n"
    "۱. مبنای محاسبه — کمیسیون درصدی از «حق‌الوکالهٔ دریافت‌شدهٔ دفتر» است، "
    "نه مبلغ خواسته و نه نتیجهٔ دادرسی. هیچ هزینه‌ای از مراجعه‌کننده دریافت نمی‌شود.\n\n"
    "۲. زمان ایجاد کمیسیون — با ثبت هر دریافتی حق‌الوکاله روی پروندهٔ ارجاعی، "
    "کمیسیون به‌صورت خودکار محاسبه و با وضعیت «معلق» ثبت می‌شود.\n\n"
    "۳. تسویه — کمیسیون‌ها پس از تأیید دفتر در نوبت تسویه قرار می‌گیرند؛ "
    "حداقل مبلغ تسویه و زمان‌بندی آن در هماهنگی با دفتر انجام می‌شود.\n\n"
    "۴. برگشت — اگر پرونده لغو یا حق‌الوکاله برگردانده شود، کمیسیونِ "
    "پرداخت‌نشده برگشت می‌خورد.\n\n"
    "۵. منع تقلب — معرفی خود (self-referral)، ثبت نام تکراری و هرگونه "
    "دست‌کاری آمار موجب تعلیق حساب و باطل‌شدن کمیسیون می‌شود.\n\n"
    "۶. محرمانگی — بازاریاب فقط نام معرفی‌شده و وضعیت قرارداد را می‌بیند و "
    "به موضوع پرونده، اسناد و اطلاعات تماس دسترسی ندارد؛ افشای اطلاعات "
    "مراجعه‌کنندگان ممنوع است.\n\n"
    "۷. هیچ‌گونه وعدهٔ نتیجهٔ دادرسی به مراجعه‌کننده داده نمی‌شود."
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
        await db.execute(
            select(MarketingTerms).where(MarketingTerms.is_active.is_(True))
        )
    ).scalars():
        t.is_active = False
    row = MarketingTerms(
        version=latest + 1, body=body.strip(), is_active=True, created_by=actor_id
    )
    db.add(row)
    await db.flush()
    return row


# ─── marketer-safe serializer (whitelist — legal confidentiality) ───

_CONTRACT_STATUS_FA = {
    "new": "در انتظار",
    "reviewing": "در انتظار",
    "awaiting_call": "در انتظار",
    "followed_up": "در انتظار",
    "consulted": "در انتظار",
    "accepted": "قرارداد بسته شد",
    "completed": "قرارداد بسته شد",
    "rejected": "بسته نشد",
    "cancelled": "لغو",
}


def contract_status(status: str) -> str:
    return _CONTRACT_STATUS_FA.get(status or "", "در انتظار")


def mask_name(name: str) -> str:
    """Fallback when consent is absent — never expose the client's name."""
    return "مراجعه‌کننده"


def marketer_commission_row(comm: Commission, referred_name: str, stage: str) -> dict:
    """Whitelist ONLY: referred name (with consent), contract status, the
    received office fee, own rate, own commission, status, dates. No subject/
    type/parties/claim/phone/tracking/documents — the marketer must learn
    nothing about the case itself."""
    return {
        "id": str(comm.id),
        "name": referred_name,
        "contract_status": stage,
        "fee_amount": comm.basis_amount,
        "rate": comm.rate_bp / 100,
        "amount": comm.amount,
        "status": comm.status,
        "entry_type": comm.entry_type,
        "payout_id": str(comm.payout_id) if comm.payout_id else None,
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
            reversal_by_parent[r.parent_id] = (
                reversal_by_parent.get(r.parent_id, 0) + r.amount
            )
    for c in rows:
        if c.entry_type != "accrual":
            continue
        net = c.amount + reversal_by_parent.get(c.id, 0)
        if c.status in totals:
            totals[c.status] += net
    return totals
