"""In-app notifications for user accounts."""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from ..models.account import InboxNotification


async def notify(
    db: AsyncSession,
    user_id: uuid.UUID | None,
    *,
    title: str,
    body: str = "",
    kind: str = "info",
    link: str = "",
) -> InboxNotification | None:
    if user_id is None:
        return None
    n = InboxNotification(
        user_id=user_id, title=title[:200], body=body[:2000], kind=kind[:30], link=link[:200]
    )
    db.add(n)
    await db.flush()
    return n
