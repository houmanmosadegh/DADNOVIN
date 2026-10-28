"""Authentication endpoints — cookie sessions, Argon2, rate-limited login."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.config import get_settings
from ...core.rate_limit import client_key, limiter
from ...db.session import get_db
from ...models.user import User
from ...schemas.auth import LoginIn, MeOut
from ...security.passwords import verify_password
from ...security.sessions import create_session, get_valid_session, revoke_session
from ...services.audit import audit
from ..dependencies.auth import CurrentAuth

router = APIRouter(prefix="/auth", tags=["auth"])
DbDep = Annotated[AsyncSession, Depends(get_db)]


@router.post("/login")
async def login(payload: LoginIn, request: Request, response: Response, db: DbDep) -> MeOut:
    """Verify credentials and set the HttpOnly session cookie."""
    settings = get_settings()
    limiter.check("login", client_key(request), settings.rate_limit_login_per_minute)
    username = payload.username.strip().lower()
    user = (
        await db.execute(select(User).where(func.lower(User.username) == username))
    ).scalar_one_or_none()
    # generic message — do not reveal whether the account exists
    generic = HTTPException(
        status_code=401,
        detail={"code": "bad_credentials", "message": "نام کاربری یا رمز عبور نادرست است."},
    )
    if user is None or not user.is_active:
        raise generic
    if not verify_password(payload.password, user.password_hash):
        raise generic

    session, token = await create_session(
        db,
        user,
        ip=client_key(request),
        user_agent=request.headers.get("user-agent", "")[:300],
    )
    response.set_cookie(
        settings.session_cookie_name,
        token,
        max_age=settings.session_ttl_hours * 3600,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        path="/",
    )
    await audit(
        db, actor=user, action="auth.login", entity="session", entity_id=session.id, request=request
    )
    await db.commit()
    return MeOut.model_validate(user)


@router.post("/logout")
async def logout(request: Request, response: Response, db: DbDep):
    """Revoke the current session (if any) and clear the cookie."""
    settings = get_settings()
    token = request.cookies.get(settings.session_cookie_name, "")
    if token:
        session = await get_valid_session(db, token)
        if session is not None:
            await revoke_session(db, session)
        response.delete_cookie(settings.session_cookie_name, path="/")
        await db.commit()
    return {"message": "خارج شدید."}


@router.get("/me")
async def me(auth: CurrentAuth) -> MeOut:
    """Current user profile — used by the panel to guard routes."""
    return MeOut.model_validate(auth[1])
