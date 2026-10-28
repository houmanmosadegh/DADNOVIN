/** API response types — mirror backend schemas. */

export interface RoleOut {
  id: number;
  name: string;
  description: string;
}

export interface UserOut {
  id: string;
  username: string;
  email: string;
  full_name: string;
  is_active: boolean;
  roles: RoleOut[];
  created_at: string;
}

export interface MeOut {
  id: string;
  username: string;
  email: string;
  full_name: string;
  roles: RoleOut[];
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface SettingOut {
  key: string;
  value: Record<string, unknown>;
  is_public: boolean;
  updated_at: string;
}

export interface SectionOut {
  id: string;
  key: string;
  kind: string;
  content: Record<string, unknown>;
  sort_order: number;
  is_enabled: boolean;
}

export interface PageOut {
  id: string;
  slug: string;
  title: string;
  seo_title: string;
  seo_description: string;
  is_published: boolean;
  sort_order: number;
  sections: SectionOut[];
}

export interface MediaOut {
  id: string;
  stored_name: string;
  original_name: string;
  content_type: string;
  size_bytes: number;
  width: number;
  height: number;
  alt: string;
  created_at: string;
  url: string;
}

export interface LawyerOut {
  id: string;
  slug: string;
  name: string;
  title: string;
  bio: string;
  specialties: string[];
  resume: Record<string, unknown>;
  portrait_path: string;
  portrait_media_id: string | null;
  portrait: { id: string; stored_name: string; content_type: string; width: number; height: number } | null;
  phone: string;
  email: string;
  is_visible: boolean;
  sort_order: number;
  updated_at: string;
}

export interface NoteOut {
  id: string;
  author_id: string | null;
  body: string;
  created_at: string;
}

export interface ConsultationOut {
  id: string;
  full_name: string;
  phone: string;
  email: string;
  service_slug: string;
  topic: string;
  message: string;
  status: string;
  source_page: string;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
  notes: NoteOut[];
}

export interface TicketMessageOut {
  id: string;
  sender_type: string;
  body: string;
  created_at: string;
}

export interface TicketOut {
  id: string;
  ticket_number: string;
  requester_name: string;
  requester_phone: string;
  requester_email: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
  messages: TicketMessageOut[];
}

export interface AiStatusOut {
  configured: boolean;
  enabled: boolean;
  knowledge_sources: number;
}

export interface KnowledgeOut {
  id: string;
  source_type: string;
  ref_id: string;
  title: string;
  body: string;
  is_active: boolean;
  updated_at: string;
}

export interface ConversationRow {
  id: string;
  session_key: string;
  created_at: string;
  message_count: number;
}

export interface ConversationOut {
  id: string;
  session_key: string;
  created_at: string;
  messages: { role: string; content: string; created_at: string }[];
}

export interface AuditRow {
  id: string;
  actor_username: string;
  action: string;
  entity: string;
  entity_id: string;
  detail: Record<string, unknown>;
  ip: string;
  created_at: string;
}

export interface DashboardOverview {
  stats: {
    consultations_total: number;
    consultations_new: number;
    consultations_week: number;
    contacts_unanswered: number;
    tickets_open: number;
    awaiting_followup: number;
    consultations_completed: number;
    overdue: number;
    mine_open: number;
    lawyers_visible: number;
    users_active: number;
    ai_conversations: number;
    avg_first_response_hours: number | null;
  };
  recent_consultations: {
    id: string;
    name: string;
    phone: string;
    subject: string;
    status: string;
    created_at: string;
    tracking_code: string;
  }[];
  attention_tickets: {
    id: string;
    ticket_number: string;
    subject: string;
    client: string;
    priority: string;
    status: string;
    sla_due_at: string | null;
    updated_at: string;
  }[];
  recent_contacts: {
    id: string;
    name: string;
    phone: string;
    status: string;
    tracking_code: string;
    created_at: string;
  }[];
  activity: {
    type: string;
    event: string;
    actor: string;
    payload: Record<string, unknown>;
    at: string;
    request_id: string;
  }[];
}

export interface TrendsOut {
  days: number;
  series: Record<"consultation" | "ticket" | "contact", Record<string, number>>;
}

// ---------- unified requests ----------

export interface InboxRow {
  type: "consultation" | "ticket" | "contact";
  id: string;
  tracking_code: string;
  name: string;
  phone: string;
  subject: string;
  status: string;
  priority: string;
  assigned_to: string | null;
  assignee_name: string;
  labels: { id: string; name: string; color: string }[];
  unanswered: boolean;
  overdue: boolean;
  created_at: string;
  updated_at: string;
  sla_due_at: string | null;
}

export interface MessageOut {
  id: string;
  sender_type: string;
  sender_id: string | null;
  body: string;
  is_note: boolean;
  attachments: string[];
  created_at: string;
}

export interface EventOut {
  id: string;
  event_type: string;
  actor_username: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface DeliveryOut {
  id: string;
  channel: string;
  provider: string;
  recipient: string;
  status: string;
  attempts: number;
  last_error: string;
  sent_at: string | null;
  created_at: string;
}

export interface RequestDetail {
  type: string;
  request: {
    id: string;
    status: string;
    priority: string;
    assigned_to: string | null;
    cancel_reason: string;
    first_response_at: string | null;
    last_response_at: string | null;
    sla_due_at: string | null;
    created_at: string;
    updated_at: string;
  };
  messages: MessageOut[];
  events: EventOut[];
  deliveries: DeliveryOut[];
  labels: { id: string; name: string; color: string }[];
  allowed_transitions: string[];
  requester: {
    name: string;
    phone: string;
    email: string;
    subject: string;
    code: string;
    body: string;
    source_page: string;
    extra: Record<string, string>;
  };
}

export interface LabelOut {
  id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface AssigneeOut {
  id: string;
  name: string;
  username: string;
}

export interface ArticleOut {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  seo_title: string;
  seo_description: string;
  status: string;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}
