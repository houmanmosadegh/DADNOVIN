"""Delivery dispatch — one OutboundDelivery row per (message × channel)."""

import uuid
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from ..models.request_ops import OutboundDelivery, RequestMessage
from ..services.thread import request_code, requester_email, requester_phone
from .providers import get_provider


async def _record(
    db: AsyncSession,
    msg: RequestMessage,
    *,
    channel: str,
    recipient: str,
    send_fn,
) -> OutboundDelivery:
    provider = get_provider()
    d = OutboundDelivery(
        message_id=msg.id,
        channel=channel,
        provider=provider.name,
        recipient=recipient,
        status="queued",
    )
    db.add(d)
    await db.flush()
    await _attempt(db, d, send_fn)
    return d


async def _attempt(db: AsyncSession, d: OutboundDelivery, send_fn) -> None:
    d.attempts += 1
    result = await send_fn()
    if result.ok:
        d.status = "sent"
        d.sent_at = datetime.now(UTC)
        d.last_error = ""
    else:
        d.status = "failed"
        d.last_error = result.error[:480]
    await db.flush()


async def dispatch_reply(
    db: AsyncSession,
    msg: RequestMessage,
    row,
    *,
    channels: list[str],
) -> list[OutboundDelivery]:
    """Queue+send a staff reply over the chosen channels.

    'track' needs no provider — the message is readable on the public /track
    thread, so its delivery is recorded sent immediately.
    """
    provider = get_provider()
    code = request_code(row)
    deliveries: list[OutboundDelivery] = []
    for channel in channels:
        if channel == "track":
            d = OutboundDelivery(
                message_id=msg.id,
                channel="track",
                provider="internal",
                recipient=code,
                status="sent",
                attempts=1,
                sent_at=datetime.now(UTC),
            )
            db.add(d)
            await db.flush()
            deliveries.append(d)
        elif channel == "email":
            to = requester_email(row)
            if not to:
                continue
            deliveries.append(
                await _record(
                    db,
                    msg,
                    channel="email",
                    recipient=to,
                    send_fn=lambda: provider.send_email(
                        to=to,
                        subject=f"پاسخ دادنوین — {code}",
                        body=msg.body,
                    ),
                )
            )
        elif channel == "sms":
            to = requester_phone(row)
            if not to:
                continue
            deliveries.append(
                await _record(
                    db,
                    msg,
                    channel="sms",
                    recipient=to,
                    send_fn=lambda: provider.send_sms(to=to, body=msg.body),
                )
            )
    return deliveries


async def retry_delivery(db: AsyncSession, delivery_id: uuid.UUID) -> OutboundDelivery:
    d = await db.get(OutboundDelivery, delivery_id)
    if d is None:
        raise KeyError(delivery_id)
    msg = await db.get(RequestMessage, d.message_id)
    provider = get_provider()
    if d.channel == "track":
        d.status, d.sent_at, d.attempts = "sent", datetime.now(UTC), d.attempts + 1
        await db.flush()
        return d
    send_fn = (
        (lambda: provider.send_email(to=d.recipient, subject="پیام دادنوین", body=msg.body))
        if d.channel == "email"
        else (lambda: provider.send_sms(to=d.recipient, body=msg.body))
    )
    await _attempt(db, d, send_fn)
    return d
