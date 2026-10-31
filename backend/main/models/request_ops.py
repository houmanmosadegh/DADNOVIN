"""Unified request operations — contacts, shared thread, events, labels, deliveries.

Three public request aggregates (consultations, tickets, contacts) keep their own
tables for backwards compatibility, but conversation/thread/notification data
lives in these shared polymorphic tables so the admin inbox treats them alike.
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db.base import Base, created_at_col, updated_at_col, uuid_pk

# request_type discriminator used across the shared tables
REQUEST_TYPES = ("consultation", "ticket", "contact")

CONTACT_STATUSES = ("new", "contacted", "completed", "cancelled")

SENDER_TYPES = ("customer", "staff", "system")
CHANNELS = ("track", "email", "sms")
DELIVERY_STATUSES = ("queued", "sent", "failed")

PRIORITIES = ("low", "normal", "high", "urgent")

# allowed status transitions per request type — the API validates against this
TRANSITIONS: dict[str, dict[str, frozenset[str]]] = {
    "consultation": {
        "new": frozenset({"reviewing", "cancelled"}),
        "reviewing": frozenset(
            {"awaiting_call", "consulted", "completed", "cancelled"}
        ),
        "awaiting_call": frozenset(
            {"reviewing", "followed_up", "consulted", "completed", "cancelled"}
        ),
        "followed_up": frozenset(
            {"awaiting_call", "consulted", "completed", "cancelled"}
        ),
        "consulted": frozenset({"accepted", "rejected", "completed", "cancelled"}),
        # پذیرفته‌شده فقط به سرنوشت نهایی می‌رود — کمیسیون در «لغو» باطل می‌شود
        "accepted": frozenset({"completed", "cancelled"}),
        "rejected": frozenset(),
        "completed": frozenset(),
        "cancelled": frozenset({"new"}),
    },
    "ticket": {
        "new": frozenset({"reviewing", "cancelled"}),
        "reviewing": frozenset({"waiting_reply", "resolved", "cancelled"}),
        "waiting_reply": frozenset({"reviewing", "resolved", "cancelled"}),
        "resolved": frozenset({"closed", "reviewing"}),
        "closed": frozenset({"reviewing"}),
        "cancelled": frozenset({"new"}),
    },
    "contact": {
        "new": frozenset({"contacted", "cancelled"}),
        "contacted": frozenset({"completed", "new", "cancelled"}),
        "completed": frozenset(),
        "cancelled": frozenset({"new"}),
    },
}


class ContactRequest(Base):
    """Callback/contact request from the public contact form."""

    __tablename__ = "contact_requests"

    id: Mapped[uuid.UUID] = uuid_pk()
    tracking_code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    access_code_hash: Mapped[str] = mapped_column(String(128), default="")
    full_name: Mapped[str] = mapped_column(String(120))
    phone: Mapped[str] = mapped_column(String(40), index=True)
    email: Mapped[str] = mapped_column(String(255), default="")
    subject: Mapped[str] = mapped_column(String(200), default="")
    message: Mapped[str] = mapped_column(Text, default="")
    preferred_time: Mapped[str] = mapped_column(String(80), default="")
    status: Mapped[str] = mapped_column(String(30), default="new", index=True)
    priority: Mapped[str] = mapped_column(String(20), default="normal")
    source_page: Mapped[str] = mapped_column(String(120), default="")
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


class RequestMessage(Base):
    """Customer-visible and internal messages for any request type."""

    __tablename__ = "request_messages"

    id: Mapped[uuid.UUID] = uuid_pk()
    request_type: Mapped[str] = mapped_column(String(20), index=True)
    request_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    sender_type: Mapped[str] = mapped_column(String(20))  # customer|staff|system
    sender_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    body: Mapped[str] = mapped_column(Text)
    is_note: Mapped[bool] = mapped_column(Boolean, default=False)
    attachments: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = created_at_col()

    deliveries: Mapped[list["OutboundDelivery"]] = relationship(
        back_populates="message",
        cascade="all, delete-orphan",
        order_by="OutboundDelivery.created_at",
        lazy="selectin",
    )


class RequestEvent(Base):
    """System timeline events — status changes, assignments, calls, deliveries."""

    __tablename__ = "request_events"

    id: Mapped[uuid.UUID] = uuid_pk()
    request_type: Mapped[str] = mapped_column(String(20), index=True)
    request_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    event_type: Mapped[str] = mapped_column(String(40), index=True)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    actor_username: Mapped[str] = mapped_column(String(255), default="")
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = created_at_col()


class Label(Base):
    __tablename__ = "labels"

    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(String(60), unique=True, index=True)
    color: Mapped[str] = mapped_column(String(16), default="gold")
    created_at: Mapped[datetime] = created_at_col()


class RequestLabel(Base):
    __tablename__ = "request_labels"
    __table_args__ = (
        UniqueConstraint(
            "request_type", "request_id", "label_id", name="uq_request_label"
        ),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    request_type: Mapped[str] = mapped_column(String(20), index=True)
    request_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    label_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("labels.id", ondelete="CASCADE"), index=True
    )
    created_at: Mapped[datetime] = created_at_col()

    label: Mapped[Label] = relationship(lazy="joined")


class OutboundDelivery(Base):
    """One delivery attempt per (message × channel) — queued/sent/failed."""

    __tablename__ = "outbound_deliveries"

    id: Mapped[uuid.UUID] = uuid_pk()
    message_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("request_messages.id", ondelete="CASCADE"), index=True
    )
    channel: Mapped[str] = mapped_column(String(16), index=True)
    provider: Mapped[str] = mapped_column(String(40), default="mock")
    recipient: Mapped[str] = mapped_column(String(255), default="")
    status: Mapped[str] = mapped_column(String(16), default="queued", index=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    last_error: Mapped[str] = mapped_column(String(500), default="")
    sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = created_at_col()

    message: Mapped[RequestMessage] = relationship(back_populates="deliveries")


class Article(Base):
    __tablename__ = "articles"

    id: Mapped[uuid.UUID] = uuid_pk()
    slug: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(200))
    excerpt: Mapped[str] = mapped_column(String(500), default="")
    body: Mapped[str] = mapped_column(Text, default="")
    seo_title: Mapped[str] = mapped_column(String(200), default="")
    seo_description: Mapped[str] = mapped_column(String(300), default="")
    canonical: Mapped[str] = mapped_column(String(300), default="")
    # legal specialty — خانواده / کیفری / ملکی / قراردادها / …
    category: Mapped[str] = mapped_column(String(80), default="", index=True)
    tags: Mapped[list] = mapped_column(JSON, default=list)
    author_name: Mapped[str] = mapped_column(String(120), default="")
    author_bio: Mapped[str] = mapped_column(String(500), default="")
    featured_image_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("media_assets.id", ondelete="SET NULL"), nullable=True
    )
    read_time_min: Mapped[int] = mapped_column(Integer, default=0)
    # draft | scheduled | published | archived
    status: Mapped[str] = mapped_column(String(20), default="draft", index=True)
    scheduled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    published_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = created_at_col()
    updated_at: Mapped[datetime] = updated_at_col()


class TrackingCounter(Base):
    """Per-(year,type) sequence for DN-YYYY-NNNN tracking codes."""

    __tablename__ = "tracking_counters"

    id: Mapped[uuid.UUID] = uuid_pk()
    year: Mapped[int] = mapped_column(Integer)
    request_type: Mapped[str] = mapped_column(String(20))
    seq: Mapped[int] = mapped_column(Integer, default=0)

    __table_args__ = (
        UniqueConstraint("year", "request_type", name="uq_tracking_counter"),
    )
