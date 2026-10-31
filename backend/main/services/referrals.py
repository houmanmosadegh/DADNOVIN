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
    RetiredRefCode,
)
from ..models.consultation import ConsultationRequest
from ..models.user import Role, User
from ..db.base import aware
from ..utils.phone import normalize_phone

CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # no 0/O/1/I/L — unambiguous
CODE_BODY_LEN = 8  # 8 CSPRNG chars + 1 check char = DN-XXXXXXXXX
_REF_PREFIX = "DN-"

# codes containing any of these are re-rolled (reserved/unfortunate strings)
_CODE_BLOCKLIST = (
    "ADMIN",
    "GOD",
    "SEX",
    "TEST",
    "DEMO",
    "XXX",
    "666",
    "FUCK",
    "SHIT",
    "KILL",
    "DEAD",
    "NAZI",
    "KKK",
    "SIS",
    "ASS",
    "CUM",
)

# allowed ?s= channels on referral links — anything else is ignored
CHANNELS = ("instagram", "telegram", "whatsapp", "website", "email", "other")

# click-attack heuristics — the same visitor hammering a link in 24h
CLICK_FLOOD_WINDOW = timedelta(hours=24)
CLICK_FLOOD_THRESHOLD = 20
LABEL_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,39}$")


def visitor_hash(ip: str, ua: str) -> str:
    return hashlib.sha256(f"{ip}|{ua}".encode()).hexdigest()


def _check_char(body: str) -> str:
    """Sum of alphabet positions mod alphabet size — catches typos."""
    return CODE_ALPHABET[
        sum(CODE_ALPHABET.index(ch) for ch in body) % len(CODE_ALPHABET)
    ]


def normalize_code(code: str) -> str:
    """Case-insensitive lookup key — strips separators, uppercases."""
    return re.sub(r"[^A-Za-z0-9]", "", code or "").upper()


def code_check_ok(code: str) -> bool:
    """Verify the check digit — only new-format codes (DN- + 9 chars) carry
    one; legacy 6-char codes skip verification."""
    body = normalize_code(code)
    if body.startswith("DN"):
        body = body[2:]
    if len(body) != CODE_BODY_LEN + 1:
        return True
    return _check_char(body[:-1]) == body[-1]


def gen_ref_code() -> str:
    """DN- + 8 CSPRNG chars + check digit, blocklist filtered."""
    for _ in range(50):
        body = "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_BODY_LEN))
        if any(bad in body for bad in _CODE_BLOCKLIST):
            continue
        return f"{_REF_PREFIX}{body}{_check_char(body)}"
    raise RuntimeError("ref code generation exhausted")  # pragma: no cover


async def apply(
    db: AsyncSession,
    user: User,
    note: str,
    channel: str = "",
    reapply_days: int = 14,
    terms_version: int = 0,
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
            409,
            {
                "code": "already_pending",
                "message": "درخواست بازاریابی شما در انتظار بررسی است.",
            },
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
            409,
            {"code": "already_marketer", "message": "حساب شما هم‌اکنون بازاریاب است."},
        )
    app = MarketerApplication(
        user_id=user.id,
        note=note.strip(),
        channel=channel.strip()[:200],
        accepted_terms=True,
        terms_version=terms_version,
    )
    db.add(app)
    await db.flush()
    return app


async def profile_for_user(
    db: AsyncSession, user_id: uuid.UUID
) -> MarketerProfile | None:
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
        raise HTTPException(
            409, {"code": "already_reviewed", "message": "قبلاً بررسی شده است."}
        )
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
        raise HTTPException(
            500, {"code": "code_gen", "message": "خطا در تولید کد ارجاع."}
        )
    prof = MarketerProfile(
        user_id=user.id,
        ref_code=code,
        approved_by=admin.id,
        accepted_terms_version=app.terms_version,
        accepted_at=app.created_at,
    )
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
        raise HTTPException(
            409, {"code": "already_reviewed", "message": "قبلاً بررسی شده است."}
        )
    app.status = "rejected"
    app.reviewed_by = admin.id
    app.reviewed_at = datetime.now(UTC)
    app.review_note = note.strip()
    await db.flush()
    return app


async def suspend(db: AsyncSession, profile: MarketerProfile, admin: User) -> None:
    """Suspend: link/code stop resolving (resolve_code checks is_active)."""
    profile.is_active = False
    await db.flush()


async def reactivate(db: AsyncSession, profile: MarketerProfile, admin: User) -> None:
    profile.is_active = True
    await db.flush()


async def resolve_code(db: AsyncSession, code: str) -> MarketerProfile | None:
    """Active profile for a code — normalized, check-digit verified.

    Retired codes (rotated by an admin) still resolve so old links keep
    attributing to the same marketer. Suspended/inactive profiles return
    None — identical to an invalid code (no enumeration)."""
    raw = normalize_code(code)
    if not raw or not code_check_ok(raw):
        return None
    dashed = f"DN-{raw[2:]}" if raw.startswith("DN") else raw
    cands = {raw, dashed}
    prof = (
        await db.execute(
            select(MarketerProfile).where(MarketerProfile.ref_code.in_(cands))
        )
    ).scalar_one_or_none()
    if prof is None:
        retired = (
            await db.execute(
                select(RetiredRefCode.marketer_id).where(RetiredRefCode.code.in_(cands))
            )
        ).scalar_one_or_none()
        if retired is not None:
            prof = (
                await db.execute(
                    select(MarketerProfile).where(MarketerProfile.id == retired)
                )
            ).scalar_one_or_none()
    return prof if prof is not None and prof.is_active else None


async def rotate_code(db: AsyncSession, profile: MarketerProfile, admin: User) -> str:
    """Admin-only: retire the current code and mint a fresh unique one.
    The old code keeps resolving via retired_ref_codes for past links."""
    old = profile.ref_code
    if old:
        db.add(RetiredRefCode(code=old, marketer_id=profile.id))
    for _ in range(20):
        code = gen_ref_code()
        clash = (
            await db.execute(
                select(MarketerProfile.id).where(MarketerProfile.ref_code == code)
            )
        ).scalar_one_or_none()
        retired_clash = await db.get(RetiredRefCode, code)
        if clash is None and retired_clash is None:
            break
    else:  # pragma: no cover
        raise HTTPException(
            500, {"code": "code_gen", "message": "خطا در تولید کد ارجاع."}
        )
    profile.ref_code = code
    await db.flush()
    return code


def normalize_label(label: str) -> str:
    label = (label or "").strip().lower()[:40]
    return label if LABEL_RE.match(label) else ""


def normalize_channel(raw: str) -> str:
    """`?s=` channel — whitelist only, anything else drops to ''."""
    s = (raw or "").strip().lower()
    return s if s in CHANNELS else ""


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


async def link_or_404(
    db: AsyncSession, marketer_id: uuid.UUID, label: str
) -> ReferralLink:
    """Channel link — `label` must be one of the whitelisted channels."""
    label = normalize_channel(label)
    if not label:
        raise HTTPException(400, {"code": "bad_label", "message": "کانال نامعتبر است."})
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


async def links_for(db: AsyncSession, profile: MarketerProfile) -> list[dict]:
    """Channel links + per-channel click/referral stats."""
    rows = (
        (
            await db.execute(
                select(ReferralLink)
                .where(ReferralLink.marketer_id == profile.id)
                .order_by(ReferralLink.created_at)
            )
        )
        .scalars()
        .all()
    )
    # one pass — per-channel clicks/unique/attributed grouped by label
    click_rows = (
        await db.execute(
            select(
                ReferralClick.link_label,
                func.count(ReferralClick.id),
                func.count(func.distinct(ReferralClick.visitor_hash)),
            )
            .where(
                ReferralClick.ref_code == profile.ref_code,
                ReferralClick.suspicious.is_(False),
            )
            .group_by(ReferralClick.link_label)
        )
    ).all()
    per_channel = {lab: (n, uq) for lab, n, uq in click_rows}
    attr_rows = (
        await db.execute(
            select(
                ReferralAttribution.channel,
                func.count(ReferralAttribution.id),
            )
            .where(ReferralAttribution.marketer_id == profile.id)
            .group_by(ReferralAttribution.channel)
        )
    ).all()
    per_attr = {ch: n for ch, n in attr_rows}
    out = []
    for link in rows:
        n, uq = per_channel.get(link.label, (0, 0))
        out.append(
            {
                "id": str(link.id),
                "channel": link.label,
                "clicks": n,
                "unique_clicks": uq,
                "requests": per_attr.get(link.label, 0),
                "url": f"/r/{profile.ref_code}?s={link.label}",
            }
        )
    return out


async def delete_channel_link(
    db: AsyncSession, marketer_id: uuid.UUID, channel: str
) -> None:
    """Remove a channel link by its whitelisted channel name."""
    row = (
        await db.execute(
            select(ReferralLink).where(
                ReferralLink.marketer_id == marketer_id,
                ReferralLink.label == normalize_channel(channel),
            )
        )
    ).scalar_one_or_none()
    if row is not None:
        await db.delete(row)
        await db.flush()


async def channel_stats_for(db: AsyncSession, profile: MarketerProfile) -> list[dict]:
    """Per-whitelisted-channel rollup for the marketer dashboard — channels
    with zero activity still show (so the link builder is discoverable)."""
    click_rows = (
        await db.execute(
            select(
                ReferralClick.link_label,
                func.count(ReferralClick.id),
                func.count(func.distinct(ReferralClick.visitor_hash)),
            )
            .where(
                ReferralClick.ref_code == profile.ref_code,
                ReferralClick.suspicious.is_(False),
            )
            .group_by(ReferralClick.link_label)
        )
    ).all()
    per_channel = {lab: (n, uq) for lab, n, uq in click_rows}
    attr_rows = (
        await db.execute(
            select(
                ReferralAttribution.channel,
                func.count(ReferralAttribution.id),
            )
            .where(ReferralAttribution.marketer_id == profile.id)
            .group_by(ReferralAttribution.channel)
        )
    ).all()
    per_attr = {ch: n for ch, n in attr_rows}
    linked = {
        r.label
        for r in (
            await db.execute(
                select(ReferralLink).where(ReferralLink.marketer_id == profile.id)
            )
        ).scalars()
    }
    out = []
    for ch in CHANNELS:
        n, uq = per_channel.get(ch, (0, 0))
        out.append(
            {
                "channel": ch,
                "clicks": n,
                "unique_clicks": uq,
                "requests": per_attr.get(ch, 0),
                "linked": ch in linked,
                "url": f"/r/{profile.ref_code}?s={ch}",
            }
        )
    return out


async def delete_link(
    db: AsyncSession, marketer_id: uuid.UUID, link_id: uuid.UUID
) -> None:
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
    if (
        marketer_user is not None
        and marketer_user.phone
        and normalize_phone(marketer_user.phone) == phone
    ):
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
    flag: str = "",
    consent: bool = False,
    channel: str = "",
) -> ReferralAttribution:
    """Immutable attribution — unique per request. `flag='review'` keeps the
    row for admin triage; without `consent` no commission accrues and the
    client's name stays hidden from the marketer."""
    attr = ReferralAttribution(
        marketer_id=profile.id,
        request_type=request_type,
        request_id=request_id,
        ref_code=profile.ref_code,
        ip=ip[:45],
        user_agent=ua[:300],
        flag=flag,
        channel=normalize_channel(channel),
        consent_at=datetime.now(UTC) if consent else None,
    )
    db.add(attr)
    await db.flush()
    return attr


async def reassign(
    db: AsyncSession,
    attr: ReferralAttribution,
    profile: MarketerProfile,
) -> None:
    """Admin override of attribution — callers write an audit row."""
    attr.marketer_id = profile.id
    attr.ref_code = profile.ref_code
    await db.flush()


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
