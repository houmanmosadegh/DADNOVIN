"""Public account endpoints — register/login/reset, my requests, marketer, commissions."""

import hashlib
import re
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.config import get_settings
from ...core.rate_limit import client_key, limiter
from ...db.session import get_db
from ...models.account import (
    InboxNotification,
    MarketerApplication,
    OtpToken,
    PasswordResetToken,
    ReferralAttribution,
    Commission,
    CommissionRule,
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
    OtpRequestIn,
    PasswordChangeIn,
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
from ...services.audit import audit
from ..dependencies.auth import CurrentUser

router = APIRouter(prefix="/account", tags=["account"])
auth_router = APIRouter(prefix="/account-auth", tags=["account-auth"])
DbDep = Annotated[AsyncSession, Depends(get_db)]

REF_COOKIE = "dn_ref"


async def _marketing_on(db: AsyncSession) -> None:
    """404 the marketing surface entirely while the admin switch is off —
    routes must not even hint the feature exists."""
    if not await comm_svc.marketing_enabled(db):
        raise HTTPException(404, {"code": "not_found", "message": "یافت نشد."})


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


async def _auth_settings(db: AsyncSession) -> dict:
    from ...models.content import SiteSetting

    row = await db.get(SiteSetting, "auth")
    cfg = {"otp_enabled": False, "otp_ttl_minutes": 5, "otp_length": 6}
    if row and isinstance(row.value, dict):
        cfg.update({k: v for k, v in row.value.items() if k in cfg})
    return cfg


def _hash_code(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


async def _verify_otp(db: AsyncSession, phone: str, code: str, purpose: str) -> bool:
    """Latest unconsumed code for this phone; bounded attempts, marked used."""
    tok = (
        await db.execute(
            select(OtpToken)
            .where(
                OtpToken.phone == phone,
                OtpToken.purpose == purpose,
                OtpToken.used_at.is_(None),
            )
            .order_by(OtpToken.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if tok is None or tok.attempts >= 5 or aware(tok.expires_at) < datetime.now(UTC):
        return False
    tok.attempts += 1
    if tok.code_hash != _hash_code(code.strip()):
        await db.flush()
        return False
    tok.used_at = datetime.now(UTC)
    await db.flush()
    return True


@auth_router.get("/config")
async def auth_config(db: DbDep) -> dict:
    """Feature flags for the auth form — the UI asks before rendering OTP."""
    cfg = await _auth_settings(db)
    return {"otp_enabled": bool(cfg["otp_enabled"])}


@auth_router.get("/check-username")
async def check_username(db: DbDep, u: Annotated[str, Query(max_length=30)]) -> dict:
    """Live availability probe — same rules as RegisterIn."""
    u = u.strip().lower()
    if not re.fullmatch(r"[a-z0-9_]{3,24}", u):
        return {"available": False, "reason": "format"}
    clash = (
        await db.execute(select(User.id).where(User.username == u))
    ).scalar_one_or_none()
    return {"available": clash is None, "reason": "taken" if clash else ""}


@auth_router.post("/otp/request")
async def otp_request(payload: OtpRequestIn, request: Request, db: DbDep) -> dict:
    """Issue a verification code through the configured provider (log/mock
    until a real SMS gateway is wired). No-op leak — same reply either way."""
    settings = get_settings()
    limiter.check("otp", client_key(request), settings.rate_limit_login_per_minute)
    cfg = await _auth_settings(db)
    if not cfg["otp_enabled"]:
        raise HTTPException(
            400, {"code": "otp_disabled", "message": "تأیید پیامکی فعال نیست."}
        )
    code = "".join(secrets.choice("0123456789") for _ in range(int(cfg["otp_length"])))
    db.add(
        OtpToken(
            phone=payload.phone,
            purpose=payload.purpose,
            code_hash=_hash_code(code),
            expires_at=datetime.now(UTC)
            + timedelta(minutes=int(cfg["otp_ttl_minutes"])),
        )
    )
    provider = get_provider()
    await provider.send_sms(
        to=payload.phone,
        body=f"دادنوین — کد تأیید شما:\n{code}\n({int(cfg['otp_ttl_minutes'])} دقیقه معتبر است)",
    )
    await db.commit()
    return {"message": "کد تأیید ارسال شد.", "ttl_minutes": int(cfg["otp_ttl_minutes"])}


@auth_router.post("/register", status_code=201)
async def register(
    payload: RegisterIn, request: Request, response: Response, db: DbDep
) -> AccountMeOut:
    settings = get_settings()
    limiter.check("register", client_key(request), settings.rate_limit_login_per_minute)
    clash = (
        await db.execute(
            select(User.id).where(
                (User.phone == payload.phone) | (User.username == payload.username)
            )
        )
    ).scalar_one_or_none()
    if clash is not None:
        raise HTTPException(
            409,
            {
                "code": "identity_taken",
                "message": "با این شماره یا نام کاربری قبلاً ثبت‌نام شده است؛ وارد شوید.",
            },
        )
    # referral priority: manual code → dn_ref cookie → none (spec §4.2)
    ref_code = payload.ref_code.strip() or request.cookies.get(REF_COOKIE, "")
    referred_profile = None
    if ref_code:
        referred_profile = await ref_svc.resolve_code(db, ref_code)
        if referred_profile is None:
            raise HTTPException(
                400, {"code": "bad_ref", "message": "کد معرف معتبر یا فعال نیست."}
            )
    cfg = await _auth_settings(db)
    if cfg["otp_enabled"]:
        if not payload.otp.strip():
            raise HTTPException(
                422, {"code": "otp_required", "message": "کد تأیید پیامکی الزامی است."}
            )
        if not await _verify_otp(db, payload.phone, payload.otp, "register"):
            raise HTTPException(
                400, {"code": "bad_otp", "message": "کد تأیید نادرست یا منقضی است."}
            )
    user = User(
        username=payload.username,
        phone=payload.phone,
        full_name=payload.full_name.strip(),
        password_hash=hash_password(payload.password),
        referred_code=referred_profile.ref_code if referred_profile else "",
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
        await db.execute(
            select(User).where(
                (User.phone == payload.identifier) | (User.username == payload.identifier)
            )
        )
    ).scalar_one_or_none()
    generic = HTTPException(
        401, {"code": "bad_credentials", "message": "شناسه یا رمز عبور نادرست است."}
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
        created_at=user.created_at,
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


class PanelConsultationIn(BaseModel):
    """Logged-in consultation submit — name/phone come from the account."""
    topic: str = Field(min_length=2, max_length=200)
    message: str = Field(min_length=10, max_length=5000)
    phone: str = Field(default="", max_length=40)  # preferred contact (optional)
    ref_code: str = Field(default="", max_length=24)


def _display_status(row: ConsultationRequest, last_sender: str | None) -> str:
    """Coarse status for the user list: ثبت‌شده / در حال بررسی / پاسخ داده شد / بسته‌شده."""
    if row.status in ("completed", "rejected", "cancelled"):
        return "closed"
    if row.status == "accepted" or last_sender == "staff":
        return "answered"
    if row.status in ("reviewing", "awaiting_call", "followed_up", "consulted"):
        return "reviewing"
    return "submitted"


@router.post("/requests", status_code=201)
async def create_request(
    db: DbDep, user: CurrentUser, payload: PanelConsultationIn, request: Request
) -> dict:
    limiter.check(
        "consult_submit", client_key(request), get_settings().rate_limit_public_post_per_minute
    )
    phone = (payload.phone or user.phone or "").strip()
    code_str = secrets.token_hex(4)
    row = ConsultationRequest(
        tracking_code=await thread_svc.next_tracking_code(db, "consultation"),
        access_code_hash=hash_password(code_str),
        full_name=user.full_name or user.username,
        phone=phone or user.phone,
        email=user.email or "",
        topic=payload.topic.strip(),
        message=payload.message.strip(),
        source_page="/panel",
        user_id=user.id,
        client_ip=client_key(request),
        client_ua=request.headers.get("user-agent", "")[:300],
    )
    db.add(row)
    await db.flush()
    await thread_svc.stamp_sla(db, "consultation", row)
    # referral attribution — form field beats the dn_ref cookie
    code = (payload.ref_code or request.cookies.get(REF_COOKIE, "")).strip().upper()
    if code and await comm_svc.marketing_enabled(db):
        prof = await ref_svc.resolve_code(db, code)
        if prof is not None:
            reason = await ref_svc.attribution_block_reason(
                db, prof, phone=row.phone, user=user, exclude_request_id=row.id
            )
            if reason:
                await thread_svc.add_event(
                    db, "consultation", row.id, "referral_blocked",
                    payload={"reason": reason},
                )
            else:
                await ref_svc.attribute(
                    db, prof, request_type="consultation", request_id=row.id,
                    ip=row.client_ip, ua=row.client_ua,
                )
                row.ref_code = code
                row.referrer_id = prof.id
    await thread_svc.add_event(
        db, "consultation", row.id, "created", payload={"source": "/panel"}
    )
    await db.commit()
    return {"id": str(row.id), "tracking_code": row.tracking_code}


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
    # آخرین فرستندهٔ هر درخواست → نشان «پاسخ جدید» وقتی کارشناس جواب داده
    last_sender: dict[uuid.UUID, str] = {}
    msgs: list[RequestMessage] = []
    if rows:
        msgs = list(
            (
                await db.execute(
                    select(RequestMessage)
                    .where(
                        RequestMessage.request_type == "consultation",
                        RequestMessage.request_id.in_([r.id for r in rows]),
                        RequestMessage.is_note.is_(False),
                    )
                    .order_by(RequestMessage.created_at.desc())
                )
            )
            .scalars()
            .all()
        )
    last_activity: dict[uuid.UUID, datetime] = {}
    for m in msgs:
        last_sender.setdefault(m.request_id, m.sender_type)
        last_activity.setdefault(m.request_id, m.created_at)
    return [
        {
            "id": str(r.id),
            "tracking_code": r.tracking_code,
            "topic": r.topic or r.service_slug,
            "status": r.status,
            "display_status": _display_status(r, last_sender.get(r.id)),
            "created_at": r.created_at.isoformat(),
            "last_activity": last_activity.get(r.id, r.created_at).isoformat(),
            "has_new_reply": last_sender.get(r.id) == "staff",
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
        "display_status": _display_status(
            row, msgs[-1].sender_type if msgs else None
        ),
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
    if row.status in ("completed", "cancelled", "rejected"):
        raise HTTPException(
            409, {"code": "request_closed", "message": "این درخواست بسته شده و امکان پاسخ نیست."}
        )
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
    await _marketing_on(db)
    if not payload.terms:
        raise HTTPException(
            422, {"code": "terms_required", "message": "پذیرش قوانین بازاریابی الزامی است."}
        )
    cfg = await comm_svc.referral_settings(db)
    terms = await comm_svc.terms_view(db)
    app = await ref_svc.apply(
        db,
        user,
        payload.note,
        payload.channel,
        int(cfg.get("reapply_days", 14)),
        terms_version=terms["version"] or payload.terms_version,
    )
    await audit(db, actor=user, action="marketer.apply", entity="marketer_application", entity_id=app.id, request=request)
    await db.commit()
    return {"id": str(app.id), "status": app.status}


@router.get("/marketer")
async def marketer_home(db: DbDep, user: CurrentUser) -> dict:
    await _marketing_on(db)
    prof = await ref_svc.profile_for_user(db, user.id)
    cfg = await comm_svc.referral_settings(db)
    rate_bp, rate_source = await comm_svc.rate_for(db, prof, cfg)
    if prof is None or not prof.is_active:
        app = (
            await db.execute(
                select(MarketerApplication)
                .where(MarketerApplication.user_id == user.id)
                .order_by(MarketerApplication.created_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        out: dict = {
            "status": app.status if app else "none",
            "marketing_enabled": True,
            "my_rate": rate_bp / 100,
        }
        if prof is not None and not prof.is_active:
            out["status"] = "suspended"
        if app is not None and app.status == "rejected":
            out["reject_reason"] = app.review_note
            out["reapply_at"] = (
                aware(app.reviewed_at) + timedelta(days=int(cfg.get("reapply_days", 14)))
            ).date().isoformat() if app.reviewed_at else ""
        if app is not None and app.status == "pending":
            out["applied_at"] = app.created_at.isoformat()
        if app is None or app.status == "rejected":
            out["terms"] = await comm_svc.terms_view(db)
            out["default_rate"] = int(cfg.get("default_rate") or 0)
        return out
    stats = await ref_svc.stats_for(db, prof.id)
    links = await ref_svc.links_for(db, prof)
    now = datetime.now(UTC)
    rules = (
        await db.execute(
            select(CommissionRule)
            .where(
                CommissionRule.is_active.is_(True),
                CommissionRule.kind == "percent",
                or_(
                    CommissionRule.marketer_id.is_(None),
                    CommissionRule.marketer_id == prof.id,
                ),
                or_(
                    CommissionRule.starts_at.is_(None),
                    CommissionRule.starts_at <= now,
                ),
                or_(
                    CommissionRule.ends_at.is_(None),
                    CommissionRule.ends_at >= now,
                ),
            )
            .order_by(CommissionRule.tier_min.desc())
        )
    ).scalars().all()
    return {
        "status": "approved",
        "ref_code": prof.ref_code,
        "ref_link": f"/r/{prof.ref_code}",
        "is_active": prof.is_active,
        "marketing_enabled": True,
        "my_rate": rate_bp / 100,
        "rate_source": rate_source,
        "accepted_terms_version": prof.accepted_terms_version,
        "cookie_days": int(cfg.get("cookie_days", 30)),
        "stats": stats,
        "links": links,
        "iban_masked": _iban_masked(prof),
        "rules": [
            {
                "kind": r.kind,
                "value": r.value,
                "tier_min": r.tier_min,
                "own": r.marketer_id == prof.id,
            }
            for r in rules
        ],
    }


def _iban_masked(prof) -> str:
    raw = decrypt_field(prof.iban_enc) if prof.iban_enc else ""
    return mask_digits(raw) if raw else ""


class LinkIn(BaseModel):
    label: str = Field(min_length=2, max_length=40)


@router.get("/marketer/links")
async def marketer_links(db: DbDep, user: CurrentUser) -> list[dict]:
    await _marketing_on(db)
    prof = await ref_svc.profile_for_user(db, user.id)
    if prof is None:
        raise HTTPException(403, {"code": "not_marketer", "message": "حساب بازاریاب نیستید."})
    return await ref_svc.links_for(db, prof)


@router.post("/marketer/links", status_code=201)
async def marketer_link_create(db: DbDep, user: CurrentUser, payload: LinkIn) -> dict:
    await _marketing_on(db)
    prof = await ref_svc.profile_for_user(db, user.id)
    if prof is None:
        raise HTTPException(403, {"code": "not_marketer", "message": "حساب بازاریاب نیستید."})
    link = await ref_svc.link_or_404(db, prof.id, payload.label)
    await db.commit()
    return {"id": str(link.id), "label": link.label, "url": f"/r/{prof.ref_code}?src={link.label}"}


@router.delete("/marketer/links/{link_id}", status_code=204)
async def marketer_link_delete(db: DbDep, user: CurrentUser, link_id: uuid.UUID) -> Response:
    await _marketing_on(db)
    prof = await ref_svc.profile_for_user(db, user.id)
    if prof is None:
        raise HTTPException(403, {"code": "not_marketer", "message": "حساب بازاریاب نیستید."})
    await ref_svc.delete_link(db, prof.id, link_id)
    await db.commit()
    return Response(status_code=204)


@router.get("/marketer/qr")
async def marketer_qr(
    db: DbDep, user: CurrentUser, src: Annotated[str, Query(max_length=40)] = ""
) -> Response:
    """QR of the marketer's link — segno renders a crisp SVG, no JS needed."""
    import io

    import segno

    await _marketing_on(db)
    prof = await ref_svc.profile_for_user(db, user.id)
    if prof is None:
        raise HTTPException(403, {"code": "not_marketer", "message": "حساب بازاریاب نیستید."})
    label = ref_svc.normalize_label(src)
    url = f"{get_settings().public_base_url}/r/{prof.ref_code}" + (
        f"?src={label}" if label else ""
    )
    buf = io.BytesIO()
    segno.make(url, error="m").save(buf, kind="svg", scale=6, border=2, dark="#0e1a3a")
    return Response(buf.getvalue(), media_type="image/svg+xml")


@router.get("/marketer/referrals")
async def marketer_referrals(db: DbDep, user: CurrentUser) -> list[dict]:
    """PRIVACY-SAFE list — masked name, coarse status, dates only.

    Never includes topic/message/documents — the marketer must not see
    any case details.
    """
    await _marketing_on(db)
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
    await _marketing_on(db)
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


# ─── commissions (append-only ledger — no wallet, manual settlement) ───


@router.get("/commissions")
async def my_commissions(db: DbDep, user: CurrentUser) -> dict:
    """Own commissions only — strict whitelist fields, never any case detail.

    A marketer learns: masked referred name, coarse stage, the office's
    received fee, their own rate, their commission, status, dates. Subject,
    claim amount, parties, phone and tracking stay invisible.
    """
    await _marketing_on(db)
    prof = await ref_svc.profile_for_user(db, user.id)
    if prof is None:
        raise HTTPException(403, {"code": "not_marketer", "message": "حساب بازاریاب نیستید."})
    rows = (
        await db.execute(
            select(Commission)
            .where(Commission.marketer_id == prof.id)
            .order_by(Commission.created_at.desc())
            .limit(200)
        )
    ).scalars().all()
    consults = {
        str(c.id): c
        for c in (
            await db.execute(
                select(ConsultationRequest).where(
                    ConsultationRequest.id.in_(
                        [r.request_id for r in rows] or [uuid.uuid4()]
                    )
                )
            )
        ).scalars().all()
    }
    items = []
    for r in rows:
        consult = consults.get(str(r.request_id))
        items.append(
            comm_svc.marketer_commission_row(
                r,
                comm_svc.mask_name(consult.full_name if consult else ""),
                comm_svc._STAGE_FA.get(consult.status if consult else "", "—"),
            )
        )
    cfg = await comm_svc.referral_settings(db)
    return {
        "items": items,
        "totals": comm_svc.net_totals(rows),
        "marketing_enabled": bool(cfg.get("marketing_enabled")),
    }


