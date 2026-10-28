"""Authentication + RBAC dependencies."""

from typing import Annotated

from fastapi import Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.config import get_settings
from ...db.session import get_db
from ...models.user import Session, User
from ...security.sessions import get_valid_session


async def get_current_session(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> tuple[Session, User]:
    token = request.cookies.get(get_settings().session_cookie_name, "")
    if not token:
        raise HTTPException(
            status_code=401,
            detail={"code": "unauthenticated", "message": "وارد نشده‌اید."},
        )
    session = await get_valid_session(db, token)
    if session is None:
        raise HTTPException(
            status_code=401,
            detail={"code": "unauthenticated", "message": "نشست منقضی شده است؛ دوباره وارد شوید."},
        )
    user = await db.get(User, session.user_id)
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=401,
            detail={"code": "unauthenticated", "message": "حساب کاربری فعال نیست."},
        )
    return session, user


CurrentAuth = Annotated[tuple[Session, User], Depends(get_current_session)]


async def get_current_user(auth: CurrentAuth) -> User:
    return auth[1]


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_roles(*names: str):
    """Dependency — requester must hold at least one of the given roles."""

    async def _dep(user: CurrentUser) -> User:
        if not any(r in user.role_names for r in names):
            raise HTTPException(
                status_code=403,
                detail={"code": "forbidden", "message": "دسترسی کافی ندارید."},
            )
        return user

    return _dep


# convenience guards
any_admin = require_roles("super_admin", "admin", "editor", "support")
manage_users = require_roles("super_admin")
manage_content = require_roles("super_admin", "admin", "editor")
manage_requests = require_roles("super_admin", "admin", "support")

AdminDep = Annotated[User, Depends(any_admin)]
EditorDep = Annotated[User, Depends(manage_content)]
SupportDep = Annotated[User, Depends(manage_requests)]
SuperAdminDep = Annotated[User, Depends(manage_users)]
