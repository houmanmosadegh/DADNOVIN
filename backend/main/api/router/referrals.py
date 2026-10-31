"""Public referral endpoints — /r/CODE redirect, click capture + cookie."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.config import get_settings
from ...core.rate_limit import client_key, limiter
from ...db.session import get_db
from ...services import commissions as comm_svc
from ...services import referrals as ref_svc

router = APIRouter(prefix="/referrals", tags=["referrals"])
DbDep = Annotated[AsyncSession, Depends(get_db)]

REF_COOKIE = "dn_ref"
SRC_COOKIE = "dn_src"


async def _marketing_gate(db: DbDep) -> None:
    """marketing_enabled off → referral surface returns 404, no click stored."""
    if not await comm_svc.marketing_enabled(db):
        raise HTTPException(404, {"code": "not_found", "message": "یافت نشد."})


# where a bare /r/CODE can land — whitelist, never arbitrary redirects
_ALLOWED_TARGETS = {"/", "/contact", "/services", "/about", "/panel/auth"}


def _set_ref_cookie(
    response: Response, code: str, days: int, channel: str = ""
) -> None:
    settings = get_settings()
    response.set_cookie(
        REF_COOKIE,
        code,
        max_age=days * 86400,
        httponly=True,  # per spec — server reads it at submission
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )
    if channel:
        response.set_cookie(
            SRC_COOKIE,
            channel,
            max_age=days * 86400,
            httponly=True,
            secure=settings.cookie_secure,
            samesite="lax",
            path="/",
        )


@router.get("/r/{code}")
async def follow_link(
    code: str,
    request: Request,
    db: DbDep,
    s: Annotated[str, Query(max_length=20)] = "",
    src: Annotated[str, Query(max_length=40)] = "",
    to: Annotated[str, Query(max_length=200)] = "/",
) -> Response:
    """Short link — records the click, sets ref cookies, 302s to the site.

    `s` is a whitelisted channel (instagram/telegram/…); `src` a legacy label.
    `to` is a whitelisted landing page — no open redirects. Invalid and
    suspended codes behave identically (no enumeration).
    """
    limiter.check("ref_click", client_key(request), 120)
    code = code.strip().upper()
    await _marketing_gate(db)
    prof = await ref_svc.resolve_code(db, code)
    target = to if to in _ALLOWED_TARGETS else "/"
    if prof is None:
        return RedirectResponse(target, status_code=302)
    label = ref_svc.normalize_channel(s) or ref_svc.normalize_label(src)
    await ref_svc.record_click(
        db,
        code,
        ip=client_key(request),
        ua=request.headers.get("user-agent", ""),
        path=target,
        label=label,
    )
    await db.commit()
    cfg = await comm_svc.referral_settings(db)
    # ?refui= lets the SPA prefill the code without recording a second click
    sep = "&" if "?" in target else "?"
    resp = RedirectResponse(f"{target}{sep}refui={code}", status_code=302)
    _set_ref_cookie(resp, code, int(cfg.get("cookie_days", 30)), label)
    return resp


class ClickIn(BaseModel):
    code: str = Field(min_length=3, max_length=24)
    path: str = Field(default="/", max_length=200)
    label: str = Field(default="", max_length=40)


@router.post("/click", status_code=204)
async def record_click(
    payload: ClickIn, request: Request, response: Response, db: DbDep
):
    """Record a `/?ref=` landing + set the referral cookie (admin-set TTL)."""
    await _marketing_gate(db)
    cfg = await comm_svc.referral_settings(db)
    code = payload.code.strip().upper()
    prof = await ref_svc.resolve_code(db, code)
    if prof is not None:
        await ref_svc.record_click(
            db,
            code,
            ip=client_key(request),
            ua=request.headers.get("user-agent", ""),
            path=payload.path,
            label=payload.label,
        )
        await db.commit()
        _set_ref_cookie(response, code, int(cfg.get("cookie_days", 30)))
    return Response(status_code=204)


@router.get("/validate/{code}")
async def validate_code(code: str, db: DbDep) -> dict:
    """Public validity probe — used by the forms to prefill/verify."""
    await _marketing_gate(db)
    prof = await ref_svc.resolve_code(db, code)
    return {"valid": prof is not None}
