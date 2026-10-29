"""Append-only wallet ledger — balance is always derived, entries are idempotent."""

import uuid

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.account import WalletEntry


async def append_entry(
    db: AsyncSession,
    marketer_id: uuid.UUID,
    *,
    kind: str,
    amount: int,
    ref_type: str = "",
    ref_id: uuid.UUID | None = None,
    memo: str = "",
    actor_id: uuid.UUID | None = None,
    idem_key: str,
) -> WalletEntry:
    """Insert one signed ledger row; duplicate idem_key returns the original."""
    entry = WalletEntry(
        marketer_id=marketer_id,
        kind=kind,
        amount=amount,
        ref_type=ref_type,
        ref_id=ref_id,
        memo=memo[:300],
        actor_id=actor_id,
        idempotency_key=idem_key,
    )
    db.add(entry)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        existing = (
            await db.execute(
                select(WalletEntry).where(WalletEntry.idempotency_key == idem_key)
            )
        ).scalar_one_or_none()
        if existing is not None:
            return existing
        raise
    return entry


async def balance(db: AsyncSession, marketer_id: uuid.UUID) -> int:
    return (
        await db.execute(
            select(func.coalesce(func.sum(WalletEntry.amount), 0)).where(
                WalletEntry.marketer_id == marketer_id
            )
        )
    ).scalar_one()


async def entries(db: AsyncSession, marketer_id: uuid.UUID, limit: int = 100):
    return (
        await db.execute(
            select(WalletEntry)
            .where(WalletEntry.marketer_id == marketer_id)
            .order_by(WalletEntry.created_at.desc())
            .limit(limit)
        )
    ).scalars().all()


def must_be_signed(kind: str, amount: int) -> None:
    expected = {"commission_credit": 1, "payout_debit": -1, "adjustment": 0}
    sign = expected.get(kind)
    if sign is None:
        raise HTTPException(400, {"code": "bad_kind", "message": "نوع تراکنش نامعتبر است."})
    if sign and amount * sign <= 0:
        raise HTTPException(
            400, {"code": "bad_sign", "message": "علامت مبلغ با نوع تراکنش ناسازگار است."}
        )
