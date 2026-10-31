"""Public consultation submission."""

import asyncio
from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from ...ai.service import consultation_draft
from ...core.config import get_settings
from ...core.rate_limit import client_key, limiter
from ...db.session import get_db
from ...models.consultation import ConsultationRequest
from ...models.content import SiteSetting
from ...schemas.consultation import ConsultationCreatedOut, ConsultationIn
from ...security.passwords import hash_password
from ...services import commissions as comm_svc
from ...services import referrals as ref_svc
from ...services import thread as thread_svc
from ...utils.ids import access_code

router = APIRouter(prefix="/consultations", tags=["consultations"])
DbDep = Annotated[AsyncSession, Depends(get_db)]


@router.post("", status_code=status.HTTP_201_CREATED)
async def submit_consultation(
    payload: ConsultationIn, request: Request, response: Response, db: DbDep
) -> ConsultationCreatedOut:
    """Persist a public consultation request.

    The `website` honeypot field must stay empty; spam that fills it is
    accepted silently but never stored.
    """
    limiter.check(
        "consult_submit", client_key(request), get_settings().rate_limit_public_post_per_minute
    )
    if payload.website:
        response.status_code = status.HTTP_201_CREATED
        return ConsultationCreatedOut(id="00000000-0000-0000-0000-000000000000")
    code_str = access_code()
    row = ConsultationRequest(
        tracking_code=await thread_svc.next_tracking_code(db, "consultation"),
        access_code_hash=hash_password(code_str),
        full_name=payload.full_name.strip(),
        phone=payload.phone,
        email=payload.email.strip(),
        service_slug=payload.service_slug.strip(),
        topic=payload.topic.strip(),
        message=payload.message.strip(),
        source_page=payload.source_page.strip(),
        client_ip=client_key(request),
        client_ua=request.headers.get("user-agent", "")[:300],
    )
    db.add(row)
    await db.flush()
    await thread_svc.stamp_sla(db, "consultation", row)
    await _maybe_attribute(db, row, payload, request)
    await thread_svc.add_event(
        db, "consultation", row.id, "created", payload={"source": row.source_page}
    )
    await _attach_ai_first_reply(db, row)
    await db.commit()
    return ConsultationCreatedOut(
        id=row.id, tracking_code=row.tracking_code, access_code=code_str
    )


AI_HEADER = "دستیار هوشمند دادنوین — پاسخ اولیهٔ اطلاعاتی:"

REF_COOKIE = "dn_ref"


async def _maybe_attribute(
    db: AsyncSession, row: ConsultationRequest, payload, request: Request
) -> None:
    """Attribute the request to a marketer when a valid code exists.

    Form field wins over the referral cookie (user can edit/clear it).
    Anti-fraud inside `attribution_block_reason` silently skips
    self-referrals and non-new clients — submission never fails on it.
    """
    code = (payload.ref_code or request.cookies.get(REF_COOKIE, "")).strip().upper()
    if not code or not await comm_svc.marketing_enabled(db):
        return
    prof = await ref_svc.resolve_code(db, code)
    if prof is None:
        return
    reason = await ref_svc.attribution_block_reason(
        db, prof, phone=row.phone, user=None, exclude_request_id=row.id
    )
    if reason:
        await thread_svc.add_event(
            db, "consultation", row.id, "referral_blocked", payload={"reason": reason}
        )
        return
    await ref_svc.attribute(
        db,
        prof,
        request_type="consultation",
        request_id=row.id,
        ip=row.client_ip,
        ua=row.client_ua,
    )
    row.ref_code = code
    row.referrer_id = prof.id
    await thread_svc.add_event(
        db, "consultation", row.id, "referred", payload={"ref_code": code}
    )


async def _ai_auto_reply_enabled(db: AsyncSession) -> bool:
    row = await db.get(SiteSetting, "ai")
    cfg = row.value if row and isinstance(row.value, dict) else {}
    return cfg.get("enabled", True) and cfg.get("auto_reply", True)


async def _attach_ai_first_reply(db: AsyncSession, row: ConsultationRequest) -> None:
    """Add one assistant message with initial legal information.

    Never blocks or fails submission — any problem just skips the reply.
    Status stays `new` so a human specialist still answers for real.
    """
    settings = get_settings()
    if not settings.ai_enabled:
        return
    try:
        if not await _ai_auto_reply_enabled(db):
            return
        reply = await asyncio.wait_for(
            consultation_draft(
                db,
                topic=row.topic,
                service_slug=row.service_slug,
                message=row.message,
            ),
            timeout=settings.ai_timeout_seconds,
        )
    except Exception:
        return
    if not reply:
        return
    msg = await thread_svc.add_message(
        db,
        "consultation",
        row.id,
        sender_type="assistant",
        sender_id=None,
        body=f"{AI_HEADER}\n\n{reply}",
    )
    await thread_svc.add_event(
        db, "consultation", row.id, "ai_reply", payload={"message_id": str(msg.id)}
    )
