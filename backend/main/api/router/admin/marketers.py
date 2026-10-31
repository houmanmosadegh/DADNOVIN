"""Admin — marketer applications, profiles, referrals, commissions, report.
No wallet: commissions are settled manually by marking them paid."""

import csv
import io
import json
import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ....db.session import get_db
from ....models.account import (
    Commission,
    CommissionRule,
    MarketerApplication,
    MarketerProfile,
    ReferralAttribution,
    ReferralClick,
)
from ....models.consultation import ConsultationRequest
from ....models.user import User
from ....security.vault import decrypt_field, mask_digits
from ....services import commissions as comm_svc
from ....services import referrals as ref_svc
from ....services.audit import audit
from ...dependencies.auth import CurrentUser, manage_users

router = APIRouter(
    prefix="/marketers",
    tags=["admin-marketers"],
    dependencies=[Depends(manage_users)],
)
DbDep = Annotated[AsyncSession, Depends(get_db)]


def _profile_out(p: MarketerProfile) -> dict:
    return {
        "id": str(p.id),
        "user_id": str(p.user_id),
        "ref_code": p.ref_code,
        "is_active": p.is_active,
        "created_at": p.created_at.isoformat(),
        "iban_masked": mask_digits(decrypt_field(p.iban_enc)) if p.iban_enc else "",
        "card_masked": mask_digits(decrypt_field(p.card_enc)) if p.card_enc else "",
        "fraud_flag": p.fraud_flag,
    }


# ─── applications ───────────────────────────────────────────────────


@router.get("/applications")
async def applications(db: DbDep) -> list[dict]:
    rows = (
        await db.execute(
            select(MarketerApplication, User)
            .join(User, User.id == MarketerApplication.user_id)
            .order_by(MarketerApplication.created_at.desc())
            .limit(200)
        )
    ).all()
    return [
        {
            "id": str(a.id),
            "user_id": str(a.user_id),
            "full_name": u.full_name,
            "phone": u.phone,
            "status": a.status,
            "note": a.note,
            "channel": a.channel,
            "review_note": a.review_note,
            "created_at": a.created_at.isoformat(),
        }
        for a, u in rows
    ]


@router.post("/applications/{app_id}/approve")
async def approve_application(
    db: DbDep, user: CurrentUser, app_id: uuid.UUID, request: Request
) -> dict:
    app = await db.get(MarketerApplication, app_id)
    if app is None:
        raise HTTPException(404, {"code": "not_found", "message": "درخواست یافت نشد."})
    prof = await ref_svc.approve(db, app, user, "")
    await audit(
        db, actor=user, action="marketer.approve", entity="marketer_profile",
        entity_id=prof.id, after={"ref_code": prof.ref_code}, request=request,
    )
    await db.commit()
    return _profile_out(prof)


@router.post("/applications/{app_id}/reject")
async def reject_application(
    db: DbDep, user: CurrentUser, app_id: uuid.UUID, request: Request, payload: dict
) -> dict:
    app = await db.get(MarketerApplication, app_id)
    if app is None:
        raise HTTPException(404, {"code": "not_found", "message": "درخواست یافت نشد."})
    await ref_svc.reject(db, app, user, str(payload.get("reason", ""))[:400])
    await audit(db, actor=user, action="marketer.reject", entity="marketer_application",
                entity_id=app.id, request=request)
    await db.commit()
    return {"status": "rejected"}


# ─── profiles ───────────────────────────────────────────────────────


@router.get("")
async def profiles(db: DbDep) -> list[dict]:
    rows = (
        await db.execute(
            select(MarketerProfile, User)
            .join(User, User.id == MarketerProfile.user_id)
            .order_by(MarketerProfile.created_at.desc())
            .limit(300)
        )
    ).all()
    out = []
    for p, u in rows:
        item = _profile_out(p)
        item.update(
            full_name=u.full_name, phone=u.phone,
            stats=await ref_svc.stats_for(db, p.id),
        )
        out.append(item)
    return out


class ProfilePatchIn(BaseModel):
    is_active: bool | None = None
    fraud_flag: bool | None = None


@router.patch("/{profile_id}")
async def patch_profile(
    db: DbDep, user: CurrentUser, profile_id: uuid.UUID, payload: ProfilePatchIn, request: Request
) -> dict:
    prof = await db.get(MarketerProfile, profile_id)
    if prof is None:
        raise HTTPException(404, {"code": "not_found", "message": "بازاریاب یافت نشد."})
    before = {"is_active": prof.is_active, "fraud_flag": prof.fraud_flag}
    if payload.is_active is not None:
        prof.is_active = payload.is_active
    if payload.fraud_flag is not None:
        prof.fraud_flag = payload.fraud_flag
    await audit(db, actor=user, action="marketer.update", entity="marketer_profile",
                entity_id=prof.id, before=before,
                after={"is_active": prof.is_active, "fraud_flag": prof.fraud_flag},
                request=request)
    await db.commit()
    return _profile_out(prof)


@router.get("/{profile_id}/referrals")
async def profile_referrals(db: DbDep, profile_id: uuid.UUID) -> list[dict]:
    """Admin sees full names + tracking codes (auditing needs it)."""
    prof = await db.get(MarketerProfile, profile_id)
    if prof is None:
        raise HTTPException(404, {"code": "not_found", "message": "بازاریاب یافت نشد."})
    attrs = (
        await db.execute(
            select(ReferralAttribution)
            .where(ReferralAttribution.marketer_id == prof.id)
            .order_by(ReferralAttribution.created_at.desc())
            .limit(500)
        )
    ).scalars().all()
    out = []
    for a in attrs:
        item = {"id": str(a.id), "created_at": a.created_at.isoformat(),
                "ip": a.ip, "ua": a.user_agent[:80]}
        if a.request_type == "consultation":
            row = await db.get(ConsultationRequest, a.request_id)
            if row:
                item.update(
                    tracking_code=row.tracking_code, full_name=row.full_name,
                    phone=row.phone, status=row.status,
                    request_id=str(row.id),
                )
        out.append(item)
    return out


@router.get("/{profile_id}/commissions")
async def profile_commissions(db: DbDep, profile_id: uuid.UUID) -> list[dict]:
    """Per-marketer commission detail for the admin detail drawer."""
    prof = await db.get(MarketerProfile, profile_id)
    if prof is None:
        raise HTTPException(404, {"code": "not_found", "message": "بازاریاب یافت نشد."})
    rows = (
        await db.execute(
            select(Commission)
            .where(Commission.marketer_id == prof.id)
            .order_by(Commission.created_at.desc())
            .limit(300)
        )
    ).scalars().all()
    tracking = {
        str(c.id): c.tracking_code
        for c in (
            await db.execute(
                select(ConsultationRequest.id, ConsultationRequest.tracking_code).where(
                    ConsultationRequest.id.in_(
                        [r.request_id for r in rows] or [uuid.uuid4()]
                    )
                )
            )
        ).all()
    }
    return [
        {
            "id": str(c.id),
            "tracking_code": tracking.get(str(c.request_id)),
            "basis_kind": c.basis_kind,
            "basis_amount": c.basis_amount,
            "amount": c.amount,
            "status": c.status,
            "paid_at": c.paid_at.isoformat() if c.paid_at else None,
            "paid_note": c.paid_note,
            "created_at": c.created_at.isoformat(),
        }
        for c in rows
    ]


# ─── commissions ────────────────────────────────────────────────────


commissions_router = APIRouter(
    prefix="/commissions",
    tags=["admin-commissions"],
    dependencies=[Depends(manage_users)],
)


# ─── rules (admin-configured per spec §6) ────────────────────────────


def _rule_out(r: CommissionRule) -> dict:
    return {
        "id": str(r.id), "kind": r.kind, "value": r.value,
        "tier_min": r.tier_min,
        "marketer_id": str(r.marketer_id) if r.marketer_id else None,
        "min_amount": r.min_amount,
        "max_amount": r.max_amount,
        "starts_at": r.starts_at.isoformat() if r.starts_at else None,
        "ends_at": r.ends_at.isoformat() if r.ends_at else None,
        "is_active": r.is_active, "created_at": r.created_at.isoformat(),
    }


@commissions_router.get("/rules")
async def rules_list(db: DbDep) -> list[dict]:
    rows = (
        await db.execute(
            select(CommissionRule).order_by(CommissionRule.tier_min.desc())
        )
    ).scalars().all()
    return [_rule_out(r) for r in rows]


class RuleIn(BaseModel):
    kind: str = Field(pattern="^(fixed|percent)$")
    value: int = Field(ge=0)
    tier_min: int = Field(default=0, ge=0)
    marketer_id: uuid.UUID | None = None  # per-marketer override
    min_amount: int = Field(default=0, ge=0)  # clamp floor — 0 = none
    max_amount: int = Field(default=0, ge=0)  # clamp ceiling — 0 = none
    starts_at: datetime | None = None
    ends_at: datetime | None = None


@commissions_router.post("/rules", status_code=201)
async def rule_create(
    db: DbDep, user: CurrentUser, payload: RuleIn, request: Request
) -> dict:
    rule = CommissionRule(
        kind=payload.kind, value=payload.value,
        tier_min=payload.tier_min, marketer_id=payload.marketer_id,
        min_amount=payload.min_amount, max_amount=payload.max_amount,
        starts_at=payload.starts_at, ends_at=payload.ends_at,
    )
    db.add(rule)
    await db.flush()
    await audit(db, actor=user, action="commission.rule_create", entity="commission_rule",
                entity_id=rule.id, after=payload.model_dump(mode="json"), request=request)
    await db.commit()
    return {"id": str(rule.id)}


@commissions_router.post("/rules/{rule_id}/toggle")
async def rule_toggle(
    db: DbDep, user: CurrentUser, rule_id: uuid.UUID, request: Request
) -> dict:
    rule = await db.get(CommissionRule, rule_id)
    if rule is None:
        raise HTTPException(404, {"code": "not_found", "message": "قاعده یافت نشد."})
    rule.is_active = not rule.is_active
    await audit(db, actor=user, action="commission.rule_toggle", entity="commission_rule",
                entity_id=rule.id, after={"is_active": rule.is_active}, request=request)
    await db.commit()
    return {"is_active": rule.is_active}


@commissions_router.get("")
async def commission_list(db: DbDep) -> list[dict]:
    rows = (
        await db.execute(
            select(Commission, MarketerProfile, User)
            .join(MarketerProfile, MarketerProfile.id == Commission.marketer_id)
            .join(User, User.id == MarketerProfile.user_id)
            .order_by(Commission.created_at.desc())
            .limit(500)
        )
    ).all()
    return [
        {
            "id": str(c.id),
            "marketer_id": str(c.marketer_id),
            "full_name": u.full_name,
            "ref_code": m.ref_code,
            "request_type": c.request_type,
            "request_id": str(c.request_id),
            "amount": c.amount,
            "status": c.status,
            "basis_kind": c.basis_kind,
            "basis_amount": c.basis_amount,
            "rule_snapshot": json.loads(c.rule_snapshot) if c.rule_snapshot else None,
            "paid_at": c.paid_at.isoformat() if c.paid_at else None,
            "paid_note": c.paid_note,
            "created_at": c.created_at.isoformat(),
        }
        for c, m, u in rows
    ]


class CommissionDecideIn(BaseModel):
    reason: str = Field(default="", max_length=300)


class CommissionPayIn(BaseModel):
    note: str = Field(default="", max_length=300)


@commissions_router.post("/{commission_id}/approve")
async def commission_approve(
    db: DbDep, user: CurrentUser, commission_id: uuid.UUID, request: Request
) -> dict:
    comm = await db.get(Commission, commission_id)
    if comm is None:
        raise HTTPException(404, {"code": "not_found", "message": "کمیسیون یافت نشد."})
    if comm.status != "pending":
        raise HTTPException(409, {"code": "bad_state", "message": "در این وضعیت قابل تأیید نیست."})
    await comm_svc.approve_commission(db, comm, user.id)
    await audit(db, actor=user, action="commission.approve", entity="commission",
                entity_id=comm.id, after={"amount": comm.amount}, request=request)
    await db.commit()
    return {"status": "approved"}


@commissions_router.post("/{commission_id}/pay")
async def commission_pay(
    db: DbDep, user: CurrentUser, commission_id: uuid.UUID,
    payload: CommissionPayIn, request: Request,
) -> dict:
    """Manual settlement — admin marks an approved commission as paid."""
    comm = await db.get(Commission, commission_id)
    if comm is None:
        raise HTTPException(404, {"code": "not_found", "message": "کمیسیون یافت نشد."})
    await comm_svc.mark_paid(db, comm, user, payload.note)
    await audit(db, actor=user, action="commission.pay", entity="commission",
                entity_id=comm.id,
                after={"amount": comm.amount, "note": payload.note}, request=request)
    await db.commit()
    return {"status": "paid", "paid_at": comm.paid_at.isoformat() if comm.paid_at else None}


@commissions_router.post("/{commission_id}/cancel")
async def commission_cancel(
    db: DbDep, user: CurrentUser, commission_id: uuid.UUID, payload: CommissionDecideIn, request: Request
) -> dict:
    comm = await db.get(Commission, commission_id)
    if comm is None:
        raise HTTPException(404, {"code": "not_found", "message": "کمیسیون یافت نشد."})
    if comm.status == "paid":
        raise HTTPException(409, {"code": "bad_state", "message": "کمیسیون پرداخت‌شده قابل لغو نیست."})
    await comm_svc.cancel_commission(db, comm, user.id)
    await audit(db, actor=user, action="commission.cancel", entity="commission",
                entity_id=comm.id, after={"reason": payload.reason}, request=request)
    await db.commit()
    return {"status": "cancelled"}


class PreviewIn(BaseModel):
    marketer_id: uuid.UUID | None = None
    basis_amount: int = Field(default=0, ge=0)
    accepted_count: int | None = Field(default=None, ge=0)


@commissions_router.post("/preview")
async def commission_preview(db: DbDep, payload: PreviewIn) -> dict:
    """What-if — same engine the real flow uses; nothing is written."""
    return await comm_svc.preview_commission(
        db, payload.marketer_id, payload.basis_amount, payload.accepted_count
    )


# ─── performance report + suspicious ────────────────────────────────


def _rng(col, start: datetime | None, end: datetime | None) -> list:
    out = []
    if start is not None:
        out.append(col >= start)
    if end is not None:
        out.append(col <= end)
    return out


@router.get("/report")
async def marketer_report(
    db: DbDep,
    q: Annotated[str | None, Query(max_length=80)] = None,
    start: Annotated[datetime | None, Query()] = None,
    end: Annotated[datetime | None, Query()] = None,
) -> dict:
    """Leaderboard + funnel + sales/commissions + last activity per marketer.

    `q` filters by name / ref_code / phone; `start`/`end` bound every
    metric (clicks, attributions, commissions, sales) by its created_at.
    """
    stmt = select(MarketerProfile, User).join(User, User.id == MarketerProfile.user_id)
    if q and q.strip():
        like = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                User.full_name.ilike(like),
                User.phone.ilike(like),
                MarketerProfile.ref_code.ilike(like),
            )
        )
    rows = (await db.execute(stmt)).all()

    # ── aggregated metrics in range — grouped queries, one pass each ──
    click_rows = (
        await db.execute(
            select(
                ReferralClick.ref_code,
                func.count(ReferralClick.id),
                func.count(func.distinct(ReferralClick.visitor_hash)),
                func.max(ReferralClick.created_at),
            )
            .where(ReferralClick.suspicious.is_(False), *_rng(ReferralClick.created_at, start, end))
            .group_by(ReferralClick.ref_code)
        )
    ).all()
    clicks = {rc: (n, uq, last) for rc, n, uq, last in click_rows}

    attr_rows = (
        await db.execute(
            select(
                ReferralAttribution.marketer_id,
                func.count(ReferralAttribution.id),
                func.max(ReferralAttribution.created_at),
            )
            .where(*_rng(ReferralAttribution.created_at, start, end))
            .group_by(ReferralAttribution.marketer_id)
        )
    ).all()
    attrs = {m: (n, last) for m, n, last in attr_rows}

    case_rows = (
        await db.execute(
            select(
                ReferralAttribution.marketer_id,
                func.count(ConsultationRequest.id),
                func.coalesce(func.sum(ConsultationRequest.fee_amount), 0),
            )
            .join(
                ConsultationRequest,
                and_(
                    ConsultationRequest.id == ReferralAttribution.request_id,
                    ReferralAttribution.request_type == "consultation",
                ),
            )
            .where(
                ConsultationRequest.status == "accepted",
                *_rng(ReferralAttribution.created_at, start, end),
            )
            .group_by(ReferralAttribution.marketer_id)
        )
    ).all()
    cases = {m: (n, sales) for m, n, sales in case_rows}

    comm_rows = (
        await db.execute(
            select(
                Commission.marketer_id,
                Commission.status,
                func.coalesce(func.sum(Commission.amount), 0),
                func.max(Commission.created_at),
            )
            .where(*_rng(Commission.created_at, start, end))
            .group_by(Commission.marketer_id, Commission.status)
        )
    ).all()
    comms: dict[uuid.UUID, dict] = {}
    comm_last: dict[uuid.UUID, datetime] = {}
    for m, st, total, last in comm_rows:
        comms.setdefault(m, {"pending": 0, "approved": 0, "paid": 0, "cancelled": 0})
        if st in comms[m]:
            comms[m][st] += total
        if last and (m not in comm_last or last > comm_last[m]):
            comm_last[m] = last

    board = []
    for p, u in rows:
        cl_n, cl_uq, cl_last = clicks.get(p.ref_code, (0, 0, None))
        at_n, at_last = attrs.get(p.id, (0, None))
        ca_n, sales = cases.get(p.id, (0, 0))
        ctotals = comms.get(
            p.id, {"pending": 0, "approved": 0, "paid": 0, "cancelled": 0}
        )
        last_seen = max(
            (t for t in (cl_last, at_last, comm_last.get(p.id)) if t is not None),
            default=None,
        )
        board.append(
            {
                "id": str(p.id),
                "full_name": u.full_name,
                "phone": u.phone,
                "ref_code": p.ref_code,
                "is_active": p.is_active,
                "fraud_flag": p.fraud_flag,
                "clicks": cl_n,
                "unique_clicks": cl_uq,
                "requests": at_n,          # لیدها/پرونده‌های منسوب
                "accepted": ca_n,          # پرونده‌های موفق
                "sales": sales,            # مجموع مبلغ پرونده‌های موفق
                "commissions": ctotals,    # کمیسیون به تفکیک وضعیت
                "earned": ctotals["pending"] + ctotals["approved"] + ctotals["paid"],
                "conversion": round(at_n / cl_n * 100, 1) if cl_n else 0.0,
                "last_activity": last_seen.isoformat() if last_seen else None,
            }
        )
    board.sort(key=lambda b: (b["accepted"], b["requests"], b["clicks"]), reverse=True)

    funnel = {
        "clicks": sum(b["clicks"] for b in board),
        "unique_clicks": sum(b["unique_clicks"] for b in board),
        "requests": sum(b["requests"] for b in board),
        "accepted": sum(b["accepted"] for b in board),
        "sales": sum(b["sales"] for b in board),
    }
    sources = (
        await db.execute(
            select(
                ReferralClick.link_label,
                func.count(ReferralClick.id),
                func.count(func.distinct(ReferralClick.visitor_hash)),
            )
            .where(
                ReferralClick.suspicious.is_(False),
                *_rng(ReferralClick.created_at, start, end),
            )
            .group_by(ReferralClick.link_label)
            .order_by(func.count(ReferralClick.id).desc())
            .limit(20)
        )
    ).all()
    suspicious = (
        await db.execute(
            select(ReferralClick)
            .where(ReferralClick.suspicious.is_(True))
            .order_by(ReferralClick.created_at.desc())
            .limit(50)
        )
    ).scalars().all()
    return {
        "leaderboard": board,
        "funnel": funnel,
        "sources": [
            {"label": s or "مستقیم", "clicks": c, "unique": u} for s, c, u in sources
        ],
        "suspicious": [
            {
                "id": str(c.id),
                "ref_code": c.ref_code,
                "reason": c.suspicious_reason,
                "ip": c.ip,
                "created_at": c.created_at.isoformat(),
            }
            for c in suspicious
        ],
    }


@router.get("/report.csv")
async def marketer_report_csv(
    db: DbDep,
    q: Annotated[str | None, Query(max_length=80)] = None,
    start: Annotated[datetime | None, Query()] = None,
    end: Annotated[datetime | None, Query()] = None,
) -> Response:
    """Excel-friendly export of the leaderboard (same filters as /report)."""
    report = await marketer_report(db, q=q, start=start, end=end)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(
        ["marketer", "ref_code", "active", "clicks", "unique_clicks",
         "requests", "accepted", "sales_rials", "conversion",
         "comm_pending", "comm_approved", "comm_paid", "comm_cancelled",
         "last_activity", "fraud_flag"]
    )
    for b in report["leaderboard"]:
        c = b["commissions"]
        w.writerow(
            [b["full_name"], b["ref_code"], b["is_active"], b["clicks"],
             b["unique_clicks"], b["requests"], b["accepted"], b["sales"],
             b["conversion"], c["pending"], c["approved"], c["paid"],
             c["cancelled"], b["last_activity"], b["fraud_flag"]]
        )
    return Response(
        "﻿" + buf.getvalue(),  # BOM so Excel opens it as UTF-8
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="marketers.csv"'},
    )

