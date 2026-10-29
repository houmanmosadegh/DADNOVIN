"""Public referral endpoints — click capture + cookie."""

from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.config import get_settings
from ...core.rate_limit import client_key
from ...db.session import get_db
from ...services import commissions as comm_svc
from ...services import referrals as ref_svc

router = APIRouter(prefix="/referrals", tags=["referrals"])
DbDep = Annotated[AsyncSession, Depends(get_db)]

REF_COOKIE = "dn_ref"


class ClickIn(BaseModel):
    code: str = Field(min_length=3, max_length=24)
    path: str = Field(default="/", max_length=200)


@router.post("/click", status_code=204)
async def record_click(
    payload: ClickIn, request: Request, response: Response, db: DbDep
):
    """Record a `/?ref=` landing + set the referral cookie (admin-set TTL)."""
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
        )
        await db.commit()
        response.set_cookie(
            REF_COOKIE,
            code,
            max_age=int(cfg.get("cookie_days", 30)) * 86400,
            httponly=False,  # JS-readable — the forms prefill from it
            secure=get_settings().cookie_secure,
            samesite="lax",
            path="/",
        )
    return Response(status_code=204)


@router.get("/validate/{code}")
async def validate_code(code: str, db: DbDep) -> dict:
    """Public validity probe — used by the forms to prefill/verify."""
    prof = await ref_svc.resolve_code(db, code)
    return {"valid": prof is not None}
