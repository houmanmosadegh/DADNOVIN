"""Media library admin."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ....db.session import get_db
from ....models.media import MediaAsset
from ....schemas.media import MediaOut, MediaPatchIn
from ....services.audit import audit
from ....services.media import delete_asset, store_upload
from ...dependencies.auth import EditorDep
from ...dependencies.pagination import PageDep

router = APIRouter(prefix="/media", tags=["admin-media"])
DbDep = Annotated[AsyncSession, Depends(get_db)]


def _out(asset: MediaAsset) -> MediaOut:
    out = MediaOut.model_validate(asset)
    out.url = f"/api/v1/media/file/{asset.stored_name}"
    return out


@router.get("")
async def list_media(_: EditorDep, db: DbDep, page: PageDep) -> dict:
    total = (await db.execute(select(func.count(MediaAsset.id)))).scalar_one()
    items = (
        await db.execute(
            select(MediaAsset)
            .order_by(MediaAsset.created_at.desc())
            .offset(page.offset)
            .limit(page.page_size)
        )
    ).scalars()
    return {
        "items": [_out(a) for a in items],
        "total": total,
        "page": page.page,
        "page_size": page.page_size,
    }


@router.post("", status_code=status.HTTP_201_CREATED)
async def upload_media(
    request: Request,
    user: EditorDep,
    db: DbDep,
    file: Annotated[UploadFile, File()],
    alt: Annotated[str, Form(max_length=255)] = "",
) -> MediaOut:
    asset = await store_upload(db, file, user, alt=alt)
    await audit(db, actor=user, action="media.upload", entity="media", entity_id=asset.id,
                detail={"name": asset.original_name, "size": asset.size_bytes}, request=request)
    await db.commit()
    return _out(asset)


@router.patch("/{asset_id}")
async def patch_media(
    asset_id: uuid.UUID,
    payload: MediaPatchIn,
    request: Request,
    user: EditorDep,
    db: DbDep,
) -> MediaOut:
    asset = await db.get(MediaAsset, asset_id)
    if asset is None:
        raise HTTPException(404, {"code": "not_found", "message": "فایل یافت نشد."})
    asset.alt = payload.alt
    await audit(db, actor=user, action="media.update", entity="media", entity_id=asset.id, request=request)
    await db.commit()
    return _out(asset)


@router.delete("/{asset_id}")
async def remove_media(
    asset_id: uuid.UUID, request: Request, user: EditorDep, db: DbDep
):
    asset = await db.get(MediaAsset, asset_id)
    if asset is None:
        raise HTTPException(404, {"code": "not_found", "message": "فایل یافت نشد."})
    await audit(db, actor=user, action="media.delete", entity="media", entity_id=asset.id,
                detail={"name": asset.original_name}, request=request)
    await delete_asset(db, asset)
    await db.commit()
    return {"message": "فایل حذف شد."}
