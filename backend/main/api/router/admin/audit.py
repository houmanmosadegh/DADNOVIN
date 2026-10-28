"""Audit log — super_admin + admin visibility."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ....db.session import get_db
from ....models.audit import AuditLog
from ....schemas.common import Page
from ...dependencies.auth import require_roles
from ...dependencies.pagination import PageDep

router = APIRouter(prefix="/audit", tags=["admin-audit"])
DbDep = Annotated[AsyncSession, Depends(get_db)]
AuditDep = Annotated[object, Depends(require_roles("super_admin", "admin"))]


@router.get("")
async def list_logs(
    _: AuditDep,
    db: DbDep,
    page: PageDep,
    action: Annotated[str | None, Query(max_length=80)] = None,
    entity: Annotated[str | None, Query(max_length=80)] = None,
) -> Page[dict]:
    stmt = select(AuditLog)
    count = select(func.count(AuditLog.id))
    if action:
        stmt = stmt.where(AuditLog.action == action)
        count = count.where(AuditLog.action == action)
    if entity:
        stmt = stmt.where(AuditLog.entity == entity)
        count = count.where(AuditLog.entity == entity)
    total = (await db.execute(count)).scalar_one()
    items = (
        await db.execute(
            stmt.order_by(AuditLog.created_at.desc())
            .offset(page.offset)
            .limit(page.page_size)
        )
    ).scalars()
    return Page[dict](
        items=[
            {
                "id": str(r.id),
                "actor_username": r.actor_username,
                "action": r.action,
                "entity": r.entity,
                "entity_id": r.entity_id,
                "detail": r.detail,
                "ip": r.ip,
                "created_at": r.created_at.isoformat(),
            }
            for r in items
        ],
        total=total,
        page=page.page,
        page_size=page.page_size,
    )
