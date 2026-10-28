"""Opaque session tokens — the DB only stores SHA-256 hashes."""

import hashlib
import secrets
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import get_settings
from ..db.base import aware, utcnow
from ..models.user import Session, User

TOKEN_BYTES = 32


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def hash_lookup_value(value: str) -> str:
    """Also used for ticket access codes."""
    return _hash(value)


async def create_session(
    db: AsyncSession, user: User, ip: str, user_agent: str
) -> tuple[Session, str]:
    settings = get_settings()
    token = secrets.token_urlsafe(TOKEN_BYTES)
    session = Session(
        user_id=user.id,
        token_hash=_hash(token),
        ip=ip,
        user_agent=user_agent[:300],
        expires_at=utcnow() + timedelta(hours=settings.session_ttl_hours),
    )
    db.add(session)
    await db.flush()
    return session, token


async def get_valid_session(db: AsyncSession, token: str) -> Session | None:
    session = (
        await db.execute(
            select(Session).where(Session.token_hash == _hash(token))
        )
    ).scalar_one_or_none()
    if session is None or not session.is_valid:
        return None

    # idle-timeout: sessions die after N minutes of inactivity
    settings = get_settings()
    idle = utcnow() - aware(session.last_seen_at)
    if idle > timedelta(minutes=settings.session_idle_minutes):
        return None
    session.last_seen_at = utcnow()
    return session


async def revoke_session(db: AsyncSession, session: Session) -> None:
    session.revoked_at = utcnow()
    await db.flush()
