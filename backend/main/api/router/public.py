"""Read-only public API — only content flagged `is_public`/`is_visible`."""

from typing import Annotated
from xml.sax.saxutils import escape

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.config import get_settings
from ...db.session import get_db
from ...models.content import SiteSetting
from ...models.lawyer import Lawyer
from ...models.request_ops import Article
from ...repositories.content import get_page_by_slug, list_pages, public_settings_map
from ...repositories.lawyers import list_lawyers
from ...schemas.content import (
    PublicArticleDetailOut,
    PublicArticleOut,
    PublicPageOut,
    PublicSectionOut,
)
from ...schemas.lawyer import PublicLawyerOut, public_lawyer

router = APIRouter(prefix="/public", tags=["public"])
DbDep = Annotated[AsyncSession, Depends(get_db)]


@router.get("/settings")
async def public_settings(db: DbDep) -> dict[str, dict]:
    settings = await public_settings_map(db)
    settings["meta"] = {
        "has_articles": await _has_published_articles(db),
        "marketing_enabled": await _marketing_flag(db),
    }
    return settings


@router.get("/legal-topics")
async def legal_topics(db: DbDep) -> list[str]:
    """Admin-managed topic list for the consultation form (public-safe)."""
    settings = await public_settings_map(db)
    topics = (settings.get("legal_topics") or {}).get("items") or []
    return [t for t in topics if isinstance(t, str) and t.strip()][:40]


async def _marketing_flag(db: AsyncSession) -> bool:
    row = await db.get(SiteSetting, "commission")
    cfg = row.value if row and isinstance(row.value, dict) else {}
    return bool(cfg.get("marketing_enabled", cfg.get("commission_enabled")))


@router.get("/articles")
async def articles_index(db: DbDep) -> list[PublicArticleOut]:
    """Published articles only — the public list page renders conditionally."""
    rows = (
        await db.execute(
            select(Article)
            .where(Article.status == "published")
            .order_by(Article.published_at.desc().nulls_last(), Article.id)
        )
    ).scalars().all()
    return [_public_article(a) for a in rows]


@router.get("/articles/{slug}")
async def article_by_slug(slug: str, db: DbDep) -> PublicArticleDetailOut:
    row = (
        await db.execute(select(Article).where(func.lower(Article.slug) == slug.lower()))
    ).scalar_one_or_none()
    if row is None or row.status != "published":
        raise HTTPException(404, {"code": "not_found", "message": "مقاله یافت نشد."})
    return PublicArticleDetailOut(
        **_public_article(row).model_dump(),
        body=row.body,
        seo_title=row.seo_title,
        seo_description=row.seo_description,
    )


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


_BASE_PATHS = ("/", "/about", "/services", "/consultation", "/contact", "/track")


@router.get("/sitemap.xml", include_in_schema=False)
async def sitemap(db: DbDep) -> Response:
    """Dynamic sitemap — article URLs appear only while published."""
    settings_map = await public_settings_map(db)
    base = (
        (settings_map.get("brand") or {}).get("siteUrl")
        or get_settings().public_base_url
    ).rstrip("/")
    paths = list(_BASE_PATHS)
    rows = (
        await db.execute(
            select(Article.slug, Article.published_at)
            .where(Article.status == "published")
            .order_by(Article.published_at.desc().nulls_last())
        )
    ).all()
    if rows:
        paths.append("/articles")
    urls = [f"    <url><loc>{escape(base)}{p}</loc></url>" for p in paths]
    for slug, published_at in rows:
        lastmod = (
            f"<lastmod>{published_at.date().isoformat()}</lastmod>"
            if published_at
            else ""
        )
        urls.append(
            f"    <url><loc>{escape(base)}/articles/{escape(slug)}</loc>{lastmod}</url>"
        )
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "\n".join(urls)
        + "\n</urlset>\n"
    )
    return Response(content=xml, media_type="application/xml")


async def _has_published_articles(db: AsyncSession) -> bool:
    return (
        await db.execute(
            select(func.count(Article.id)).where(Article.status == "published")
        )
    ).scalar_one() > 0


def _public_article(a: Article) -> PublicArticleOut:
    return PublicArticleOut(
        slug=a.slug, title=a.title, excerpt=a.excerpt, published_at=a.published_at
    )


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
