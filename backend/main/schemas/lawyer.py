"""Lawyer schemas — public view deliberately drops private fields."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from ..utils.phone import normalize_phone


class LawyerIn(BaseModel):
    slug: str = Field(min_length=2, max_length=80, pattern=r"^[a-z0-9-]+$")
    name: str = Field(min_length=2, max_length=120)
    title: str = Field(default="", max_length=120)
    bio: str = Field(default="", max_length=5000)
    specialties: list[str] = Field(default_factory=list, max_length=20)
    resume: dict = Field(default_factory=dict)
    portrait_path: str = Field(default="", max_length=300)
    portrait_media_id: UUID | None = None
    phone: str = Field(default="", max_length=40)
    email: str = Field(default="", max_length=255)
    is_visible: bool = True
    sort_order: int = 0


class LawyerUpdateIn(BaseModel):
    slug: str | None = Field(default=None, min_length=2, max_length=80, pattern=r"^[a-z0-9-]+$")
    name: str | None = Field(default=None, min_length=2, max_length=120)
    title: str | None = Field(default=None, max_length=120)
    bio: str | None = Field(default=None, max_length=5000)
    specialties: list[str] | None = Field(default=None, max_length=20)
    resume: dict | None = None
    portrait_path: str | None = Field(default=None, max_length=300)
    portrait_media_id: UUID | None = None
    phone: str | None = Field(default=None, max_length=40)
    email: str | None = Field(default=None, max_length=255)
    is_visible: bool | None = None
    sort_order: int | None = None


class MediaRefOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    stored_name: str
    content_type: str
    width: int
    height: int


class LawyerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    slug: str
    name: str
    title: str
    bio: str
    specialties: list
    resume: dict
    portrait_path: str
    portrait_media_id: UUID | None
    portrait: MediaRefOut | None
    phone: str
    email: str
    is_visible: bool
    sort_order: int
    updated_at: datetime


class PublicLawyerOut(BaseModel):
    """The exact shape the public site renders — no internal fields."""

    slug: str
    name: str
    title: str
    bio: str
    specialties: list
    resume: dict
    portrait_url: str
    phone: str
    email: str
    sort_order: int


def public_lawyer(lawyer) -> PublicLawyerOut:
    portrait_url = ""
    if lawyer.portrait is not None:
        portrait_url = f"/api/v1/media/file/{lawyer.portrait.stored_name}"
    elif lawyer.portrait_path:
        portrait_url = lawyer.portrait_path
    resume = dict(lawyer.resume or {})
    # private contact fields live inside resume in the CMS — keep only
    # the sanitized public subset
    resume.pop("phone", None)
    resume.pop("email", None)
    return PublicLawyerOut(
        slug=lawyer.slug,
        name=lawyer.name,
        title=lawyer.title,
        bio=lawyer.bio,
        specialties=lawyer.specialties or [],
        resume=resume,
        portrait_url=portrait_url,
        phone=normalize_phone(lawyer.phone),
        email=lawyer.email,
        sort_order=lawyer.sort_order,
    )
