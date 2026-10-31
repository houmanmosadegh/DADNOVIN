"""Content management schemas — settings, pages, sections."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class SettingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    key: str
    value: dict
    is_public: bool
    updated_at: datetime


class SettingUpsertIn(BaseModel):
    value: dict
    is_public: bool | None = None


class SectionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    key: str
    kind: str
    content: dict
    sort_order: int
    is_enabled: bool


class SectionUpdateIn(BaseModel):
    content: dict | None = None
    is_enabled: bool | None = None
    sort_order: int | None = None


class PageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    slug: str
    title: str
    seo_title: str
    seo_description: str
    is_published: bool
    sort_order: int
    sections: list[SectionOut]


class PageUpdateIn(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    seo_title: str | None = Field(default=None, max_length=200)
    seo_description: str | None = Field(default=None, max_length=320)
    is_published: bool | None = None
    sort_order: int | None = None


class PublicSectionOut(BaseModel):
    key: str
    kind: str
    content: dict


class PublicPageOut(BaseModel):
    slug: str
    title: str
    seo_title: str
    seo_description: str
    sections: list[PublicSectionOut]


class PublicArticleOut(BaseModel):
    slug: str
    title: str
    excerpt: str
    category: str = ""
    tags: list = []
    author_name: str = ""
    read_time_min: int = 0
    featured_image: str = ""  # media id → /api/v1/media/<id>
    published_at: datetime | None


class PublicArticleDetailOut(PublicArticleOut):
    body: str
    seo_title: str
    seo_description: str
    canonical: str = ""
    author_bio: str = ""
