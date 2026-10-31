"""Public account endpoints — register/login/reset, my requests, marketer, commissions."""

import hashlib
import re
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ...ai.render import sanitize_display_text
from ...core.config import get_settings
from ...core.rate_limit import client_key, limiter
from ...db.session import get_db
from ...models.account import (
    CaseFeeReceipt,
    InboxNotification,
    MarketerApplication,
    OtpToken,
    PasswordResetToken,
    Payout,
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
from ...security.vault import (
    decrypt_field,
    encrypt_field,
    iban_ok,
    luhn_ok,
    mask_digits,
    mask_iban,
    normalize_card,
    normalize_iban,
)
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
        raise HTTPException(
            500, {"code": "no_role", "message": "نقش در سیستم تعریف نشده است."}
        )
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
        (
            await db.execute(
                select(ConsultationRequest).where(
                    ConsultationRequest.phone == user.phone,
                    ConsultationRequest.user_id.is_(None),
                )
            )
        )
        .scalars()
        .all()
    )
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
        db,
        user,
        ip=client_key(request),
        user_agent=request.headers.get("user-agent", "")[:300],
    )
    _set_session_cookie(response, settings, token)
    await audit(
        db,
        actor=user,
        action="account.register",
        entity="user",
        entity_id=user.id,
        request=request,
    )
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
                (User.phone == payload.identifier)
                | (User.username == payload.identifier)
            )
        )
    ).scalar_one_or_none()
    generic = HTTPException(
        401, {"code": "bad_credentials", "message": "شناسه یا رمز عبور نادرست است."}
    )
    if (
        user is None
        or not user.is_active
        or not verify_password(payload.password, user.password_hash)
    ):
        raise generic
    await _link_prior_requests(db, user)
    session, token = await create_session(
        db,
        user,
        ip=client_key(request),
        user_agent=request.headers.get("user-agent", "")[:300],
    )
    _set_session_cookie(response, settings, token)
    await audit(
        db,
        actor=user,
        action="account.login",
        entity="session",
        entity_id=session.id,
        request=request,
    )
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
    limiter.check(
        "reset", client_key(request), get_settings().rate_limit_login_per_minute
    )
    token_hash = hashlib.sha256(payload.token.encode()).hexdigest()
    row = (
        await db.execute(
            select(PasswordResetToken).where(
                PasswordResetToken.token_hash == token_hash
            )
        )
    ).scalar_one_or_none()
    if row is None or row.used_at is not None or aware(row.expires_at) < utcnow():
        raise HTTPException(
            400, {"code": "bad_token", "message": "کد نامعتبر یا منقضی است."}
        )
    user = await db.get(User, row.user_id)
    if user is None:
        raise HTTPException(400, {"code": "bad_token", "message": "کد نامعتبر است."})
    user.password_hash = hash_password(payload.password)
    row.used_at = datetime.now(UTC)
    # revoke all existing sessions for safety
    sessions = (
        (await db.execute(select(Session).where(Session.user_id == user.id)))
        .scalars()
        .all()
    )
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
async def patch_me(
    db: DbDep, user: CurrentUser, payload: ProfilePatchIn
) -> AccountMeOut:
    if payload.full_name:
        user.full_name = payload.full_name.strip()
    if payload.phone and payload.phone != user.phone:
        clash = (
            await db.execute(select(User.id).where(User.phone == payload.phone))
        ).scalar_one_or_none()
        if clash is not None:
            raise HTTPException(
                409, {"code": "phone_taken", "message": "این شماره قبلاً ثبت شده است."}
            )
        user.phone = payload.phone
        user.username = payload.phone
        await _link_prior_requests(db, user)
    await db.commit()
    return await _me_out(db, user)


@router.post("/password")
async def change_password(
    db: DbDep, user: CurrentUser, payload: PasswordChangeIn
) -> dict:
    if not verify_password(payload.current, user.password_hash):
        raise HTTPException(
            400, {"code": "bad_password", "message": "رمز فعلی نادرست است."}
        )
    user.password_hash = hash_password(payload.new)
    await db.commit()
    return {"message": "رمز عبور تغییر کرد."}


# ─── my requests ────────────────────────────────────────────────────


async def _own_request(
    db: AsyncSession, user: User, request_id: uuid.UUID
) -> ConsultationRequest:
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
    # «نام من و وضعیت قرارداد، برای معرف نمایش داده می‌شود» — required for
    # the referral to create commission/name exposure
    ref_consent: bool = False


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
        "consult_submit",
        client_key(request),
        get_settings().rate_limit_public_post_per_minute,
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
                    db,
                    "consultation",
                    row.id,
                    "referral_blocked",
                    payload={"reason": reason},
                )
            else:
                await ref_svc.attribute(
                    db,
                    prof,
                    request_type="consultation",
                    request_id=row.id,
                    ip=row.client_ip,
                    ua=row.client_ua,
                    consent=payload.ref_consent,
                    channel=request.cookies.get("dn_src", ""),
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
        (
            await db.execute(
                select(ConsultationRequest)
                .where(ConsultationRequest.user_id == user.id)
                .order_by(ConsultationRequest.created_at.desc())
                .limit(100)
            )
        )
        .scalars()
        .all()
    )
    # also include still-unlinked requests sharing this phone (pending claim)
    unlinked = (
        (
            await db.execute(
                select(ConsultationRequest).where(
                    ConsultationRequest.phone == user.phone,
                    ConsultationRequest.user_id.is_(None),
                )
            )
        )
        .scalars()
        .all()
    )
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
async def my_request_detail(
    db: DbDep, user: CurrentUser, request_id: uuid.UUID
) -> dict:
    row = await _own_request(db, user, request_id)
    msgs = (
        (
            await db.execute(
                select(RequestMessage)
                .where(
                    RequestMessage.request_type == "consultation",
                    RequestMessage.request_id == row.id,
                    RequestMessage.is_note.is_(False),
                )
                .order_by(RequestMessage.created_at)
            )
        )
        .scalars()
        .all()
    )
    events = (
        (
            await db.execute(
                select(RequestEvent)
                .where(
                    RequestEvent.request_type == "consultation",
                    RequestEvent.request_id == row.id,
                    RequestEvent.event_type == "status_change",
                )
                .order_by(RequestEvent.created_at)
            )
        )
        .scalars()
        .all()
    )
    return {
        "id": str(row.id),
        "tracking_code": row.tracking_code,
        "topic": row.topic or row.service_slug,
        "status": row.status,
        "display_status": _display_status(row, msgs[-1].sender_type if msgs else None),
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
                "body": sanitize_display_text(m.body),
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
            409,
            {
                "code": "request_closed",
                "message": "این درخواست بسته شده و امکان پاسخ نیست.",
            },
        )
    body = str(payload.get("body", "")).strip()
    if not body or len(body) > 4000:
        raise HTTPException(
            400, {"code": "bad_body", "message": "متن پاسخ معتبر نیست."}
        )
    msg = await thread_svc.add_message(
        db, "consultation", row.id, sender_type="customer", sender_id=user.id, body=body
    )
    await thread_svc.add_event(
        db,
        "consultation",
        row.id,
        "customer_reply",
        payload={"message_id": str(msg.id)},
    )
    await db.commit()
    return {"id": str(msg.id)}


# ─── notifications ──────────────────────────────────────────────────


@router.get("/notifications")
async def my_notifications(db: DbDep, user: CurrentUser) -> list[dict]:
    rows = (
        (
            await db.execute(
                select(InboxNotification)
                .where(InboxNotification.user_id == user.id)
                .order_by(InboxNotification.created_at.desc())
                .limit(50)
            )
        )
        .scalars()
        .all()
    )
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
            422,
            {"code": "terms_required", "message": "پذیرش قوانین بازاریابی الزامی است."},
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
    await audit(
        db,
        actor=user,
        action="marketer.apply",
        entity="marketer_application",
        entity_id=app.id,
        request=request,
    )
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
                (
                    aware(app.reviewed_at)
                    + timedelta(days=int(cfg.get("reapply_days", 14)))
                )
                .date()
                .isoformat()
                if app.reviewed_at
                else ""
            )
        if app is not None and app.status == "pending":
            out["applied_at"] = app.created_at.isoformat()
        if app is None or app.status == "rejected":
            out["terms"] = await comm_svc.terms_view(db)
            out["default_rate"] = int(cfg.get("default_rate") or 0)
        return out
    stats = await ref_svc.stats_for(db, prof.id)
    stats["channels"] = await ref_svc.channel_stats_for(db, prof)
    links = await ref_svc.links_for(db, prof)
    payable = await comm_svc.payable_balance(db, prof.id)
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
        "payable": payable,
        "bank": _bank_out(prof),
        "terms": await comm_svc.terms_view(db),
    }


def _bank_out(prof) -> dict:
    """Masked bank coordinates for the account page — never raw digits."""
    iban = decrypt_field(prof.iban_enc) if prof.iban_enc else ""
    card = decrypt_field(prof.card_enc) if prof.card_enc else ""
    return {
        "account_name": decrypt_field(prof.account_name_enc)
        if prof.account_name_enc
        else "",
        "iban_masked": mask_iban(iban) if iban else "",
        "card_masked": mask_digits(card) if card else "",
        "has_bank": bool(iban or card),
        "payout_hold_until": prof.payout_hold_until.isoformat()
        if prof.payout_hold_until
        else None,
    }


class LinkIn(BaseModel):
    channel: str = Field(min_length=2, max_length=20)


@router.get("/marketer/links")
async def marketer_links(db: DbDep, user: CurrentUser) -> list[dict]:
    await _marketing_on(db)
    prof = await ref_svc.profile_for_user(db, user.id)
    if prof is None:
        raise HTTPException(
            403, {"code": "not_marketer", "message": "حساب بازاریاب نیستید."}
        )
    return await ref_svc.links_for(db, prof)


@router.post("/marketer/links", status_code=201)
async def marketer_link_create(db: DbDep, user: CurrentUser, payload: LinkIn) -> dict:
    """Build a channel link — `channel` must be whitelisted (instagram,
    telegram, whatsapp, website, email, other)."""
    await _marketing_on(db)
    prof = await ref_svc.profile_for_user(db, user.id)
    if prof is None:
        raise HTTPException(
            403, {"code": "not_marketer", "message": "حساب بازاریاب نیستید."}
        )
    link = await ref_svc.link_or_404(db, prof.id, payload.channel)
    await db.commit()
    return {"channel": link.label, "url": f"/r/{prof.ref_code}?s={link.label}"}


@router.delete("/marketer/links/{channel}", status_code=204)
async def marketer_link_delete(db: DbDep, user: CurrentUser, channel: str) -> Response:
    await _marketing_on(db)
    prof = await ref_svc.profile_for_user(db, user.id)
    if prof is None:
        raise HTTPException(
            403, {"code": "not_marketer", "message": "حساب بازاریاب نیستید."}
        )
    await ref_svc.delete_channel_link(db, prof.id, channel)
    await db.commit()
    return Response(status_code=204)


def _ref_url(prof, channel: str = "") -> str:
    """QR/link URL — only our own domain, never user-supplied hosts."""
    url = f"{get_settings().public_base_url}/r/{prof.ref_code}"
    ch = ref_svc.normalize_channel(channel)
    return f"{url}?s={ch}" if ch else url


@router.get("/marketer/qr.png")
async def marketer_qr_png(
    db: DbDep, user: CurrentUser, s: Annotated[str, Query(max_length=20)] = ""
) -> Response:
    """QR PNG — error-correction Q, 4-module quiet zone, own-domain URL only."""
    import io

    from ...services import cards

    await _marketing_on(db)
    prof = await ref_svc.profile_for_user(db, user.id)
    if prof is None:
        raise HTTPException(
            403, {"code": "not_marketer", "message": "حساب بازاریاب نیستید."}
        )
    buf = io.BytesIO()
    cards.qr_png(_ref_url(prof, s), buf)
    return Response(
        buf.getvalue(),
        media_type="image/png",
        headers={"Content-Disposition": 'inline; filename="qr.png"'},
    )


@router.get("/marketer/qr.pdf")
async def marketer_qr_pdf(
    db: DbDep, user: CurrentUser, s: Annotated[str, Query(max_length=20)] = ""
) -> Response:
    import io

    from ...services import cards

    await _marketing_on(db)
    prof = await ref_svc.profile_for_user(db, user.id)
    if prof is None:
        raise HTTPException(
            403, {"code": "not_marketer", "message": "حساب بازاریاب نیستید."}
        )
    buf = io.BytesIO()
    cards.qr_pdf(_ref_url(prof, s), buf)
    return Response(
        buf.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="dadnovin-qr.pdf"'},
    )


@router.get("/marketer/card.png")
async def marketer_card_png(db: DbDep, user: CurrentUser) -> Response:
    """Downloadable silver referral card — matte metal, QR tile, ~300 DPI."""
    import io

    from ...services import cards

    await _marketing_on(db)
    prof = await ref_svc.profile_for_user(db, user.id)
    if prof is None:
        raise HTTPException(
            403, {"code": "not_marketer", "message": "حساب بازاریاب نیستید."}
        )
    buf = io.BytesIO()
    await cards.card_png(db, prof, user, _ref_url(prof), buf)
    return Response(
        buf.getvalue(),
        media_type="image/png",
        headers={"Content-Disposition": 'attachment; filename="dadnovin-card.png"'},
    )


@router.get("/marketer/card.pdf")
async def marketer_card_pdf(db: DbDep, user: CurrentUser) -> Response:
    import io

    from ...services import cards

    await _marketing_on(db)
    prof = await ref_svc.profile_for_user(db, user.id)
    if prof is None:
        raise HTTPException(
            403, {"code": "not_marketer", "message": "حساب بازاریاب نیستید."}
        )
    buf = io.BytesIO()
    await cards.card_pdf(db, prof, user, _ref_url(prof), buf)
    return Response(
        buf.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="dadnovin-card.pdf"'},
    )


@router.get("/marketer/referrals")
async def marketer_referrals(db: DbDep, user: CurrentUser) -> list[dict]:
    """PRIVACY-SAFE whitelist — name (consented only), contract status,
    related office fee, own rate, own commission, dates.

    Never includes subject/dispute type/parties/claim/descriptions/
    documents/phone — the marketer must learn nothing about the case itself.
    """
    await _marketing_on(db)
    prof = await ref_svc.profile_for_user(db, user.id)
    if prof is None:
        return []
    attrs = (
        (
            await db.execute(
                select(ReferralAttribution)
                .where(ReferralAttribution.marketer_id == prof.id)
                .order_by(ReferralAttribution.created_at.desc())
                .limit(200)
            )
        )
        .scalars()
        .all()
    )
    consults = {
        str(c.id): c
        for c in (
            await db.execute(
                select(ConsultationRequest).where(
                    ConsultationRequest.id.in_(
                        [
                            a.request_id
                            for a in attrs
                            if a.request_type == "consultation"
                        ]
                        or [uuid.uuid4()]
                    )
                )
            )
        )
        .scalars()
        .all()
    }
    req_ids = [a.request_id for a in attrs if a.request_type == "consultation"] or [
        uuid.uuid4()
    ]
    receipts = {
        rid: total
        for rid, total in (
            await db.execute(
                select(
                    CaseFeeReceipt.request_id,
                    func.sum(CaseFeeReceipt.amount),
                )
                .where(CaseFeeReceipt.request_id.in_(req_ids))
                .group_by(CaseFeeReceipt.request_id)
            )
        ).all()
    }
    comms = {
        (c.request_id, c.referral_id): c
        for c in (
            await db.execute(
                select(Commission).where(
                    Commission.marketer_id == prof.id,
                    Commission.entry_type == "accrual",
                )
            )
        )
        .scalars()
        .all()
    }
    out = []
    for a in attrs:
        row = (
            consults.get(str(a.request_id))
            if a.request_type == "consultation"
            else None
        )
        consented = a.consent_at is not None
        comm = comms.get((a.request_id, a.id))
        out.append(
            {
                "id": str(a.id),
                "consent": consented,
                "full_name": (row.full_name if row else "") if consented else None,
                "name": (row.full_name if row else "")
                if consented
                else comm_svc.mask_name(row.full_name if row else ""),
                "contract_status": comm_svc.contract_status(row.status if row else ""),
                "fee_amount": receipts.get(a.request_id, 0) if consented else 0,
                "rate": comm.rate_bp / 100
                if comm
                else (await comm_svc.rate_for(db, prof))[0] / 100,
                "commission_amount": comm.amount if comm else None,
                "commission_status": comm.status if comm else "",
                "channel": a.channel,
                "created_at": a.created_at.isoformat(),
            }
        )
    return out


class BankUpdateIn(BaseModel):
    account_name: str = Field(default="", max_length=120)
    card_number: str = Field(default="", max_length=19)
    iban: str = Field(default="", max_length=34)


@router.get("/marketer/bank")
async def marketer_bank_get(db: DbDep, user: CurrentUser) -> dict:
    """Masked coordinates only — raw digits never leave the server."""
    await _marketing_on(db)
    prof = await ref_svc.profile_for_user(db, user.id)
    if prof is None:
        raise HTTPException(
            403, {"code": "not_marketer", "message": "حساب بازاریاب نیستید."}
        )
    return _bank_out(prof)


@router.put("/marketer/bank")
@router.post("/marketer/bank")
async def marketer_bank(
    db: DbDep, user: CurrentUser, payload: BankUpdateIn, request: Request
) -> dict:
    """Save payout coordinates — Luhn-checked card, mod-97 Sheba, AES-256-GCM
    at rest. Any change starts a 24h hold before the next payout + an audit
    row + an inbox notification."""
    await _marketing_on(db)
    prof = await ref_svc.profile_for_user(db, user.id)
    if prof is None:
        raise HTTPException(
            403, {"code": "not_marketer", "message": "حساب بازاریاب نیستید."}
        )
    card = normalize_card(payload.card_number)
    iban = normalize_iban(payload.iban)
    if card and not luhn_ok(card):
        raise HTTPException(
            400, {"code": "bad_card", "message": "شماره کارت معتبر نیست."}
        )
    if iban and not iban_ok(iban):
        raise HTTPException(
            400, {"code": "bad_iban", "message": "شماره شبا معتبر نیست."}
        )
    name = payload.account_name.strip()
    if not name:
        raise HTTPException(
            422, {"code": "name_required", "message": "نام صاحب حساب الزامی است."}
        )
    if not card and not iban:
        raise HTTPException(
            422,
            {
                "code": "bank_required",
                "message": "حداقل یکی از شماره کارت یا شبا الزامی است.",
            },
        )
    now = datetime.now(UTC)
    changed = (
        decrypt_field(prof.iban_enc) != iban
        or decrypt_field(prof.card_enc) != card
        or decrypt_field(prof.account_name_enc) != name
    )
    prof.account_name_enc = encrypt_field(name)
    prof.iban_enc = encrypt_field(iban)
    prof.card_enc = encrypt_field(card)
    if changed:
        prof.bank_updated_at = now
        prof.payout_hold_until = now + comm_svc.BANK_CHANGE_HOLD
        db.add(
            InboxNotification(
                user_id=user.id,
                title="اطلاعات بانکی به‌روز شد",
                body="برای امنیت، اولین پرداخت به حساب جدید تا ۲۴ ساعت ممکن نیست.",
                kind="bank",
                link="/panel/marketing",
            )
        )
    await audit(
        db,
        actor=user,
        action="account.bank_update",
        entity="marketer_profile",
        entity_id=prof.id,
        request=request,
        after={"changed": changed},
    )
    await db.commit()
    return {"message": "اطلاعات بانکی ذخیره شد.", "bank": _bank_out(prof)}


# ─── payouts (marketer sees own settlements + receipts) ─────────────


@router.get("/payments")
@router.get("/marketer/payouts")
async def marketer_payouts(db: DbDep, user: CurrentUser) -> dict:
    await _marketing_on(db)
    prof = await ref_svc.profile_for_user(db, user.id)
    if prof is None:
        raise HTTPException(
            403, {"code": "not_marketer", "message": "حساب بازاریاب نیستید."}
        )
    rows = (
        (
            await db.execute(
                select(Payout)
                .where(Payout.marketer_id == prof.id)
                .order_by(Payout.paid_at.desc())
                .limit(100)
            )
        )
        .scalars()
        .all()
    )
    return {
        "payable": await comm_svc.payable_balance(db, prof.id),
        "items": [
            {
                "id": str(p.id),
                "amount": p.amount,
                "paid_at": p.paid_at.isoformat(),
                "tracking_ref": p.tracking_ref,
                "note": p.note,
                "has_receipt": p.file_id is not None,
                "receipt_url": f"/api/v1/account/payments/{p.id}/receipt"
                if p.file_id
                else None,
            }
            for p in rows
        ],
    }


@router.get("/payments/{payout_id}/receipt")
@router.get("/marketer/payouts/{payout_id}/receipt")
async def marketer_payout_receipt(
    db: DbDep, user: CurrentUser, payout_id: uuid.UUID
) -> Response:
    """Download the settlement receipt — own payouts only, auth-gated."""
    from ...services import media as media_svc

    await _marketing_on(db)
    prof = await ref_svc.profile_for_user(db, user.id)
    if prof is None:
        raise HTTPException(
            403, {"code": "not_marketer", "message": "حساب بازاریاب نیستید."}
        )
    payout = await db.get(Payout, payout_id)
    if payout is None or payout.marketer_id != prof.id or payout.file_id is None:
        raise HTTPException(404, {"code": "not_found", "message": "فیش یافت نشد."})
    return await media_svc.file_response(db, payout.file_id)


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
        raise HTTPException(
            403, {"code": "not_marketer", "message": "حساب بازاریاب نیستید."}
        )
    rows = (
        (
            await db.execute(
                select(Commission)
                .where(Commission.marketer_id == prof.id)
                .order_by(Commission.created_at.desc())
                .limit(200)
            )
        )
        .scalars()
        .all()
    )
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
        )
        .scalars()
        .all()
    }
    attrs = {
        a.id: a
        for a in (
            await db.execute(
                select(ReferralAttribution).where(
                    ReferralAttribution.id.in_(
                        [r.referral_id for r in rows if r.referral_id] or [uuid.uuid4()]
                    )
                )
            )
        )
        .scalars()
        .all()
    }
    items = []
    for r in rows:
        consult = consults.get(str(r.request_id))
        consented = bool(
            r.referral_id and r.referral_id in attrs and attrs[r.referral_id].consent_at
        )
        items.append(
            comm_svc.marketer_commission_row(
                r,
                (consult.full_name if consult else "")
                if consented
                else comm_svc.mask_name(""),
                comm_svc.contract_status(consult.status if consult else ""),
            )
        )
    cfg = await comm_svc.referral_settings(db)
    return {
        "items": items,
        "totals": comm_svc.net_totals(rows),
        "marketing_enabled": bool(cfg.get("marketing_enabled")),
    }
