"""Ticket schemas — public-safe views never expose staff notes."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from ..models.ticket import PRIORITIES, TICKET_STATUSES
from ..utils.phone import is_valid_iranian_phone, normalize_phone


class TicketCreateIn(BaseModel):
    requester_name: str = Field(min_length=2, max_length=120)
    requester_phone: str = Field(min_length=5, max_length=40)
    requester_email: str = Field(default="", max_length=255)
    subject: str = Field(min_length=3, max_length=200)
    category: str = Field(default="other", max_length=60)
    body: str = Field(min_length=5, max_length=5000)
    website: str = Field(default="", max_length=200)  # honeypot

    @field_validator("requester_phone")
    @classmethod
    def _phone(cls, v: str) -> str:
        normalized = normalize_phone(v)
        if not is_valid_iranian_phone(normalized):
            raise ValueError("شماره تماس معتبر نیست.")
        return normalized


class TicketCreatedOut(BaseModel):
    ticket_number: str
    access_code: str
    message: str = "تیکت شما ثبت شد؛ شماره و کد پیگیری را نگه دارید."


class TicketMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    sender_type: str
    body: str
    created_at: datetime


class TicketPublicOut(BaseModel):
    """What a customer sees — no staff notes, no internals."""

    ticket_number: str
    subject: str
    category: str
    status: str
    created_at: datetime
    messages: list[TicketMessageOut]


class TicketTrackIn(BaseModel):
    ticket_number: str = Field(min_length=4, max_length=20)
    access_code: str = Field(min_length=4, max_length=40)


class TicketReplyIn(BaseModel):
    ticket_number: str = Field(min_length=4, max_length=20)
    access_code: str = Field(min_length=4, max_length=40)
    body: str = Field(min_length=1, max_length=5000)


class TicketOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    ticket_number: str
    requester_name: str
    requester_phone: str
    requester_email: str
    subject: str
    category: str
    priority: str
    status: str
    assigned_to: UUID | None
    created_at: datetime
    updated_at: datetime
    messages: list[TicketMessageOut]


class TicketPatchIn(BaseModel):
    status: str | None = None
    priority: str | None = None
    assigned_to: UUID | None = None
    reason: str | None = None  # required when status → cancelled

    @field_validator("status")
    @classmethod
    def _status(cls, v: str | None) -> str | None:
        if v is not None and v not in TICKET_STATUSES:
            raise ValueError("وضعیت نامعتبر است.")
        return v

    @field_validator("priority")
    @classmethod
    def _priority(cls, v: str | None) -> str | None:
        if v is not None and v not in PRIORITIES:
            raise ValueError("اولویت نامعتبر است.")
        return v


class StaffReplyIn(BaseModel):
    body: str = Field(min_length=1, max_length=5000)
    is_note: bool = False  # internal note vs customer-visible reply
