"""Lawyer CRUD."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from ....db.session import get_db
from ....repositories.lawyers import get_lawyer, list_lawyers, slug_taken
from ....models.lawyer import Lawyer
from ....schemas.lawyer import LawyerIn, LawyerOut, LawyerUpdateIn
from ....services.audit import audit
from ...dependencies.auth import EditorDep

router = APIRouter(prefix="/lawyers", tags=["admin-lawyers"])
DbDep = Annotated[AsyncSession, Depends(get_db)]


@router.get("")
async def lawyers(_: EditorDep, db: DbDep) -> list[LawyerOut]:
    return [LawyerOut.model_validate(lw) for lw in await list_lawyers(db)]


@router.get("/{lawyer_id}")
async def one_lawyer(lawyer_id: uuid.UUID, _: EditorDep, db: DbDep) -> LawyerOut:
    row = await get_lawyer(db, lawyer_id)
    if row is None:
        raise HTTPException(404, {"code": "not_found", "message": "وکیل یافت نشد."})
    return LawyerOut.model_validate(row)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_lawyer(
    payload: LawyerIn, request: Request, user: EditorDep, db: DbDep
) -> LawyerOut:
    if await slug_taken(db, payload.slug):
        raise HTTPException(
            409, {"code": "slug_taken", "message": "این نامک قبلاً استفاده شده است."}
        )
    row = Lawyer(**payload.model_dump())
    db.add(row)
    await db.flush()
    await audit(db, actor=user, action="lawyer.create", entity="lawyer", entity_id=row.id, request=request)
    await db.commit()
    return LawyerOut.model_validate(row)


@router.patch("/{lawyer_id}")
async def update_lawyer(
    lawyer_id: uuid.UUID,
    payload: LawyerUpdateIn,
    request: Request,
    user: EditorDep,
    db: DbDep,
) -> LawyerOut:
    row = await get_lawyer(db, lawyer_id)
    if row is None:
        raise HTTPException(404, {"code": "not_found", "message": "وکیل یافت نشد."})
    data = payload.model_dump(exclude_unset=True)
    if "slug" in data and data["slug"] != row.slug and await slug_taken(db, data["slug"], exclude_id=row.id):
        raise HTTPException(
            409, {"code": "slug_taken", "message": "این نامک قبلاً استفاده شده است."}
        )
    for field, value in data.items():
        setattr(row, field, value)
    await audit(db, actor=user, action="lawyer.update", entity="lawyer", entity_id=row.id, request=request)
    await db.commit()
    return LawyerOut.model_validate(row)


@router.delete("/{lawyer_id}")
async def delete_lawyer(
    lawyer_id: uuid.UUID, request: Request, user: EditorDep, db: DbDep
):
    row = await get_lawyer(db, lawyer_id)
    if row is None:
        raise HTTPException(404, {"code": "not_found", "message": "وکیل یافت نشد."})
    await audit(db, actor=user, action="lawyer.delete", entity="lawyer", entity_id=row.id,
                detail={"name": row.name}, request=request)
    await db.delete(row)
    await db.commit()
    return {"message": "وکیل حذف شد."}
