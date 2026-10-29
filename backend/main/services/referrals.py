"""Referral codes, marketer applications, attribution and anti-fraud rules."""

import hashlib
import re
import secrets
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.account import (
    MarketerApplication,
    MarketerProfile,
    ReferralAttribution,
    ReferralClick,
    ReferralLink,
)
from ..models.consultation import ConsultationRequest
from ..models.user import Role, User
from ..db.base import aware
from ..utils.phone import normalize_phone

CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # no 0/O/1/I — read over phone

# click-attack heuristics — the same visitor hammering a link in 24h
CLICK_FLOOD_WINDOW = timedelta(hours=24)
CLICK_FLOOD_THRESHOLD = 20
LABEL_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,39}$")


def visitor_hash(ip: str, ua: str) -> str:
    return hashlib.sha256(f"{ip}|{ua}".encode()).hexdigest()


def gen_ref_code() -> str:
    return "DN-" + "".join(secrets.choice(CODE_ALPHABET) for _ in range(6))


async def apply(
    db: AsyncSession, user: User, note: str, channel: str = "", reapply_days: int = 14
) -> MarketerApplication:
    """One pending application per user; re-apply allowed after `reapply_days`."""
    latest = (
        await db.execute(
            select(MarketerApplication)
            .where(MarketerApplication.user_id == user.id)
            .order_by(MarketerApplication.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if latest is not None and latest.status == "pending":
        raise HTTPException(
            409, {"code": "already_pending", "message": "درخواست بازاریابی شما در انتظار بررسی است."}
        )
    if latest is not None and latest.status == "rejected" and latest.reviewed_at:
        unlock = aware(latest.reviewed_at) + timedelta(days=reapply_days)
        if unlock > datetime.now(UTC):
            raise HTTPException(
                429,
                {
                    "code": "reapply_too_soon",
                    "message": f"امکان ثبت درخواست مجدد از {unlock.date().isoformat()} فعال می‌شود.",
                },
            )
    prof = await profile_for_user(db, user.id)
    if prof is not None:
        raise HTTPException(
            409, {"code": "already_marketer", "message": "حساب شما هم‌اکنون بازاریاب است."}
        )
    app = MarketerApplication(
        user_id=user.id, note=note.strip(), channel=channel.strip()[:200], accepted_terms=True
    )
    db.add(app)
    await db.flush()
    return app


async def profile_for_user(db: AsyncSession, user_id: uuid.UUID) -> MarketerProfile | None:
    return (
        await db.execute(
            select(MarketerProfile).where(MarketerProfile.user_id == user_id)
        )
    ).scalar_one_or_none()


async def approve(
    db: AsyncSession, app: MarketerApplication, admin: User, note: str
) -> MarketerProfile:
    """Approve → create profile with a unique ref code + grant `marketer` role."""
    if app.status != "pending":
        raise HTTPException(409, {"code": "already_reviewed", "message": "قبلاً بررسی شده است."})
    user = await db.get(User, app.user_id)
    if user is None:
        raise HTTPException(404, {"code": "user_gone", "message": "کاربر یافت نشد."})
    for _ in range(20):
        code = gen_ref_code()
        clash = (
            await db.execute(
                select(MarketerProfile.id).where(MarketerProfile.ref_code == code)
            )
        ).scalar_one_or_none()
        if clash is None:
            break
    else:  # pragma: no cover
        raise HTTPException(500, {"code": "code_gen", "message": "خطا در تولید کد ارجاع."})
    prof = MarketerProfile(user_id=user.id, ref_code=code, approved_by=admin.id)
    db.add(prof)
    role = (
        await db.execute(select(Role).where(Role.name == "marketer"))
    ).scalar_one_or_none()
    if role is not None and role not in user.roles:
        user.roles.append(role)
    app.status = "approved"
    app.reviewed_by = admin.id
    app.reviewed_at = datetime.now(UTC)
    app.review_note = note.strip()
    await db.flush()
    return prof


async def reject(
    db: AsyncSession, app: MarketerApplication, admin: User, note: str
) -> MarketerApplication:
    if app.status != "pending":
        raise HTTPException(409, {"code": "already_reviewed", "message": "قبلاً بررسی شده است."})
    app.status = "rejected"
    app.reviewed_by = admin.id
    app.reviewed_at = datetime.now(UTC)
    app.review_note = note.strip()
    await db.flush()
    return app


async def resolve_code(db: AsyncSession, code: str) -> MarketerProfile | None:
    code = code.strip().upper()
    if not code:
        return None
    prof = (
        await db.execute(
            select(MarketerProfile).where(MarketerProfile.ref_code == code)
        )
    ).scalar_one_or_none()
    return prof if prof is not None and prof.is_active else None


def normalize_label(label: str) -> str:
    label = (label or "").strip().lower()[:40]
    return label if LABEL_RE.match(label) else ""


async def record_click(
    db: AsyncSession,
    code: str,
    *,
    ip: str,
    ua: str,
    path: str,
    label: str = "",
) -> ReferralClick:
    """Store a click; flag obvious floods so stats stay honest."""
    code = code.strip().upper()
    label = normalize_label(label)
    vh = visitor_hash(ip, ua)
    window_start = datetime.now(UTC) - CLICK_FLOOD_WINDOW
    recent_same_visitor = (
        await db.execute(
            select(func.count(ReferralClick.id)).where(
                ReferralClick.ref_code == code,
                ReferralClick.visitor_hash == vh,
                ReferralClick.created_at >= window_start,
            )
        )
    ).scalar_one()
    suspicious = recent_same_visitor >= CLICK_FLOOD_THRESHOLD
    click = ReferralClick(
        ref_code=code,
        link_label=label,
        ip=ip[:45],
        user_agent=ua[:300],
        visitor_hash=vh,
        landing_path=path[:200] or "/",
        suspicious=suspicious,
        suspicious_reason="click_flood" if suspicious else "",
    )
    db.add(click)
    await db.flush()
    return click


async def link_or_404(db: AsyncSession, marketer_id: uuid.UUID, label: str) -> ReferralLink:
    label = normalize_label(label)
    if not label:
        raise HTTPException(400, {"code": "bad_label", "message": "برچسب نامعتبر است."})
    row = (
        await db.execute(
            select(ReferralLink).where(
                ReferralLink.marketer_id == marketer_id,
                ReferralLink.label == label,
            )
        )
    ).scalar_one_or_none()
    if row is not None:
        return row
    row = ReferralLink(marketer_id=marketer_id, label=label)
    db.add(row)
    await db.flush()
    return row


async def links_for(
    db: AsyncSession, profile: MarketerProfile
) -> list[dict]:
    """Labeled links + per-link click stats (raw vs unique visitors)."""
    rows = (
        await db.execute(
            select(ReferralLink)
            .where(ReferralLink.marketer_id == profile.id)
            .order_by(ReferralLink.created_at)
        )
    ).scalars().all()
    out = []
    for link in rows:
        base = select(func.count(ReferralClick.id)).where(
            ReferralClick.ref_code == profile.ref_code,
            ReferralClick.link_label == link.label,
            ReferralClick.suspicious.is_(False),
        )
        raw = (await db.execute(base)).scalar_one()
        unique = (
            await db.execute(
                select(func.count(func.distinct(ReferralClick.visitor_hash))).where(
                    ReferralClick.ref_code == profile.ref_code,
                    ReferralClick.link_label == link.label,
                    ReferralClick.suspicious.is_(False),
                )
            )
        ).scalar_one()
        out.append(
            {
                "id": str(link.id),
                "label": link.label,
                "clicks": raw,
                "unique_clicks": unique,
                "url": f"/r/{profile.ref_code}?src={link.label}",
            }
        )
    return out


async def delete_link(db: AsyncSession, marketer_id: uuid.UUID, link_id: uuid.UUID) -> None:
    row = (
        await db.execute(
            select(ReferralLink).where(
                ReferralLink.id == link_id,
                ReferralLink.marketer_id == marketer_id,
            )
        )
    ).scalar_one_or_none()
    if row is not None:
        await db.delete(row)
        await db.flush()


async def attribution_block_reason(
    db: AsyncSession,
    profile: MarketerProfile,
    *,
    phone: str,
    user: User | None,
    exclude_request_id: uuid.UUID | None = None,
) -> str | None:
    """Return why this referral must NOT be attributed, else None.

    Anti-fraud: self-referral (same user or same phone) and "not a new
    client" (phone already has a prior request) are rejected.
    """
    phone = normalize_phone(phone)
    if user is not None and user.id == profile.user_id:
        return "self_referral"
    marketer_user = await db.get(User, profile.user_id)
    if marketer_user is not None and marketer_user.phone and normalize_phone(
        marketer_user.phone
    ) == phone:
        return "self_referral"
    prior_q = select(func.count(ConsultationRequest.id)).where(
        ConsultationRequest.phone == phone
    )
    if exclude_request_id is not None:
        prior_q = prior_q.where(ConsultationRequest.id != exclude_request_id)
    prior = (await db.execute(prior_q)).scalar_one()
    if prior:
        return "not_new_client"
    return None


async def attribute(
    db: AsyncSession,
    profile: MarketerProfile,
    *,
    request_type: str,
    request_id: uuid.UUID,
    ip: str,
    ua: str,
) -> ReferralAttribution:
    """Immutable attribution — unique per request."""
    attr = ReferralAttribution(
        marketer_id=profile.id,
        request_type=request_type,
        request_id=request_id,
        ref_code=profile.ref_code,
        ip=ip[:45],
        user_agent=ua[:300],
    )
    db.add(attr)
    await db.flush()
    return attr


async def stats_for(db: AsyncSession, marketer_id: uuid.UUID) -> dict:
    """Clicks (raw/unique) / attributed / accepted for the marketer dashboard."""
    profile = await db.get(MarketerProfile, marketer_id)
    code = profile.ref_code if profile else ""
    clean = select(ReferralClick).where(
        ReferralClick.ref_code == code, ReferralClick.suspicious.is_(False)
    )
    clicks = (
        await db.execute(select(func.count()).select_from(clean.subquery()))
    ).scalar_one()
    unique_clicks = (
        await db.execute(
            select(func.count(func.distinct(ReferralClick.visitor_hash))).where(
                ReferralClick.ref_code == code,
                ReferralClick.suspicious.is_(False),
            )
        )
    ).scalar_one()
    suspicious = (
        await db.execute(
            select(func.count(ReferralClick.id)).where(
                ReferralClick.ref_code == code, ReferralClick.suspicious.is_(True)
            )
        )
    ).scalar_one()
    attributed = (
        await db.execute(
            select(func.count(ReferralAttribution.id)).where(
                ReferralAttribution.marketer_id == marketer_id
            )
        )
    ).scalar_one()
    accepted = (
        await db.execute(
            select(func.count(ConsultationRequest.id)).where(
                ConsultationRequest.referrer_id == marketer_id,
                ConsultationRequest.status == "accepted",
            )
        )
    ).scalar_one()
    return {
        "clicks": clicks,
        "unique_clicks": unique_clicks,
        "suspicious_clicks": suspicious,
        "requests": attributed,
        "accepted": accepted,
        "conversion": round(attributed / clicks * 100, 1) if clicks else 0.0,
    }
