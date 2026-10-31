"""Article CRUD — draft/published with SEO fields."""

import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ....db.session import get_db
from ....models.content import ContentRevision
from ....models.request_ops import Article
from ....schemas.common import Page
from ....schemas.requests import ArticleIn, ArticleOut, ArticlePatchIn
from ....services.audit import audit
from ....services.sanitize import reading_minutes, sanitize_html
from ...dependencies.auth import EditorDep
from ...dependencies.pagination import PageDep

router = APIRouter(prefix="/articles", tags=["admin-articles"])
DbDep = Annotated[AsyncSession, Depends(get_db)]


def _apply(row: Article, data: dict) -> None:
    if "body" in data and data["body"] is not None:
        data["body"] = sanitize_html(data["body"])
        data["read_time_min"] = reading_minutes(data["body"])
    if data.pop("clear_featured_image", False):
        data["featured_image_id"] = None
    for k, v in data.items():
        setattr(row, k, v)
    if row.status == "published" and row.published_at is None:
        row.published_at = datetime.now(UTC)
    if row.status == "scheduled" and not row.scheduled_at:
        row.status = "draft"  # scheduled requires a time — fall back safely


def _snapshot(db: AsyncSession, row: Article, actor_id, note: str = "") -> None:
    db.add(
        ContentRevision(
            entity_type="article",
            entity_id=str(row.id),
            snapshot=ArticleOut.model_validate(row).model_dump(mode="json"),
            created_by=actor_id,
            note=note,
        )
    )


@router.get("")
async def list_articles(
    _: EditorDep,
    db: DbDep,
    page: PageDep,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    q: Annotated[str | None, Query(max_length=100)] = None,
) -> Page[ArticleOut]:
    stmt = select(Article)
    count = select(func.count(Article.id))
    if status_filter:
        stmt = stmt.where(Article.status == status_filter)
        count = count.where(Article.status == status_filter)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(Article.title.ilike(like) | Article.slug.ilike(like))
        count = count.where(Article.title.ilike(like) | Article.slug.ilike(like))
    total = (await db.execute(count)).scalar_one()
    items = (
        (
            await db.execute(
                stmt.order_by(Article.updated_at.desc())
                .offset(page.offset)
                .limit(page.page_size)
            )
        )
        .scalars()
        .all()
    )
    return Page[ArticleOut](
        items=[ArticleOut.model_validate(a) for a in items],
        total=total,
        page=page.page,
        page_size=page.page_size,
    )


@router.get("/{article_id}")
async def get_article(article_id: uuid.UUID, _: EditorDep, db: DbDep) -> ArticleOut:
    row = await db.get(Article, article_id)
    if row is None:
        raise HTTPException(404, {"code": "not_found", "message": "مقاله یافت نشد."})
    return ArticleOut.model_validate(row)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_article(
    payload: ArticleIn, request: Request, user: EditorDep, db: DbDep
) -> ArticleOut:
    exists = (
        await db.execute(select(Article).where(Article.slug == payload.slug))
    ).scalar_one_or_none()
    if exists:
        raise HTTPException(409, {"code": "conflict", "message": "اسلاگ تکراری است."})
    row = Article(slug=payload.slug, title=payload.title)
    _apply(row, payload.model_dump(exclude={"slug", "title"}))
    db.add(row)
    await db.flush()
    _snapshot(db, row, user.id, "ایجاد")
    await audit(
        db,
        actor=user,
        action="article.create",
        entity="article",
        entity_id=row.id,
        detail={"slug": row.slug, "status": row.status},
        request=request,
    )
    await db.commit()
    return ArticleOut.model_validate(row)


@router.patch("/{article_id}")
async def patch_article(
    article_id: uuid.UUID,
    payload: ArticlePatchIn,
    request: Request,
    user: EditorDep,
    db: DbDep,
) -> ArticleOut:
    row = await db.get(Article, article_id)
    if row is None:
        raise HTTPException(404, {"code": "not_found", "message": "مقاله یافت نشد."})
    before = ArticleOut.model_validate(row).model_dump()
    data = payload.model_dump(exclude_unset=True)
    if "slug" in data and data["slug"] != row.slug:
        exists = (
            await db.execute(select(Article).where(Article.slug == data["slug"]))
        ).scalar_one_or_none()
        if exists:
            raise HTTPException(
                409, {"code": "conflict", "message": "اسلاگ تکراری است."}
            )
    _apply(row, data)
    _snapshot(db, row, user.id)
    await audit(
        db,
        actor=user,
        action="article.update",
        entity="article",
        entity_id=row.id,
        before={k: before.get(k) for k in data},
        after={k: v for k, v in data.items()},
        request=request,
    )
    await db.commit()
    return ArticleOut.model_validate(row)


@router.get("/{article_id}/revisions")
async def article_revisions(
    article_id: uuid.UUID, _: EditorDep, db: DbDep
) -> list[dict]:
    rows = (
        (
            await db.execute(
                select(ContentRevision)
                .where(
                    ContentRevision.entity_type == "article",
                    ContentRevision.entity_id == str(article_id),
                )
                .order_by(ContentRevision.created_at.desc())
                .limit(50)
            )
        )
        .scalars()
        .all()
    )
    return [
        {
            "id": str(r.id),
            "created_at": r.created_at,
            "created_by": str(r.created_by) if r.created_by else None,
            "note": r.note,
            "title": (r.snapshot or {}).get("title", ""),
            "status": (r.snapshot or {}).get("status", ""),
        }
        for r in rows
    ]


@router.post("/{article_id}/revisions/{rev_id}/restore")
async def article_restore(
    article_id: uuid.UUID,
    rev_id: uuid.UUID,
    request: Request,
    user: EditorDep,
    db: DbDep,
) -> ArticleOut:
    row = await db.get(Article, article_id)
    if row is None:
        raise HTTPException(404, {"code": "not_found", "message": "مقاله یافت نشد."})
    rev = await db.get(ContentRevision, rev_id)
    if rev is None or rev.entity_type != "article" or rev.entity_id != str(article_id):
        raise HTTPException(404, {"code": "not_found", "message": "نسخه یافت نشد."})
    snap = rev.snapshot or {}
    fields = (
        "title",
        "excerpt",
        "body",
        "seo_title",
        "seo_description",
        "canonical",
        "category",
        "tags",
        "author_name",
        "author_bio",
    )
    for k in fields:
        if k in snap:
            setattr(row, k, snap[k])
    if snap.get("body"):
        row.body = sanitize_html(row.body)
        row.read_time_min = reading_minutes(row.body)
    row.status = "draft"  # restores always land as draft — never auto-publish
    _snapshot(db, row, user.id, "بازگردانی از نسخه")
    await audit(
        db,
        actor=user,
        action="article.restore",
        entity="article",
        entity_id=row.id,
        detail={"rev": str(rev_id)},
        request=request,
    )
    await db.commit()
    return ArticleOut.model_validate(row)


@router.delete("/{article_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_article(
    article_id: uuid.UUID, request: Request, user: EditorDep, db: DbDep
) -> None:
    row = await db.get(Article, article_id)
    if row is None:
        raise HTTPException(404, {"code": "not_found", "message": "مقاله یافت نشد."})
    await db.delete(row)
    await audit(
        db,
        actor=user,
        action="article.delete",
        entity="article",
        entity_id=article_id,
        detail={"slug": row.slug},
        request=request,
    )
    await db.commit()
