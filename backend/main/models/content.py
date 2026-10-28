"""Editable site content: settings, pages, sections, revisions."""

import uuid
from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db.base import Base, created_at_col, updated_at_col, uuid_pk


class SiteSetting(Base):
    """Typed key-value settings. `is_public` gates exposure via the public API."""

    __tablename__ = "site_settings"

    key: Mapped[str] = mapped_column(String(120), primary_key=True)
    value: Mapped[dict] = mapped_column(JSON, default=dict)
    is_public: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = updated_at_col()
    updated_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)


class Page(Base):
    __tablename__ = "pages"

    id: Mapped[uuid.UUID] = uuid_pk()
    slug: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(200))
    seo_title: Mapped[str] = mapped_column(String(200), default="")
    seo_description: Mapped[str] = mapped_column(String(320), default="")
    is_published: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = updated_at_col()

    sections: Mapped[list["PageSection"]] = relationship(
        back_populates="page",
        cascade="all, delete-orphan",
        order_by="PageSection.sort_order",
        lazy="selectin",
    )


class PageSection(Base):
    """A stable, addressable block of content inside a page.

    `key` is the contract between frontend and CMS (e.g. "home.hero"),
    `content` is the validated structured payload for that section type.
    """

    __tablename__ = "page_sections"
    __table_args__ = (
        UniqueConstraint("page_id", "key", name="uq_page_sections_page_key"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    page_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("pages.id", ondelete="CASCADE"), index=True
    )
    key: Mapped[str] = mapped_column(String(80))
    kind: Mapped[str] = mapped_column(String(40), default="text")
    content: Mapped[dict] = mapped_column(JSON, default=dict)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_at: Mapped[datetime] = updated_at_col()

    page: Mapped[Page] = relationship(back_populates="sections")


class ContentRevision(Base):
    """Snapshot history for content edits — enables rollback/audit."""

    __tablename__ = "content_revisions"

    id: Mapped[uuid.UUID] = uuid_pk()
    entity_type: Mapped[str] = mapped_column(String(40), index=True)
    entity_id: Mapped[str] = mapped_column(String(64), index=True)
    snapshot: Mapped[dict] = mapped_column(JSON, default=dict)
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    created_at: Mapped[datetime] = created_at_col()
    note: Mapped[str] = mapped_column(Text, default="")
