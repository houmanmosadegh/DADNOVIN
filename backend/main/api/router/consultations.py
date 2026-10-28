"""Public consultation submission."""

from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.config import get_settings
from ...core.rate_limit import client_key, limiter
from ...db.session import get_db
from ...models.consultation import ConsultationRequest
from ...schemas.consultation import ConsultationCreatedOut, ConsultationIn
from ...security.passwords import hash_password
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
    )
    db.add(row)
    await db.flush()
    await thread_svc.stamp_sla(db, "consultation", row)
    await thread_svc.add_event(
        db, "consultation", row.id, "created", payload={"source": row.source_page}
    )
    await db.commit()
    return ConsultationCreatedOut(
        id=row.id, tracking_code=row.tracking_code, access_code=code_str
    )
