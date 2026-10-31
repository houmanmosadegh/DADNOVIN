"""Account, referral and commission models.

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
    channel: Mapped[str] = mapped_column(String(200), default="")
    accepted_terms: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    # pending | approved | rejected
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    review_note: Mapped[str] = mapped_column(Text, default="")
    # version of the terms text the applicant accepted (0 = legacy/pre-versioning)
    terms_version: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = created_at_col()


class MarketingTerms(Base):
    """Versioned terms & conditions for the marketing programme.

    Rows are append-only: editing creates a new version and deactivates the
    old one, so past acceptances always resolve to the text that was shown.
    """

    __tablename__ = "marketing_terms"

    id: Mapped[uuid.UUID] = uuid_pk()
    version: Mapped[int] = mapped_column(Integer, unique=True, index=True)
    body: Mapped[str] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    created_at: Mapped[datetime] = created_at_col()


class MarketerProfile(Base):
    """Approved marketer: immutable referral code + bank coordinates."""

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
    # optional per-marketer commission percent (0..100); NULL = global default
    custom_rate: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # terms the marketer accepted — copied from the application at approval
    accepted_terms_version: Mapped[int] = mapped_column(Integer, default=0)
    accepted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = created_at_col()
    updated_at: Mapped[datetime] = updated_at_col()


class ReferralLink(Base):
    """A marketer's labeled referral link — same ref_code, per-source stats."""

    __tablename__ = "referral_links"

    id: Mapped[uuid.UUID] = uuid_pk()
    marketer_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("marketer_profiles.id", ondelete="CASCADE"), index=True
    )
    # source label embedded in the URL as ?src= (e.g. instagram, telegram)
    label: Mapped[str] = mapped_column(String(80))
    created_at: Mapped[datetime] = created_at_col()

    __table_args__ = (
        UniqueConstraint("marketer_id", "label", name="uq_ref_link_label"),
    )


class ReferralClick(Base):
    """Landing via /r/CODE or /?ref=CODE — raw signal for marketer stats."""

    __tablename__ = "referral_clicks"

    id: Mapped[uuid.UUID] = uuid_pk()
    ref_code: Mapped[str] = mapped_column(String(24), index=True)
    link_label: Mapped[str] = mapped_column(String(80), default="", index=True)
    ip: Mapped[str] = mapped_column(String(45), default="")
    user_agent: Mapped[str] = mapped_column(String(300), default="")
    # sha256(ip+ua) — lets us count unique visitors without storing raw identity
    visitor_hash: Mapped[str] = mapped_column(String(64), default="", index=True)
    landing_path: Mapped[str] = mapped_column(String(200), default="/")
    # anti-fraud: suspicious clicks are recorded but excluded from conversion stats
    suspicious: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    suspicious_reason: Mapped[str] = mapped_column(String(200), default="")
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
    # '' = clean | 'review' = flagged, no commission until an admin clears it
    flag: Mapped[str] = mapped_column(String(20), default="", index=True)
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
    # clamps: 0 = unbounded; result is clamped to [min_amount, max_amount]
    min_amount: Mapped[int] = mapped_column(BigInteger, default=0)
    max_amount: Mapped[int] = mapped_column(BigInteger, default=0)
    # validity window — NULL bounds mean open-ended; applies to new commissions only
    starts_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    ends_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_at: Mapped[datetime] = created_at_col()


class CaseFeeReceipt(Base):
    """A payment of the office's attorney fee received on a case (installments
    allowed) — each receipt accrues one commission entry for the referrer."""

    __tablename__ = "case_fee_receipts"

    id: Mapped[uuid.UUID] = uuid_pk()
    request_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("consultation_requests.id", ondelete="CASCADE"), index=True
    )
    amount: Mapped[int] = mapped_column(BigInteger)  # rials received by the office
    note: Mapped[str] = mapped_column(String(300), default="")
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    created_at: Mapped[datetime] = created_at_col()


class Commission(Base):
    """Append-only commission ledger — rows are never deleted or re-computed.

    entry_type:
      accrual  — one per CaseFeeReceipt (positive, basis = receipt amount)
      reversal — negative entry when a fee is refunded / the case unravels
    Status lifecycle on accruals: pending → approved → paid | cancelled.
    """

    __tablename__ = "commissions"

    id: Mapped[uuid.UUID] = uuid_pk()
    marketer_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("marketer_profiles.id"), index=True
    )
    request_type: Mapped[str] = mapped_column(String(20))
    request_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    # attribution row that linked this case to the marketer (provenance)
    referral_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("referral_attributions.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )
    # accrual | reversal
    entry_type: Mapped[str] = mapped_column(String(10), default="accrual", index=True)
    # for accruals: the receipt this entry was created from (idempotency key)
    receipt_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("case_fee_receipts.id", ondelete="SET NULL"),
        nullable=True, unique=True,
    )
    # for reversals: the accrual being reversed
    parent_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    basis_kind: Mapped[str] = mapped_column(String(10), default="percent")
    basis_amount: Mapped[int] = mapped_column(BigInteger, default=0)  # received fee
    # commission rate at creation, basis points (1500 = 15%) — snapshotted
    rate_bp: Mapped[int] = mapped_column(Integer, default=0)
    amount: Mapped[int] = mapped_column(BigInteger, default=0)  # signed rials
    # pending → approved → paid | cancelled (manual settlement, no wallet)
    status: Mapped[str] = mapped_column(String(15), default="pending", index=True)
    hold_until: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )  # legacy column — new rows leave it NULL
    paid_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    paid_note: Mapped[str] = mapped_column(String(300), default="")
    paid_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    # JSON snapshot of the rate source applied at creation
    rule_snapshot: Mapped[str] = mapped_column(Text, default="")
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
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


class OtpToken(Base):
    """Phone-verification code — OTP-ready; provider-agnostic (mock/log for now)."""

    __tablename__ = "otp_tokens"

    id: Mapped[uuid.UUID] = uuid_pk()
    phone: Mapped[str] = mapped_column(String(20), index=True)
    code_hash: Mapped[str] = mapped_column(String(64))
    purpose: Mapped[str] = mapped_column(String(20), default="register")
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(
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
