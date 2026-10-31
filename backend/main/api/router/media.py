"""Media file serving — public read of stored uploads."""

import re
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...db.session import get_db
from ...models.media import MediaAsset
from ...services.media import media_path

router = APIRouter(prefix="/media", tags=["media"])
DbDep = Annotated[AsyncSession, Depends(get_db)]

_NAME_RE = re.compile(r"^[0-9a-f]{32}\.(jpg|png|webp|pdf)$")


@router.get("/{asset_id}")
async def serve_media_by_id(asset_id: uuid.UUID, db: DbDep) -> FileResponse:
    """Serve a public asset by id — used for article featured images."""
    asset = await db.get(MediaAsset, asset_id)
    if asset is None or asset.purpose != "public":
        raise HTTPException(404, {"code": "not_found", "message": "یافت نشد."})
    path = media_path(asset)
    if not path.exists():
        raise HTTPException(404, {"code": "not_found", "message": "یافت نشد."})
    return FileResponse(
        path,
        media_type=asset.content_type,
        headers={
            "Cache-Control": "public, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get("/file/{stored_name}")
async def serve_media(stored_name: str, db: DbDep) -> FileResponse:
    """Serve an uploaded file by its generated name — path-traversal safe.
    Receipts/payout proofs are purpose-gated: they never go through here."""
    if not _NAME_RE.match(stored_name):
        raise HTTPException(404, {"code": "not_found", "message": "یافت نشد."})
    asset = (
        await db.execute(
            select(MediaAsset).where(MediaAsset.stored_name == stored_name)
        )
    ).scalar_one_or_none()
    if asset is None or asset.purpose != "public":
        raise HTTPException(404, {"code": "not_found", "message": "یافت نشد."})
    path = media_path(asset)
    if not path.exists():
        raise HTTPException(404, {"code": "not_found", "message": "یافت نشد."})
    return FileResponse(
        path,
        media_type=asset.content_type,
        headers={
            "Cache-Control": "public, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
        },
    )
