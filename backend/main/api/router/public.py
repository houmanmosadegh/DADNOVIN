"""Read-only public API — only content flagged `is_public`/`is_visible`."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ...db.session import get_db
from ...models.lawyer import Lawyer
from ...repositories.content import get_page_by_slug, list_pages, public_settings_map
from ...repositories.lawyers import list_lawyers
from ...schemas.content import PublicPageOut, PublicSectionOut
from ...schemas.lawyer import PublicLawyerOut, public_lawyer

router = APIRouter(prefix="/public", tags=["public"])
DbDep = Annotated[AsyncSession, Depends(get_db)]


@router.get("/settings")
async def public_settings(db: DbDep) -> dict[str, dict]:
    return await public_settings_map(db)


@router.get("/pages")
async def pages_index(db: DbDep) -> list[PublicPageOut]:
    pages = [p for p in await list_pages(db) if p.is_published]
    return [_public_page(p) for p in pages]


@router.get("/pages/{slug}")
async def page_by_slug(slug: str, db: DbDep) -> PublicPageOut:
    page = await get_page_by_slug(db, slug)
    if page is None or not page.is_published:
        raise HTTPException(
            404, {"code": "not_found", "message": "صفحه یافت نشد."}
        )
    return _public_page(page)


@router.get("/lawyers")
async def lawyers(db: DbDep) -> list[PublicLawyerOut]:
    return [public_lawyer(lw) for lw in await list_lawyers(db, only_visible=True)]


@router.get("/content")
async def content_bundle(db: DbDep) -> dict:
    """Bundled public content — one request for settings + pages + lawyers
    so the public site can hydrate everything at once."""
    return {
        "settings": await public_settings_map(db),
        "pages": [
            _public_page(p) for p in await list_pages(db) if p.is_published
        ],
        "lawyers": [
            public_lawyer(lw) for lw in await list_lawyers(db, only_visible=True)
        ],
    }


@router.get("/lawyers/{slug}")
async def lawyer_by_slug(slug: str, db: DbDep) -> PublicLawyerOut:
    row = (
        await db.execute(select(Lawyer).where(func.lower(Lawyer.slug) == slug.lower()))
    ).scalar_one_or_none()
    if row is None or not row.is_visible:
        raise HTTPException(404, {"code": "not_found", "message": "وکیل یافت نشد."})
    return public_lawyer(row)


def _public_page(page) -> PublicPageOut:
    return PublicPageOut(
        slug=page.slug,
        title=page.title,
        seo_title=page.seo_title,
        seo_description=page.seo_description,
        sections=[
            PublicSectionOut(key=s.key, kind=s.kind, content=s.content)
            for s in sorted(page.sections, key=lambda x: x.sort_order)
            if s.is_enabled
        ],
    )
