"""Settings / pages / sections persistence."""

import uuid
from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.content import ContentRevision, Page, PageSection, SiteSetting


async def list_settings(db: AsyncSession) -> list[SiteSetting]:
    return list((await db.execute(select(SiteSetting))).scalars())


async def get_setting(db: AsyncSession, key: str) -> SiteSetting | None:
    return await db.get(SiteSetting, key)


async def upsert_setting(
    db: AsyncSession, key: str, value: dict, is_public: bool, updated_by
) -> SiteSetting:
    row = await db.get(SiteSetting, key)
    if row is None:
        row = SiteSetting(key=key)
        db.add(row)
    row.value = value
    row.is_public = is_public
    row.updated_by = updated_by
    await db.flush()
    return row


async def public_settings_map(db: AsyncSession) -> dict[str, dict]:
    rows = (
        await db.execute(select(SiteSetting).where(SiteSetting.is_public.is_(True)))
    ).scalars()
    return {r.key: r.value for r in rows}


async def list_pages(db: AsyncSession) -> list[Page]:
    return list(
        (
            await db.execute(
                select(Page).order_by(Page.sort_order, Page.slug)
            )
        ).scalars()
    )


async def get_page_by_slug(db: AsyncSession, slug: str) -> Page | None:
    return (
        await db.execute(select(Page).where(Page.slug == slug))
    ).scalar_one_or_none()


async def get_section(db: AsyncSession, section_id: uuid.UUID) -> PageSection | None:
    return await db.get(PageSection, section_id)


async def snapshot_revision(
    db: AsyncSession,
    entity_type: str,
    entity_id: str,
    snapshot: dict,
    created_by,
    note: str = "",
) -> ContentRevision:
    rev = ContentRevision(
        entity_type=entity_type,
        entity_id=entity_id,
        snapshot=snapshot,
        created_by=created_by,
        note=note,
    )
    db.add(rev)
    await db.flush()
    return rev


async def last_revisions(
    db: AsyncSession, entity_type: str, entity_id: str, limit: int = 20
) -> Iterable[ContentRevision]:
    return (
        await db.execute(
            select(ContentRevision)
            .where(
                ContentRevision.entity_type == entity_type,
                ContentRevision.entity_id == entity_id,
            )
            .order_by(ContentRevision.created_at.desc())
            .limit(limit)
        )
    ).scalars()
