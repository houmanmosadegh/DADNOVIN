"""Page/section content admin with revision snapshots."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from ....db.session import get_db
from ....repositories.content import (
    get_page_by_slug,
    get_section,
    last_revisions,
    list_pages,
    snapshot_revision,
)
from ....schemas.content import PageOut, PageUpdateIn, SectionOut, SectionUpdateIn
from ....services.audit import audit
from ...dependencies.auth import EditorDep

router = APIRouter(prefix="/pages", tags=["admin-pages"])
DbDep = Annotated[AsyncSession, Depends(get_db)]


@router.get("")
async def pages(_: EditorDep, db: DbDep) -> list[PageOut]:
    return [PageOut.model_validate(p) for p in await list_pages(db)]


@router.get("/{slug}")
async def page(slug: str, _: EditorDep, db: DbDep) -> PageOut:
    row = await get_page_by_slug(db, slug)
    if row is None:
        raise HTTPException(404, {"code": "not_found", "message": "صفحه یافت نشد."})
    return PageOut.model_validate(row)


@router.patch("/{slug}")
async def update_page(
    slug: str, payload: PageUpdateIn, request: Request, user: EditorDep, db: DbDep
) -> PageOut:
    row = await get_page_by_slug(db, slug)
    if row is None:
        raise HTTPException(404, {"code": "not_found", "message": "صفحه یافت نشد."})
    await snapshot_revision(
        db,
        "page",
        slug,
        {
            "title": row.title,
            "seo_title": row.seo_title,
            "seo_description": row.seo_description,
            "is_published": row.is_published,
        },
        user.id,
    )
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    await audit(
        db,
        actor=user,
        action="page.update",
        entity="page",
        entity_id=slug,
        request=request,
    )
    await db.commit()
    return PageOut.model_validate(row)


@router.patch("/sections/{section_id}")
async def update_section(
    section_id: uuid.UUID,
    payload: SectionUpdateIn,
    request: Request,
    user: EditorDep,
    db: DbDep,
) -> SectionOut:
    row = await get_section(db, section_id)
    if row is None:
        raise HTTPException(404, {"code": "not_found", "message": "بخش یافت نشد."})
    await snapshot_revision(
        db,
        "section",
        str(section_id),
        {
            "content": row.content,
            "is_enabled": row.is_enabled,
            "sort_order": row.sort_order,
        },
        user.id,
    )
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    await audit(
        db,
        actor=user,
        action="section.update",
        entity="section",
        entity_id=section_id,
        request=request,
    )
    await db.commit()
    return SectionOut.model_validate(row)


@router.get("/revisions/{entity_type}/{entity_id}")
async def revisions(
    entity_type: str, entity_id: str, _: EditorDep, db: DbDep
) -> list[dict]:
    return [
        {
            "id": str(r.id),
            "note": r.note,
            "snapshot": r.snapshot,
            "created_at": r.created_at.isoformat(),
        }
        for r in await last_revisions(db, entity_type, entity_id)
    ]
