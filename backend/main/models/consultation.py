"""Consultation requests submitted from the public site."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db.base import Base, created_at_col, updated_at_col, uuid_pk

# جدید ← در حال بررسی ← در انتظار تماس ← پیگیری شده ← مشاوره انجام شد ←
# پذیرفته شد | رد شد | تکمیل شده (+لغو)
STATUSES = (
    "new", "reviewing", "awaiting_call", "followed_up", "consulted",
    "accepted", "rejected", "completed", "cancelled",
)


class ConsultationRequest(Base):
    __tablename__ = "consultation_requests"

    id: Mapped[uuid.UUID] = uuid_pk()
    tracking_code: Mapped[str] = mapped_column(
        String(32), unique=True, index=True, default=""
    )
    access_code_hash: Mapped[str] = mapped_column(String(128), default="")
    full_name: Mapped[str] = mapped_column(String(120))
    phone: Mapped[str] = mapped_column(String(40), index=True)
    email: Mapped[str] = mapped_column(String(255), default="")
    service_slug: Mapped[str] = mapped_column(String(80), default="")
    topic: Mapped[str] = mapped_column(String(200), default="")
    message: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(30), default="new", index=True)
    priority: Mapped[str] = mapped_column(String(20), default="normal")
    source_page: Mapped[str] = mapped_column(String(120), default="")
    # public account that owns this request (claimed or logged-in submit)
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # referral attribution snapshot — written once at creation
    ref_code: Mapped[str] = mapped_column(String(24), default="")
    referrer_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    client_ip: Mapped[str] = mapped_column(String(45), default="")
    client_ua: Mapped[str] = mapped_column(String(300), default="")
    # admin-set fee basis for percent commissions (rials)
    fee_amount: Mapped[int] = mapped_column(default=0)
    assigned_to: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    cancel_reason: Mapped[str] = mapped_column(String(300), default="")
    first_response_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_response_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    sla_due_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )
    created_at: Mapped[datetime] = created_at_col()
    updated_at: Mapped[datetime] = updated_at_col()

    notes: Mapped[list["ConsultationNote"]] = relationship(
        back_populates="request",
        cascade="all, delete-orphan",
        order_by="ConsultationNote.created_at",
        lazy="selectin",
    )


class ConsultationNote(Base):
    """Private staff notes — never exposed by public endpoints."""

    __tablename__ = "consultation_notes"

    id: Mapped[uuid.UUID] = uuid_pk()
    request_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("consultation_requests.id", ondelete="CASCADE"),
        index=True,
    )
    author_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = created_at_col()

    request: Mapped[ConsultationRequest] = relationship(back_populates="notes")
