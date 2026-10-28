"""AI endpoint schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ChatMessageIn(BaseModel):
    role: str = Field(pattern="^(user|assistant)$")
    content: str = Field(min_length=1, max_length=4000)


class ChatIn(BaseModel):
    session_key: str = Field(default="", max_length=80)
    messages: list[ChatMessageIn] = Field(min_length=1, max_length=12)


class ChatOut(BaseModel):
    reply: str
    session_key: str
    sources: list[str] = []
    provider: str  # "model" | "retrieval" | "unavailable"


class AiStatusOut(BaseModel):
    configured: bool
    enabled: bool
    knowledge_sources: int


class KnowledgeIn(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    body: str = Field(min_length=5, max_length=20000)
    source_type: str = Field(default="manual", max_length=40)
    ref_id: str = Field(default="", max_length=80)
    is_active: bool = True


class KnowledgeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    source_type: str
    ref_id: str
    title: str
    body: str
    is_active: bool
    updated_at: datetime


class KnowledgePatchIn(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    body: str | None = Field(default=None, max_length=20000)
    is_active: bool | None = None


class ConversationMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    role: str
    content: str
    created_at: datetime


class ConversationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    session_key: str
    created_at: datetime
    messages: list[ConversationMessageOut]
