"""Unified inbox / request-detail schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from ..ai.render import sanitize_display_text
from ..models.request_ops import CHANNELS, PRIORITIES, REQUEST_TYPES
from ..utils.phone import is_valid_iranian_phone, normalize_phone

RequestType = str


def _check_type(v: str) -> str:
    if v not in REQUEST_TYPES:
        raise ValueError("نوع درخواست نامعتبر است.")
    return v


class InboxRowOut(BaseModel):
    type: str
    id: UUID
    tracking_code: str
    name: str
    phone: str
    subject: str
    status: str
    priority: str
    assigned_to: UUID | None
    assignee_name: str
    labels: list[dict]
    unanswered: bool
    overdue: bool
    created_at: datetime
    updated_at: datetime
    sla_due_at: datetime | None


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    sender_type: str
    sender_id: UUID | None
    body: str
    is_note: bool
    attachments: list
    created_at: datetime

    @field_validator("body")
    @classmethod
    def _no_raw_json(cls, v: str) -> str:
        # legacy rows may embed `[key] {json}` blocks — never surface them
        return sanitize_display_text(v)


class EventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    event_type: str
    actor_username: str
    payload: dict
    created_at: datetime


class DeliveryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    channel: str
    provider: str
    recipient: str
    status: str
    attempts: int
    last_error: str
    sent_at: datetime | None
    created_at: datetime


class RequestDetailOut(BaseModel):
    type: str
    request: dict
    messages: list[MessageOut]
    events: list[EventOut]
    deliveries: list[DeliveryOut]
    labels: list[dict]
    allowed_transitions: list[str]
    requester: dict


class StaffMessageIn(BaseModel):
    body: str = Field(min_length=1, max_length=5000)
    is_note: bool = False
    channels: list[str] = Field(default_factory=lambda: ["track"])
    attachment_ids: list[UUID] = Field(default_factory=list)

    @field_validator("channels")
    @classmethod
    def _channels(cls, v: list[str]) -> list[str]:
        bad = [c for c in v if c not in CHANNELS]
        if bad:
            raise ValueError("کانال نامعتبر است.")
        return v or ["track"]


class StatusIn(BaseModel):
    status: str = Field(min_length=2, max_length=30)
    reason: str = Field(default="", max_length=300)
    # registered fee — basis for percent commissions when accepting a case
    fee_amount: int | None = Field(default=None, ge=0)


class RequestPatchIn(BaseModel):
    priority: str | None = None
    assigned_to: UUID | None = None
    label_ids: list[UUID] | None = None

    @field_validator("priority")
    @classmethod
    def _priority(cls, v: str | None) -> str | None:
        if v is not None and v not in PRIORITIES:
            raise ValueError("اولویت نامعتبر است.")
        return v


class LabelIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    color: str = Field(default="gold", max_length=16)


class LabelOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    color: str
    created_at: datetime


class ContactIn(BaseModel):
    """Public contact/callback request — `website` is the honeypot."""

    full_name: str = Field(min_length=2, max_length=120)
    phone: str = Field(min_length=5, max_length=40)
    email: str = Field(default="", max_length=255)
    subject: str = Field(default="", max_length=200)
    message: str = Field(default="", max_length=5000)
    preferred_time: str = Field(default="", max_length=80)
    source_page: str = Field(default="", max_length=120)
    website: str = Field(default="", max_length=200)

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str) -> str:
        normalized = normalize_phone(v)
        if not is_valid_iranian_phone(normalized):
            raise ValueError("شماره تماس معتبر نیست.")
        return normalized


class ContactCreatedOut(BaseModel):
    tracking_code: str
    access_code: str
    message: str = "درخواست شما ثبت شد؛ کد پیگیری را نگه دارید."


class TrackIn(BaseModel):
    """code + credential — credential is the access code OR the phone number."""

    code: str = Field(min_length=4, max_length=32)
    credential: str = Field(min_length=4, max_length=40)


class TrackReplyIn(BaseModel):
    code: str = Field(min_length=4, max_length=32)
    credential: str = Field(min_length=4, max_length=40)
    body: str = Field(min_length=1, max_length=5000)


class TrackPublicOut(BaseModel):
    type: str
    code: str
    subject: str
    status: str
    created_at: datetime
    messages: list[MessageOut]


_SLUG = r"^[A-Za-z0-9\u0600-\u06FF][A-Za-z0-9\u0600-\u06FF_-]*$"
_ARTICLE_STATUS = "^(draft|scheduled|published|archived)$"


class ArticleIn(BaseModel):
    slug: str = Field(min_length=2, max_length=120, pattern=_SLUG)
    title: str = Field(min_length=2, max_length=200)
    excerpt: str = Field(default="", max_length=500)
    body: str = Field(default="", max_length=60000)
    seo_title: str = Field(default="", max_length=200)
    seo_description: str = Field(default="", max_length=300)
    canonical: str = Field(default="", max_length=300)
    category: str = Field(default="", max_length=80)
    tags: list[str] = Field(default_factory=list, max_length=20)
    author_name: str = Field(default="", max_length=120)
    author_bio: str = Field(default="", max_length=500)
    featured_image_id: UUID | None = None
    status: str = Field(default="draft", pattern=_ARTICLE_STATUS)
    scheduled_at: datetime | None = None


class ArticlePatchIn(BaseModel):
    slug: str | None = Field(default=None, min_length=2, max_length=120, pattern=_SLUG)
    title: str | None = Field(default=None, min_length=2, max_length=200)
    excerpt: str | None = Field(default=None, max_length=500)
    body: str | None = Field(default=None, max_length=60000)
    seo_title: str | None = Field(default=None, max_length=200)
    seo_description: str | None = Field(default=None, max_length=300)
    canonical: str | None = Field(default=None, max_length=300)
    category: str | None = Field(default=None, max_length=80)
    tags: list[str] | None = Field(default=None, max_length=20)
    author_name: str | None = Field(default=None, max_length=120)
    author_bio: str | None = Field(default=None, max_length=500)
    featured_image_id: UUID | None = None
    clear_featured_image: bool = False
    status: str | None = Field(default=None, pattern=_ARTICLE_STATUS)
    scheduled_at: datetime | None = None


class ArticleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    slug: str
    title: str
    excerpt: str
    body: str
    seo_title: str
    seo_description: str
    canonical: str
    category: str
    tags: list
    author_name: str
    author_bio: str
    featured_image_id: UUID | None
    read_time_min: int
    status: str
    scheduled_at: datetime | None
    published_at: datetime | None
    created_at: datetime
    updated_at: datetime
