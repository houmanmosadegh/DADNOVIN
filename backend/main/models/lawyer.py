"""Lawyer profiles — public-safe subset is serialized by the public API."""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import JSON, Boolean, ForeignKey, Integer, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db.base import Base, created_at_col, updated_at_col, uuid_pk

if TYPE_CHECKING:
    from .media import MediaAsset


class Lawyer(Base):
    __tablename__ = "lawyers"

    id: Mapped[uuid.UUID] = uuid_pk()
    slug: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    title: Mapped[str] = mapped_column(String(120), default="")
    bio: Mapped[str] = mapped_column(Text, default="")
    specialties: Mapped[list] = mapped_column(JSON, default=list)
    # resume card data (role/nameEn/degree/motto/expertise/education/…)
    resume: Mapped[dict] = mapped_column(JSON, default=dict)
    portrait_media_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("media_assets.id", ondelete="SET NULL"), nullable=True
    )
    portrait_path: Mapped[str] = mapped_column(String(300), default="")
    phone: Mapped[str] = mapped_column(String(40), default="")
    email: Mapped[str] = mapped_column(String(255), default="")
    is_visible: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = created_at_col()
    updated_at: Mapped[datetime] = updated_at_col()

    portrait: Mapped["MediaAsset | None"] = relationship(
        "MediaAsset", lazy="joined", foreign_keys=[portrait_media_id]
    )
