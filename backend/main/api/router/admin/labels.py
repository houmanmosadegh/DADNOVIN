"""Label CRUD for the unified inbox."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ....db.session import get_db
from ....models.request_ops import Label, RequestLabel
from ....schemas.requests import LabelIn, LabelOut
from ....services.audit import audit
from ...dependencies.auth import SupportDep

router = APIRouter(prefix="/labels", tags=["admin-labels"])
DbDep = Annotated[AsyncSession, Depends(get_db)]


@router.get("")
async def list_labels(_: SupportDep, db: DbDep) -> list[LabelOut]:
    rows = (await db.execute(select(Label).order_by(Label.name))).scalars().all()
    return [LabelOut.model_validate(r) for r in rows]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_label(
    payload: LabelIn, request: Request, user: SupportDep, db: DbDep
) -> LabelOut:
    exists = (
        await db.execute(select(Label).where(Label.name == payload.name.strip()))
    ).scalar_one_or_none()
    if exists:
        raise HTTPException(409, {"code": "conflict", "message": "برچسب تکراری است."})
    row = Label(name=payload.name.strip(), color=payload.color)
    db.add(row)
    await db.flush()
    await audit(
        db,
        actor=user,
        action="label.create",
        entity="label",
        entity_id=row.id,
        detail={"name": row.name},
        request=request,
    )
    await db.commit()
    return LabelOut.model_validate(row)


@router.delete("/{label_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_label(
    label_id: uuid.UUID, request: Request, user: SupportDep, db: DbDep
) -> None:
    row = await db.get(Label, label_id)
    if row is None:
        raise HTTPException(404, {"code": "not_found", "message": "برچسب یافت نشد."})
    await db.execute(
        RequestLabel.__table__.delete().where(RequestLabel.label_id == label_id)
    )
    await db.delete(row)
    await audit(
        db,
        actor=user,
        action="label.delete",
        entity="label",
        entity_id=label_id,
        detail={"name": row.name},
        request=request,
    )
    await db.commit()
