"""User management — super_admin only."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ....db.session import get_db
from ....models.user import Role, User
from ....schemas.auth import RoleOut, UserCreateIn, UserOut, UserUpdateIn
from ....security.passwords import hash_password
from ....services.audit import audit
from ...dependencies.auth import SuperAdminDep

router = APIRouter(prefix="/users", tags=["admin-users"])
DbDep = Annotated[AsyncSession, Depends(get_db)]


async def _roles_by_ids(db: AsyncSession, ids: list[int]) -> list[Role]:
    if not ids:
        return []
    return list((await db.execute(select(Role).where(Role.id.in_(ids)))).scalars())


@router.get("/roles")
async def roles(_: SuperAdminDep, db: DbDep) -> list[RoleOut]:
    return [
        RoleOut.model_validate(r) for r in (await db.execute(select(Role))).scalars()
    ]


@router.get("")
async def list_users(_: SuperAdminDep, db: DbDep) -> list[UserOut]:
    return [
        UserOut.model_validate(u)
        for u in (await db.execute(select(User).order_by(User.created_at))).scalars()
    ]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: UserCreateIn, request: Request, actor: SuperAdminDep, db: DbDep
) -> UserOut:
    exists = (
        await db.execute(
            select(func.count(User.id)).where(User.username == payload.username)
        )
    ).scalar_one()
    if exists:
        raise HTTPException(
            409,
            {"code": "username_taken", "message": "این نام کاربری قبلاً ثبت شده است."},
        )
    roles = await _roles_by_ids(db, payload.role_ids)
    user = User(
        username=payload.username,
        email=payload.email.strip().lower(),
        full_name=payload.full_name.strip(),
        password_hash=hash_password(payload.password),
        roles=roles,
    )
    db.add(user)
    await db.flush()
    await audit(
        db,
        actor=actor,
        action="user.create",
        entity="user",
        entity_id=user.id,
        detail={"username": payload.username},
        request=request,
    )
    await db.commit()
    return UserOut.model_validate(user)


@router.patch("/{user_id}")
async def update_user(
    user_id: uuid.UUID,
    payload: UserUpdateIn,
    request: Request,
    actor: SuperAdminDep,
    db: DbDep,
) -> UserOut:
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(404, {"code": "not_found", "message": "کاربر یافت نشد."})
    data = payload.model_dump(exclude_unset=True)

    # guard: never deactivate or demote the last active super_admin
    demoting = user.id == actor.id and (
        ("is_active" in data and not data["is_active"])
        or (
            "role_ids" in data
            and not any(
                r.name == "super_admin"
                for r in await _roles_by_ids(db, data["role_ids"])
            )
        )
    )
    if demoting:
        raise HTTPException(
            409,
            {
                "code": "self_lockout",
                "message": "نمی‌توانید دسترسی مدیر ارشد خودتان را حذف کنید.",
            },
        )

    if "full_name" in data:
        user.full_name = data["full_name"].strip()
    if "email" in data and data["email"] is not None:
        user.email = data["email"].strip().lower()
    if "is_active" in data:
        user.is_active = data["is_active"]
        # existing sessions stop working: auth dep rejects inactive users
    if "password" in data and data["password"]:
        user.password_hash = hash_password(data["password"])
    if "role_ids" in data:
        user.roles = await _roles_by_ids(db, data["role_ids"])
    await audit(
        db,
        actor=actor,
        action="user.update",
        entity="user",
        entity_id=user.id,
        detail={k: v for k, v in data.items() if k != "password"},
        request=request,
    )
    await db.commit()
    return UserOut.model_validate(user)
