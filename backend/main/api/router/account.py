"""Public account endpoints — register/login/reset, my requests, marketer, wallet."""

import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.config import get_settings
from ...core.rate_limit import client_key, limiter
from ...db.session import get_db
from ...models.account import (
    InboxNotification,
    MarketerApplication,
    PasswordResetToken,
    PayoutRequest,
    ReferralAttribution,
    Commission,
)
from ...models.consultation import ConsultationRequest
from ...models.request_ops import RequestEvent, RequestMessage
from ...db.base import aware, utcnow
from ...models.user import Role, Session, User
from ...notify.providers import get_provider
from ...schemas.account import (
    AccountMeOut,
    BankDetailsIn,
    ForgotIn,
    LoginPhoneIn,
    MarketerApplyIn,
    PasswordChangeIn,
    PayoutIn,
    ProfilePatchIn,
    RegisterIn,
    ResetIn,
)
from ...security.passwords import hash_password, verify_password
from ...security.sessions import create_session, revoke_session
from ...security.vault import encrypt_field, mask_digits, decrypt_field
from ...services import commissions as comm_svc
from ...services import referrals as ref_svc
from ...services import thread as thread_svc
from ...services import wallet as wallet_svc
from ...services.audit import audit
from ..dependencies.auth import CurrentUser

router = APIRouter(prefix="/account", tags=["account"])
auth_router = APIRouter(prefix="/account-auth", tags=["account-auth"])
DbDep = Annotated[AsyncSession, Depends(get_db)]


async def _role(db: AsyncSession, name: str) -> Role:
    role = (
        await db.execute(select(Role).where(Role.name == name))
    ).scalar_one_or_none()
    if role is None:
        raise HTTPException(500, {"code": "no_role", "message": "نقش در سیستم تعریف نشده است."})
    return role


def _set_session_cookie(response: Response, settings, token: str) -> None:
    response.set_cookie(
        settings.session_cookie_name,
        token,
        max_age=settings.session_ttl_hours * 3600,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        path="/",
    )


async def _link_prior_requests(db: AsyncSession, user: User) -> int:
    """Claim guest requests submitted earlier with the same phone."""
    rows = (
        await db.execute(
            select(ConsultationRequest).where(
                ConsultationRequest.phone == user.phone,
                ConsultationRequest.user_id.is_(None),
            )
        )
    ).scalars().all()
    for r in rows:
        r.user_id = user.id
    if rows:
        await db.flush()
    return len(rows)


# ─── register / login / reset ───────────────────────────────────────


@auth_router.post("/register", status_code=201)
async def register(
    payload: RegisterIn, request: Request, response: Response, db: DbDep
) -> AccountMeOut:
    settings = get_settings()
    limiter.check("register", client_key(request), settings.rate_limit_login_per_minute)
    clash = (
        await db.execute(select(User.id).where(User.phone == payload.phone))
    ).scalar_one_or_none()
    if clash is not None:
        raise HTTPException(
            409, {"code": "phone_taken", "message": "با این شماره قبلاً ثبت‌نام شده است؛ وارد شوید."}
        )
    if payload.ref_code.strip():
        if await ref_svc.resolve_code(db, payload.ref_code) is None:
            raise HTTPException(
                400, {"code": "bad_ref", "message": "کد معرف معتبر یا فعال نیست."}
            )
    user = User(
        username=payload.phone,
        phone=payload.phone,
        full_name=payload.full_name.strip(),
        password_hash=hash_password(payload.password),
        roles=[await _role(db, "user")],
    )
    db.add(user)
    await db.flush()
    await _link_prior_requests(db, user)
    session, token = await create_session(
        db, user, ip=client_key(request), user_agent=request.headers.get("user-agent", "")[:300]
    )
    _set_session_cookie(response, settings, token)
    await audit(db, actor=user, action="account.register", entity="user", entity_id=user.id, request=request)
    await db.commit()
    return await _me_out(db, user)


@auth_router.post("/login")
async def login_phone(
    payload: LoginPhoneIn, request: Request, response: Response, db: DbDep
) -> AccountMeOut:
    settings = get_settings()
    limiter.check("login", client_key(request), settings.rate_limit_login_per_minute)
    user = (
        await db.execute(select(User).where(User.phone == payload.phone))
    ).scalar_one_or_none()
    generic = HTTPException(
        401, {"code": "bad_credentials", "message": "شماره موبایل یا رمز عبور نادرست است."}
    )
    if user is None or not user.is_active or not verify_password(
        payload.password, user.password_hash
    ):
        raise generic
    await _link_prior_requests(db, user)
    session, token = await create_session(
        db, user, ip=client_key(request), user_agent=request.headers.get("user-agent", "")[:300]
    )
    _set_session_cookie(response, settings, token)
    await audit(db, actor=user, action="account.login", entity="session", entity_id=session.id, request=request)
    await db.commit()
    return await _me_out(db, user)


@auth_router.post("/forgot")
async def forgot(payload: ForgotIn, request: Request, db: DbDep) -> dict:
    """One-shot reset token via the notification provider (OTP-ready)."""
    settings = get_settings()
    limiter.check("forgot", client_key(request), settings.rate_limit_login_per_minute)
    user = (
        await db.execute(select(User).where(User.phone == payload.phone))
    ).scalar_one_or_none()
    if user is not None and user.is_active:
        raw = secrets.token_urlsafe(32)
        db.add(
            PasswordResetToken(
                user_id=user.id,
                token_hash=hashlib.sha256(raw.encode()).hexdigest(),
                expires_at=datetime.now(UTC) + timedelta(minutes=30),
            )
        )
        provider = get_provider()
        await provider.send_sms(
            to=payload.phone,
            body=f"دادنوین — کد بازیابی رمز عبور:\n{raw}\n(۳۰ دقیقه معتبر است)",
        )
        await db.commit()
    # never reveal whether the number exists
    return {"message": "اگر شماره در سیستم باشد، کد بازیابی ارسال می‌شود."}


@auth_router.post("/reset")
async def reset(payload: ResetIn, request: Request, db: DbDep) -> dict:
    limiter.check("reset", client_key(request), get_settings().rate_limit_login_per_minute)
    token_hash = hashlib.sha256(payload.token.encode()).hexdigest()
    row = (
        await db.execute(
            select(PasswordResetToken).where(
                PasswordResetToken.token_hash == token_hash
            )
        )
    ).scalar_one_or_none()
    if (
        row is None
        or row.used_at is not None
        or aware(row.expires_at) < utcnow()
    ):
        raise HTTPException(400, {"code": "bad_token", "message": "کد نامعتبر یا منقضی است."})
    user = await db.get(User, row.user_id)
    if user is None:
        raise HTTPException(400, {"code": "bad_token", "message": "کد نامعتبر است."})
    user.password_hash = hash_password(payload.password)
    row.used_at = datetime.now(UTC)
    # revoke all existing sessions for safety
    sessions = (
        await db.execute(select(Session).where(Session.user_id == user.id))
    ).scalars().all()
    for s in sessions:
        await revoke_session(db, s)
    await db.commit()
    return {"message": "رمز عبور تغییر کرد؛ دوباره وارد شوید."}


# ─── profile ────────────────────────────────────────────────────────


async def _me_out(db: AsyncSession, user: User) -> AccountMeOut:
    prof = await ref_svc.profile_for_user(db, user.id)
    app = (
        await db.execute(
            select(MarketerApplication)
            .where(MarketerApplication.user_id == user.id)
            .order_by(MarketerApplication.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    roles = user.role_names
    return AccountMeOut(
        id=user.id,
        full_name=user.full_name,
        phone=user.phone,
        roles=roles,
        is_marketer=prof is not None,
        ref_code=prof.ref_code if prof else "",
        marketer_status="approved" if prof else (app.status if app else ""),
    )


@router.get("/me")
async def account_me(db: DbDep, user: CurrentUser) -> AccountMeOut:
    return await _me_out(db, user)


@router.patch("/me")
async def patch_me(db: DbDep, user: CurrentUser, payload: ProfilePatchIn) -> AccountMeOut:
    if payload.full_name:
        user.full_name = payload.full_name.strip()
    if payload.phone and payload.phone != user.phone:
        clash = (
            await db.execute(select(User.id).where(User.phone == payload.phone))
        ).scalar_one_or_none()
        if clash is not None:
            raise HTTPException(409, {"code": "phone_taken", "message": "این شماره قبلاً ثبت شده است."})
        user.phone = payload.phone
        user.username = payload.phone
        await _link_prior_requests(db, user)
    await db.commit()
    return await _me_out(db, user)


@router.post("/password")
async def change_password(db: DbDep, user: CurrentUser, payload: PasswordChangeIn) -> dict:
    if not verify_password(payload.current, user.password_hash):
        raise HTTPException(400, {"code": "bad_password", "message": "رمز فعلی نادرست است."})
    user.password_hash = hash_password(payload.new)
    await db.commit()
    return {"message": "رمز عبور تغییر کرد."}


# ─── my requests ────────────────────────────────────────────────────


async def _own_request(db: AsyncSession, user: User, request_id: uuid.UUID) -> ConsultationRequest:
    row = await db.get(ConsultationRequest, request_id)
    if row is None or (row.user_id != user.id and row.phone != user.phone):
        raise HTTPException(404, {"code": "not_found", "message": "درخواست یافت نشد."})
    return row


@router.get("/requests")
async def my_requests(db: DbDep, user: CurrentUser) -> list[dict]:
    rows = (
        await db.execute(
            select(ConsultationRequest)
            .where(ConsultationRequest.user_id == user.id)
            .order_by(ConsultationRequest.created_at.desc())
            .limit(100)
        )
    ).scalars().all()
    # also include still-unlinked requests sharing this phone (pending claim)
    unlinked = (
        await db.execute(
            select(ConsultationRequest).where(
                ConsultationRequest.phone == user.phone,
                ConsultationRequest.user_id.is_(None),
            )
        )
    ).scalars().all()
    for r in unlinked:
        r.user_id = user.id
        rows.append(r)
    if unlinked:
        await db.flush()
        await db.commit()
    rows.sort(key=lambda r: r.created_at, reverse=True)
    return [
        {
            "id": str(r.id),
            "tracking_code": r.tracking_code,
            "topic": r.topic or r.service_slug,
            "status": r.status,
            "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ]


@router.get("/requests/{request_id}")
async def my_request_detail(db: DbDep, user: CurrentUser, request_id: uuid.UUID) -> dict:
    row = await _own_request(db, user, request_id)
    msgs = (
        await db.execute(
            select(RequestMessage)
            .where(
                RequestMessage.request_type == "consultation",
                RequestMessage.request_id == row.id,
                RequestMessage.is_note.is_(False),
            )
            .order_by(RequestMessage.created_at)
        )
    ).scalars().all()
    events = (
        await db.execute(
            select(RequestEvent)
            .where(
                RequestEvent.request_type == "consultation",
                RequestEvent.request_id == row.id,
                RequestEvent.event_type == "status_change",
            )
            .order_by(RequestEvent.created_at)
        )
    ).scalars().all()
    return {
        "id": str(row.id),
        "tracking_code": row.tracking_code,
        "topic": row.topic or row.service_slug,
        "status": row.status,
        "created_at": row.created_at.isoformat(),
        "events": [
            {
                "from": e.payload.get("from", ""),
                "to": e.payload.get("to", ""),
                "created_at": e.created_at.isoformat(),
            }
            for e in events
        ],
        "messages": [
            {
                "id": str(m.id),
                "sender_type": m.sender_type,
                "body": m.body,
                "created_at": m.created_at.isoformat(),
            }
            for m in msgs
        ],
    }


@router.post("/requests/{request_id}/reply", status_code=201)
async def my_request_reply(
    db: DbDep, user: CurrentUser, request_id: uuid.UUID, payload: dict
) -> dict:
    row = await _own_request(db, user, request_id)
    body = str(payload.get("body", "")).strip()
    if not body or len(body) > 4000:
        raise HTTPException(400, {"code": "bad_body", "message": "متن پاسخ معتبر نیست."})
    msg = await thread_svc.add_message(
        db, "consultation", row.id, sender_type="customer", sender_id=user.id, body=body
    )
    await thread_svc.add_event(
        db, "consultation", row.id, "customer_reply", payload={"message_id": str(msg.id)}
    )
    await db.commit()
    return {"id": str(msg.id)}


# ─── notifications ──────────────────────────────────────────────────


@router.get("/notifications")
async def my_notifications(db: DbDep, user: CurrentUser) -> list[dict]:
    rows = (
        await db.execute(
            select(InboxNotification)
            .where(InboxNotification.user_id == user.id)
            .order_by(InboxNotification.created_at.desc())
            .limit(50)
        )
    ).scalars().all()
    return [
        {
            "id": str(n.id),
            "title": n.title,
            "body": n.body,
            "kind": n.kind,
            "link": n.link,
            "read": n.read_at is not None,
            "created_at": n.created_at.isoformat(),
        }
        for n in rows
    ]


@router.post("/notifications/{notif_id}/read")
async def read_notification(db: DbDep, user: CurrentUser, notif_id: uuid.UUID) -> dict:
    n = await db.get(InboxNotification, notif_id)
    if n is None or n.user_id != user.id:
        raise HTTPException(404, {"code": "not_found", "message": "یافت نشد."})
    n.read_at = datetime.now(UTC)
    await db.commit()
    return {"ok": True}


# ─── marketer ───────────────────────────────────────────────────────


@router.post("/marketer/apply", status_code=201)
async def marketer_apply(
    db: DbDep, user: CurrentUser, payload: MarketerApplyIn, request: Request
) -> dict:
    app = await ref_svc.apply(db, user, payload.note)
    await audit(db, actor=user, action="marketer.apply", entity="marketer_application", entity_id=app.id, request=request)
    await db.commit()
    return {"id": str(app.id), "status": app.status}


@router.get("/marketer")
async def marketer_home(db: DbDep, user: CurrentUser) -> dict:
    prof = await ref_svc.profile_for_user(db, user.id)
    cfg = await comm_svc.referral_settings(db)
    if prof is None:
        app = (
            await db.execute(
                select(MarketerApplication)
                .where(MarketerApplication.user_id == user.id)
                .order_by(MarketerApplication.created_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        return {"status": app.status if app else "none", "commission_enabled": bool(cfg.get("commission_enabled"))}
    stats = await ref_svc.stats_for(db, prof.id)
    return {
        "status": "approved",
        "ref_code": prof.ref_code,
        "ref_link": f"/?ref={prof.ref_code}",
        "is_active": prof.is_active,
        "commission_enabled": bool(cfg.get("commission_enabled")),
        "cookie_days": int(cfg.get("cookie_days", 30)),
        "stats": stats,
        "iban_masked": _iban_masked(prof),
    }


def _iban_masked(prof) -> str:
    raw = decrypt_field(prof.iban_enc) if prof.iban_enc else ""
    return mask_digits(raw) if raw else ""


@router.get("/marketer/referrals")
async def marketer_referrals(db: DbDep, user: CurrentUser) -> list[dict]:
    """PRIVACY-SAFE list — masked name, coarse status, dates only.

    Never includes topic/message/documents — the marketer must not see
    any case details.
    """
    prof = await ref_svc.profile_for_user(db, user.id)
    if prof is None:
        return []
    attrs = (
        await db.execute(
            select(ReferralAttribution)
            .where(ReferralAttribution.marketer_id == prof.id)
            .order_by(ReferralAttribution.created_at.desc())
            .limit(200)
        )
    ).scalars().all()
    out = []
    status_map = {
        "new": "در انتظار", "reviewing": "در حال بررسی", "awaiting_call": "در حال بررسی",
        "followed_up": "در حال بررسی", "consulted": "در حال بررسی",
        "accepted": "پذیرفته شد", "rejected": "رد شد",
        "completed": "پذیرفته شد", "cancelled": "رد شد",
    }
    for a in attrs:
        name, status, created = "", "", a.created_at.isoformat()
        if a.request_type == "consultation":
            row = await db.get(ConsultationRequest, a.request_id)
            if row:
                name = _mask_name(row.full_name)
                status = status_map.get(row.status, "در انتظار")
        out.append(
            {"masked_name": name, "status": status, "created_at": created}
        )
    return out


def _mask_name(name: str) -> str:
    parts = (name or "").strip().split()
    return " ".join(f"{p[0]}." for p in parts[:3] if p) or "—"


@router.post("/marketer/bank")
async def marketer_bank(db: DbDep, user: CurrentUser, payload: BankDetailsIn) -> dict:
    prof = await ref_svc.profile_for_user(db, user.id)
    if prof is None:
        raise HTTPException(403, {"code": "not_marketer", "message": "حساب بازاریاب نیستید."})
    if payload.iban:
        digits = "".join(ch for ch in payload.iban if ch.isdigit())
        if len(digits) < 20:
            raise HTTPException(400, {"code": "bad_iban", "message": "شماره شبا معتبر نیست."})
        prof.iban_enc = encrypt_field(payload.iban.replace(" ", "").upper())
    if payload.card:
        prof.card_enc = encrypt_field(payload.card.replace(" ", ""))
    await db.commit()
    return {"message": "اطلاعات بانکی ذخیره شد.", "iban_masked": _iban_masked(prof)}


# ─── wallet & payouts ───────────────────────────────────────────────


@router.get("/wallet")
async def wallet_view(db: DbDep, user: CurrentUser) -> dict:
    prof = await ref_svc.profile_for_user(db, user.id)
    if prof is None:
        raise HTTPException(403, {"code": "not_marketer", "message": "حساب بازاریاب نیستید."})
    cfg = await comm_svc.referral_settings(db)
    bal = await wallet_svc.balance(db, prof.id)
    pending_comms = (
        await db.execute(
            select(func.coalesce(func.sum(Commission.amount), 0)).where(
                Commission.marketer_id == prof.id, Commission.status == "pending"
            )
        )
    ).scalar_one()
    pending_payouts = (
        await db.execute(
            select(func.coalesce(func.sum(PayoutRequest.amount), 0)).where(
                PayoutRequest.marketer_id == prof.id, PayoutRequest.status == "pending"
            )
        )
    ).scalar_one()
    items = await wallet_svc.entries(db, prof.id)
    return {
        "balance": bal,
        "pending_commissions": pending_comms,
        "pending_payouts": pending_payouts,
        "min_payout": int(cfg.get("min_payout", 0)),
        "commission_enabled": bool(cfg.get("commission_enabled")),
        "entries": [
            {
                "id": str(e.id),
                "kind": e.kind,
                "amount": e.amount,
                "memo": e.memo,
                "created_at": e.created_at.isoformat(),
            }
            for e in items
        ],
    }


@router.post("/payouts", status_code=201)
async def payout_create(db: DbDep, user: CurrentUser, payload: PayoutIn, request: Request) -> dict:
    limiter.check("payout", client_key(request), get_settings().rate_limit_login_per_minute)
    prof = await ref_svc.profile_for_user(db, user.id)
    if prof is None:
        raise HTTPException(403, {"code": "not_marketer", "message": "حساب بازاریاب نیستید."})
    payout = await comm_svc.request_payout(db, prof, payload.amount)
    await audit(db, actor=user, action="payout.request", entity="payout_request", entity_id=payout.id,
                after={"amount": payload.amount}, request=request)
    await db.commit()
    return {"id": str(payout.id), "status": payout.status}


@router.get("/payouts")
async def payout_list(db: DbDep, user: CurrentUser) -> list[dict]:
    prof = await ref_svc.profile_for_user(db, user.id)
    if prof is None:
        return []
    rows = (
        await db.execute(
            select(PayoutRequest)
            .where(PayoutRequest.marketer_id == prof.id)
            .order_by(PayoutRequest.created_at.desc())
            .limit(50)
        )
    ).scalars().all()
    return [
        {
            "id": str(p.id),
            "amount": p.amount,
            "status": p.status,
            "iban_masked": p.iban_masked,
            "payment_ref": p.payment_ref,
            "created_at": p.created_at.isoformat(),
        }
        for p in rows
    ]


