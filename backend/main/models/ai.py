"""AI assistant knowledge + conversation log."""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db.base import Base, created_at_col, updated_at_col, uuid_pk


class AIKnowledgeSource(Base):
    """One retrievable chunk of approved site knowledge.

    `content_hash` lets re-indexing skip unchanged content.
    """

    __tablename__ = "ai_knowledge_sources"

    id: Mapped[uuid.UUID] = uuid_pk()
    source_type: Mapped[str] = mapped_column(String(40), index=True)
    ref_id: Mapped[str] = mapped_column(String(80), default="", index=True)
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text)
    content_hash: Mapped[str] = mapped_column(String(64), default="")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_at: Mapped[datetime] = updated_at_col()


class AIConversation(Base):
    __tablename__ = "ai_conversations"

    id: Mapped[uuid.UUID] = uuid_pk()
    session_key: Mapped[str] = mapped_column(String(80), index=True)
    created_at: Mapped[datetime] = created_at_col()

    messages: Mapped[list["AIMessage"]] = relationship(
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="AIMessage.created_at",
        lazy="selectin",
    )


class AIMessage(Base):
    __tablename__ = "ai_messages"

    id: Mapped[uuid.UUID] = uuid_pk()
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("ai_conversations.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[str] = mapped_column(String(20))  # user | assistant | system
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = created_at_col()

    conversation: Mapped[AIConversation] = relationship(
        back_populates="messages"
    )
