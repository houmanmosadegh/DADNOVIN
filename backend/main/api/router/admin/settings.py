"""Site settings admin."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from ....db.session import get_db
from ....repositories.content import (
    get_setting,
    list_settings,
    snapshot_revision,
    upsert_setting,
)
from ....schemas.content import SettingOut, SettingUpsertIn
from ....services.audit import audit
from ...dependencies.auth import EditorDep

router = APIRouter(prefix="/settings", tags=["admin-settings"])
DbDep = Annotated[AsyncSession, Depends(get_db)]

ALLOWED_KEYS = {
    "brand", "contact", "seo", "footer", "socials", "ai",
    "referral", "commission",
}


@router.get("")
async def all_settings(_: EditorDep, db: DbDep) -> list[SettingOut]:
    return [SettingOut.model_validate(r) for r in await list_settings(db)]


@router.get("/{key}")
async def one_setting(key: str, _: EditorDep, db: DbDep) -> SettingOut:
    row = await get_setting(db, key)
    if row is None:
        raise HTTPException(404, {"code": "not_found", "message": "تنظیم یافت نشد."})
    return SettingOut.model_validate(row)


@router.put("/{key}")
async def update_setting(
    key: str, payload: SettingUpsertIn, request: Request, user: EditorDep, db: DbDep
) -> SettingOut:
    if key not in ALLOWED_KEYS:
        raise HTTPException(
            400,
            {"code": "unknown_key", "message": f"کلید باید یکی از {', '.join(sorted(ALLOWED_KEYS))} باشد."},
        )
    existing = await get_setting(db, key)
    if existing is not None:
        await snapshot_revision(
            db, "setting", key, {"value": existing.value, "is_public": existing.is_public}, user.id
        )
    is_public = existing.is_public if payload.is_public is None else payload.is_public
    if existing is None and payload.is_public is None:
        is_public = key in {"brand", "contact", "seo", "footer", "socials"}
    row = await upsert_setting(db, key, payload.value, is_public, user.id)
    await audit(db, actor=user, action="setting.update", entity="setting", entity_id=key, request=request)
    await db.commit()
    return SettingOut.model_validate(row)
