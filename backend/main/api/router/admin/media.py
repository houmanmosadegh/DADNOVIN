"""Media upload — library UI was removed; only upload + file-serving stay,
since lawyer portraits and request attachments depend on them."""

from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from ....db.session import get_db
from ....models.media import MediaAsset
from ....schemas.media import MediaOut
from ....services.audit import audit
from ....services.media import store_upload
from ...dependencies.auth import EditorDep

router = APIRouter(prefix="/media", tags=["admin-media"])
DbDep = Annotated[AsyncSession, Depends(get_db)]


def _out(asset: MediaAsset) -> MediaOut:
    out = MediaOut.model_validate(asset)
    out.url = f"/api/v1/media/file/{asset.stored_name}"
    return out


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
