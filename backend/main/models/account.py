"""Account, referral, commission, wallet and payout models.

Public-facing `user`/`marketer` accounts share the `users` table with staff —
one identity model, RBAC decides visibility.
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    Uuid,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from ..db.base import Base, created_at_col, updated_at_col, uuid_pk


class MarketerApplication(Base):
    """A user's request to become a marketer — admin approves/rejects."""

    __tablename__ = "marketer_applications"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    note: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    # pending | approved | rejected
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    review_note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = created_at_col()


class MarketerProfile(Base):
    """Approved marketer: immutable referral code + payout coordinates."""

    __tablename__ = "marketer_profiles"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True
    )
    ref_code: Mapped[str] = mapped_column(String(24), unique=True, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # bank coordinates stored encrypted at rest; never returned whole to the UI
    iban_enc: Mapped[str] = mapped_column(Text, default="")
    card_enc: Mapped[str] = mapped_column(Text, default="")
    approved_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    # admin flag for suspicious activity — shown in the marketers list
    fraud_flag: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = created_at_col()
    updated_at: Mapped[datetime] = updated_at_col()


class ReferralClick(Base):
    """Landing via /?ref=CODE — raw signal for marketer stats."""

    __tablename__ = "referral_clicks"

    id: Mapped[uuid.UUID] = uuid_pk()
    ref_code: Mapped[str] = mapped_column(String(24), index=True)
    ip: Mapped[str] = mapped_column(String(45), default="")
    user_agent: Mapped[str] = mapped_column(String(300), default="")
    landing_path: Mapped[str] = mapped_column(String(200), default="/")
    created_at: Mapped[datetime] = created_at_col()


class ReferralAttribution(Base):
    """Immutable link: a request attributed to a marketer — admin-only edits."""

    __tablename__ = "referral_attributions"

    id: Mapped[uuid.UUID] = uuid_pk()
    marketer_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("marketer_profiles.id"), index=True
    )
    request_type: Mapped[str] = mapped_column(String(20))
    request_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    ref_code: Mapped[str] = mapped_column(String(24))
    ip: Mapped[str] = mapped_column(String(45), default="")
    user_agent: Mapped[str] = mapped_column(String(300), default="")
    created_at: Mapped[datetime] = created_at_col()

    __table_args__ = (
        UniqueConstraint(
            "request_type", "request_id", name="uq_attrib_request"
        ),
    )


class CommissionRule(Base):
    """Admin-managed commission rules; rows never deleted, only replaced."""

    __tablename__ = "commission_rules"

    id: Mapped[uuid.UUID] = uuid_pk()
    # fixed | percent
    kind: Mapped[str] = mapped_column(String(10), default="fixed")
    value: Mapped[int] = mapped_column(BigInteger, default=0)  # rials or %
    # optional tier: min accepted cases this rule applies to (e.g. 0/5/15)
    tier_min: Mapped[int] = mapped_column(Integer, default=0)
    marketer_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, nullable=True, index=True
    )  # per-marketer override; NULL = global
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_at: Mapped[datetime] = created_at_col()


class Commission(Base):
    __tablename__ = "commissions"

    id: Mapped[uuid.UUID] = uuid_pk()
    marketer_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("marketer_profiles.id"), index=True
    )
    request_type: Mapped[str] = mapped_column(String(20))
    request_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    basis_kind: Mapped[str] = mapped_column(String(10), default="fixed")
    basis_amount: Mapped[int] = mapped_column(BigInteger, default=0)  # fee set by admin (percent mode)
    amount: Mapped[int] = mapped_column(BigInteger, default=0)
    # pending → approved(withdrawable) | paid | cancelled
    status: Mapped[str] = mapped_column(String(15), default="pending", index=True)
    hold_until: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = created_at_col()
    updated_at: Mapped[datetime] = updated_at_col()

    __table_args__ = (
        UniqueConstraint("request_type", "request_id", name="uq_commission_request"),
    )


class WalletEntry(Base):
    """Append-only ledger — balance is derived, never stored."""

    __tablename__ = "wallet_ledger"

    id: Mapped[uuid.UUID] = uuid_pk()
    marketer_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("marketer_profiles.id"), index=True
    )
    # commission_credit | payout_debit | adjustment
    kind: Mapped[str] = mapped_column(String(20), index=True)
    amount: Mapped[int] = mapped_column(BigInteger)  # signed rials
    ref_type: Mapped[str] = mapped_column(String(20), default="")
    ref_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    memo: Mapped[str] = mapped_column(String(300), default="")
    actor_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    idempotency_key: Mapped[str] = mapped_column(String(80), unique=True)
    created_at: Mapped[datetime] = created_at_col()


class PayoutRequest(Base):
    __tablename__ = "payout_requests"

    id: Mapped[uuid.UUID] = uuid_pk()
    marketer_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("marketer_profiles.id"), index=True
    )
    amount: Mapped[int] = mapped_column(BigInteger)
    # pending → approved | paid | rejected
    status: Mapped[str] = mapped_column(String(15), default="pending", index=True)
    iban_masked: Mapped[str] = mapped_column(String(40), default="")
    payment_ref: Mapped[str] = mapped_column(String(80), default="")  # manual bank tracking no.
    reject_reason: Mapped[str] = mapped_column(String(300), default="")
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = created_at_col()
    updated_at: Mapped[datetime] = updated_at_col()


class InboxNotification(Base):
    """In-app notification for a user account."""

    __tablename__ = "inbox_notifications"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text, default="")
    kind: Mapped[str] = mapped_column(String(30), default="info")
    link: Mapped[str] = mapped_column(String(200), default="")
    read_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = created_at_col()


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = created_at_col()
