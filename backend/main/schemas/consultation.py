"""Consultation request schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from ..models.consultation import STATUSES
from ..utils.phone import is_valid_iranian_phone, normalize_phone


class ConsultationIn(BaseModel):
    """Public submission — `website` is the honeypot."""

    full_name: str = Field(min_length=2, max_length=120)
    phone: str = Field(min_length=5, max_length=40)
    email: str = Field(default="", max_length=255)
    service_slug: str = Field(default="", max_length=80)
    topic: str = Field(default="", max_length=200)
    message: str = Field(default="", max_length=5000)
    source_page: str = Field(default="", max_length=120)
    ref_code: str = Field(default="", max_length=24)  # optional referrer code
    website: str = Field(default="", max_length=200)  # honeypot

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str) -> str:
        normalized = normalize_phone(v)
        if not is_valid_iranian_phone(normalized):
            raise ValueError("شماره تماس معتبر نیست.")
        return normalized


class ConsultationCreatedOut(BaseModel):
    id: UUID
    tracking_code: str = ""
    access_code: str = ""
    message: str = "درخواست شما ثبت شد؛ کد پیگیری را نگه دارید."


class NoteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    author_id: UUID | None
    body: str
    created_at: datetime


class ConsultationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tracking_code: str
    full_name: str
    phone: str
    email: str
    service_slug: str
    topic: str
    message: str
    status: str
    priority: str
    source_page: str
    assigned_to: UUID | None
    created_at: datetime
    updated_at: datetime
    notes: list[NoteOut]


class ConsultationPatchIn(BaseModel):
    status: str | None = None
    assigned_to: UUID | None = None
    reason: str | None = None  # required when status → cancelled

    @field_validator("status")
    @classmethod
    def _status(cls, v: str | None) -> str | None:
        if v is not None and v not in STATUSES:
            raise ValueError(f"وضعیت باید یکی از {', '.join(STATUSES)} باشد.")
        return v


class NoteIn(BaseModel):
    body: str = Field(min_length=1, max_length=4000)
