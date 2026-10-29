"""Admin — marketer applications, profiles, referrals, payouts, commissions."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ....db.session import get_db
from ....models.account import (
    Commission,
    CommissionRule,
    MarketerApplication,
    MarketerProfile,
    PayoutRequest,
    ReferralAttribution,
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
                "ip": a.ip, "ua": a.ua[:80]}
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


# ─── payout queue ───────────────────────────────────────────────────


payouts_router = APIRouter(
    prefix="/payouts",
    tags=["admin-payouts"],
    dependencies=[Depends(manage_users)],
)


@payouts_router.get("")
async def payout_queue(db: DbDep) -> list[dict]:
    rows = (
        await db.execute(
            select(PayoutRequest, MarketerProfile, User)
            .join(MarketerProfile, MarketerProfile.id == PayoutRequest.marketer_id)
            .join(User, User.id == MarketerProfile.user_id)
            .order_by(PayoutRequest.created_at)
            .limit(300)
        )
    ).all()
    return [
        {
            "id": str(p.id),
            "marketer_id": str(p.marketer_id),
            "full_name": u.full_name,
            "ref_code": m.ref_code,
            "amount": p.amount,
            "status": p.status,
            "iban_masked": p.iban_masked,
            "payment_ref": p.payment_ref,
            "reject_reason": p.reject_reason,
            "created_at": p.created_at.isoformat(),
        }
        for p, m, u in rows
    ]


class PayoutApproveIn(BaseModel):
    payment_ref: str = Field(min_length=2, max_length=80)


class PayoutRejectIn(BaseModel):
    reason: str = Field(default="", max_length=300)


@payouts_router.post("/{payout_id}/approve")
async def payout_approve(
    db: DbDep, user: CurrentUser, payout_id: uuid.UUID, payload: PayoutApproveIn, request: Request
) -> dict:
    payout = await db.get(PayoutRequest, payout_id)
    if payout is None:
        raise HTTPException(404, {"code": "not_found", "message": "درخواست برداشت یافت نشد."})
    await comm_svc.approve_payout(db, payout, user, payload.payment_ref)
    await audit(db, actor=user, action="payout.approve", entity="payout_request",
                entity_id=payout.id, after={"payment_ref": payload.payment_ref}, request=request)
    await db.commit()
    return {"status": payout.status}


@payouts_router.post("/{payout_id}/reject")
async def payout_reject(
    db: DbDep, user: CurrentUser, payout_id: uuid.UUID, payload: PayoutRejectIn, request: Request
) -> dict:
    payout = await db.get(PayoutRequest, payout_id)
    if payout is None:
        raise HTTPException(404, {"code": "not_found", "message": "درخواست برداشت یافت نشد."})
    await comm_svc.reject_payout(db, payout, user, payload.reason)
    await audit(db, actor=user, action="payout.reject", entity="payout_request",
                entity_id=payout.id, after={"reason": payload.reason}, request=request)
    await db.commit()
    return {"status": payout.status}


# ─── commissions ────────────────────────────────────────────────────


commissions_router = APIRouter(
    prefix="/commissions",
    tags=["admin-commissions"],
    dependencies=[Depends(manage_users)],
)


# ─── rules (admin-configured per spec §6) ────────────────────────────


@commissions_router.get("/rules")
async def rules_list(db: DbDep) -> list[dict]:
    rows = (
        await db.execute(
            select(CommissionRule).order_by(CommissionRule.tier_min.desc())
        )
    ).scalars().all()
    return [
        {
            "id": str(r.id), "kind": r.kind, "value": r.value,
            "tier_min": r.tier_min,
            "marketer_id": str(r.marketer_id) if r.marketer_id else None,
            "is_active": r.is_active, "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ]


class RuleIn(BaseModel):
    kind: str = Field(pattern="^(fixed|percent)$")
    value: int = Field(ge=0)
    tier_min: int = Field(default=0, ge=0)
    marketer_id: uuid.UUID | None = None  # per-marketer override


@commissions_router.post("/rules", status_code=201)
async def rule_create(
    db: DbDep, user: CurrentUser, payload: RuleIn, request: Request
) -> dict:
    rule = CommissionRule(
        kind=payload.kind, value=payload.value,
        tier_min=payload.tier_min, marketer_id=payload.marketer_id,
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
            "hold_until": c.hold_until.isoformat() if c.hold_until else None,
            "created_at": c.created_at.isoformat(),
        }
        for c, m, u in rows
    ]


class CommissionDecideIn(BaseModel):
    reason: str = Field(default="", max_length=300)


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

