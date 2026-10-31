"""ORM models — kept one module per aggregate."""

from .account import (
    CaseFeeReceipt,
    Commission,
    InboxNotification,
    MarketerApplication,
    MarketerProfile,
    MarketingTerms,
    PasswordResetToken,
    ReferralAttribution,
    ReferralClick,
)
from .ai import AIConversation, AIKnowledgeSource, AIMessage
from .audit import AuditLog
from .consultation import ConsultationNote, ConsultationRequest
from .content import ContentRevision, Page, PageSection, SiteSetting
from .lawyer import Lawyer
from .media import MediaAsset
from .request_ops import (
    Article,
    ContactRequest,
    Label,
    OutboundDelivery,
    RequestEvent,
    RequestLabel,
    RequestMessage,
    TrackingCounter,
)
from .ticket import Ticket, TicketMessage
from .user import Role, Session, User, user_roles

__all__ = [
    "AIConversation",
    "AIKnowledgeSource",
    "AIMessage",
    "Article",
    "AuditLog",
    "CaseFeeReceipt",
    "Commission",
    "ConsultationNote",
    "ConsultationRequest",
    "ContactRequest",
    "ContentRevision",
    "InboxNotification",
    "Label",
    "Lawyer",
    "MarketerApplication",
    "MarketerProfile",
    "MarketingTerms",
    "MediaAsset",
    "OutboundDelivery",
    "Page",
    "PageSection",
    "PasswordResetToken",
    "ReferralAttribution",
    "ReferralClick",
    "RequestEvent",
    "RequestLabel",
    "RequestMessage",
    "Role",
    "Session",
    "SiteSetting",
    "Ticket",
    "TicketMessage",
    "TrackingCounter",
    "User",
    "user_roles",
]
