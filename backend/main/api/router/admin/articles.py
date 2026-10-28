"""Article CRUD — draft/published with SEO fields."""

import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ....db.session import get_db
from ....models.request_ops import Article
from ....schemas.common import Page
from ....schemas.requests import ArticleIn, ArticleOut, ArticlePatchIn
from ....services.audit import audit
from ...dependencies.auth import EditorDep
from ...dependencies.pagination import PageDep

router = APIRouter(prefix="/articles", tags=["admin-articles"])
DbDep = Annotated[AsyncSession, Depends(get_db)]


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
        await db.execute(
            stmt.order_by(Article.updated_at.desc())
            .offset(page.offset)
            .limit(page.page_size)
        )
    ).scalars().all()
    return Page[ArticleOut](
        items=[ArticleOut.model_validate(a) for a in items],
        total=total, page=page.page, page_size=page.page_size,
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
    row = Article(**payload.model_dump())
    if row.status == "published":
        row.published_at = datetime.now(UTC)
    db.add(row)
    await db.flush()
    await audit(
        db, actor=user, action="article.create", entity="article",
        entity_id=row.id, detail={"slug": row.slug, "status": row.status},
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
            raise HTTPException(409, {"code": "conflict", "message": "اسلاگ تکراری است."})
    for k, v in data.items():
        setattr(row, k, v)
    if data.get("status") == "published" and row.published_at is None:
        row.published_at = datetime.now(UTC)
    await audit(
        db, actor=user, action="article.update", entity="article",
        entity_id=row.id,
        before={k: before[k] for k in data},
        after={k: v for k, v in data.items()},
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
        db, actor=user, action="article.delete", entity="article",
        entity_id=article_id, detail={"slug": row.slug}, request=request,
    )
    await db.commit()
