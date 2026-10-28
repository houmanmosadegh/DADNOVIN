"""Media schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class MediaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    stored_name: str
    original_name: str
    content_type: str
    size_bytes: int
    width: int
    height: int
    alt: str
    created_at: datetime
    url: str = ""


class MediaPatchIn(BaseModel):
    alt: str = Field(default="", max_length=255)
