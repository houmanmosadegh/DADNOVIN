"""Append-only audit trail for admin actions."""

import uuid

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.rate_limit import client_key
from ..models.audit import AuditLog
from ..models.user import User


_SENSITIVE = ("pass", "token", "secret", "credential", "access_code", "api_key", "hash")


def _safe(data: dict | None) -> dict:
    """Never log secrets: strip anything that smells like a credential."""
    return {
        k: v
        for k, v in (data or {}).items()
        if not any(s in k.lower() for s in _SENSITIVE)
    }


async def audit(
    db: AsyncSession,
    *,
    actor: User | None,
    action: str,
    entity: str = "",
    entity_id: str | uuid.UUID = "",
    detail: dict | None = None,
    before: dict | None = None,
    after: dict | None = None,
    request: Request | None = None,
) -> None:
    db.add(
        AuditLog(
            actor_id=actor.id if actor else None,
            actor_username=actor.username if actor else "",
            action=action,
            entity=entity,
            entity_id=str(entity_id),
            detail=_safe(detail),
            before_json=_safe(before),
            after_json=_safe(after),
            ip=client_key(request) if request else "",
        )
    )
    await db.flush()
