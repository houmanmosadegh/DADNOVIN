"""Support tickets + message thread."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db.base import Base, created_at_col, updated_at_col, uuid_pk

# جدید ← در حال بررسی ← در انتظار پاسخ ← حل شده ← بسته شده (+لغو)
TICKET_STATUSES = ("new", "reviewing", "waiting_reply", "resolved", "closed", "cancelled")
PRIORITIES = ("low", "normal", "high", "urgent")
SENDER_TYPES = ("customer", "staff", "note")


class Ticket(Base):
    __tablename__ = "tickets"

    id: Mapped[uuid.UUID] = uuid_pk()
    ticket_number: Mapped[str] = mapped_column(
        String(20), unique=True, index=True
    )
    # customers look tickets up with this code — only its hash is stored
    access_code_hash: Mapped[str] = mapped_column(String(128), default="")
    requester_name: Mapped[str] = mapped_column(String(120))
    requester_phone: Mapped[str] = mapped_column(String(40), index=True)
    requester_email: Mapped[str] = mapped_column(String(255), default="")
    subject: Mapped[str] = mapped_column(String(200))
    category: Mapped[str] = mapped_column(String(60), default="other")
    priority: Mapped[str] = mapped_column(String(20), default="normal")
    status: Mapped[str] = mapped_column(String(30), default="new", index=True)
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

    messages: Mapped[list["TicketMessage"]] = relationship(
        back_populates="ticket",
        cascade="all, delete-orphan",
        order_by="TicketMessage.created_at",
        lazy="selectin",
    )


class TicketMessage(Base):
    __tablename__ = "ticket_messages"

    id: Mapped[uuid.UUID] = uuid_pk()
    ticket_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("tickets.id", ondelete="CASCADE"), index=True
    )
    sender_type: Mapped[str] = mapped_column(String(20))
    sender_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = created_at_col()

    ticket: Mapped[Ticket] = relationship(back_populates="messages")
