"""Lawyer queries."""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.lawyer import Lawyer


async def list_lawyers(
    db: AsyncSession, *, only_visible: bool = False
) -> list[Lawyer]:
    q = select(Lawyer).order_by(Lawyer.sort_order, Lawyer.created_at)
    if only_visible:
        q = q.where(Lawyer.is_visible.is_(True))
    return list((await db.execute(q)).scalars())


async def get_lawyer(db: AsyncSession, lawyer_id) -> Lawyer | None:
    return await db.get(Lawyer, lawyer_id)


async def slug_taken(db: AsyncSession, slug: str, exclude_id=None) -> bool:
    q = select(func.count(Lawyer.id)).where(Lawyer.slug == slug)
    if exclude_id is not None:
        q = q.where(Lawyer.id != exclude_id)
    return bool((await db.execute(q)).scalar_one())
