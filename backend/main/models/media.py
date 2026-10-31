"""Uploaded media — stored on disk, metadata here."""

import uuid
from datetime import datetime

from sqlalchemy import Integer, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from ..db.base import Base, created_at_col, uuid_pk


class MediaAsset(Base):
    __tablename__ = "media_assets"

    id: Mapped[uuid.UUID] = uuid_pk()
    stored_name: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    original_name: Mapped[str] = mapped_column(String(255), default="")
    content_type: Mapped[str] = mapped_column(String(80))
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    width: Mapped[int] = mapped_column(Integer, default=0)
    height: Mapped[int] = mapped_column(Integer, default=0)
    alt: Mapped[str] = mapped_column(String(255), default="")
    # public (site/article assets) | receipt (payout proof — auth-gated) | logo
    purpose: Mapped[str] = mapped_column(String(20), default="public", index=True)
    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    created_at: Mapped[datetime] = created_at_col()
