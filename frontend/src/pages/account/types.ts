export interface MyRequest {
  id: string
  tracking_code: string
  topic: string
  status: string
  created_at: string
  last_activity?: string
  has_new_reply?: boolean
}

/** وضعیت‌هایی که درخواست دیگر پاسخ‌پذیر نیست */
export const CLOSED_STATUSES = ['completed', 'cancelled', 'rejected']

export interface RequestDetail extends MyRequest {
  events: { from: string; to: string; created_at: string }[]
  messages: { id: string; sender_type: string; body: string; created_at: string }[]
}

export interface Notif {
  id: string
  title: string
  body: string
  kind: string
  link: string
  read: boolean
  created_at: string
}

export interface BankMasked {
  account_name: string
  iban_masked: string
  card_masked: string
  has_bank: boolean
  payout_hold_until: string | null
}

export interface ChannelStat {
  channel: string
  clicks: number
  unique_clicks: number
  requests: number
  linked: boolean
  url: string
}

export interface MarketerHome {
  status: string
  ref_code?: string
  ref_link?: string
  is_active?: boolean
  marketing_enabled?: boolean
  my_rate?: number
  rate_source?: string
  default_rate?: number
  accepted_terms_version?: number
  terms?: { version: number; body: string }
  cookie_days?: number
  payable?: number
  stats?: {
    clicks: number
    unique_clicks: number
    suspicious_clicks: number
    requests: number
    accepted: number
    conversion: number
    channels?: ChannelStat[]
  }
  links?: MarketerLink[]
  bank?: BankMasked
  reject_reason?: string
  reapply_at?: string
  applied_at?: string
}

export interface MarketerLink {
  id: string
  channel: string
  clicks: number
  unique_clicks: number
  requests: number
  url: string
}

/** فیلدهای whitelist بازاریاب — هیچ جزئیات پرونده‌ای در پاسخ نیست. */
export interface MyCommission {
  id: string
  name: string
  contract_status: string
  fee_amount: number
  rate: number
  amount: number
  status: string
  entry_type: 'accrual' | 'reversal'
  payout_id: string | null
  paid_at: string | null
  created_at: string
}

export interface CommissionsView {
  items: MyCommission[]
  totals: { pending: number; approved: number; paid: number; cancelled: number }
  marketing_enabled: boolean
}

export interface Payout {
  id: string
  amount: number
  paid_at: string
  tracking_ref: string
  note: string
  has_receipt: boolean
  receipt_url: string | null
}

export interface PaymentsView {
  payable: number
  items: Payout[]
}

/** ارجاع‌ها — نام کامل فقط با رضایت مراجعه‌کننده. */
export interface Referral {
  id: string
  consent: boolean
  full_name: string | null
  name: string
  contract_status: string
  fee_amount: number
  rate: number
  commission_amount: number | null
  commission_status: string
  channel: string
  created_at: string
}

export const STATUS_FA: Record<string, string> = {
  new: 'جدید',
  reviewing: 'در حال بررسی',
  awaiting_call: 'در انتظار تماس',
  followed_up: 'پیگیری شد',
  consulted: 'مشاوره انجام شد',
  accepted: 'پرونده پذیرفته شد',
  rejected: 'رد شد',
  completed: 'تکمیل شد',
  cancelled: 'لغو شد',
}

export const COMMISSION_FA: Record<string, string> = {
  pending: 'در انتظار',
  approved: 'تأییدشده',
  paid: 'پرداخت‌شده',
  cancelled: 'لغوشده',
}

export const faDate = (iso: string) =>
  new Date(iso).toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' })

export const faDateTime = (iso: string) =>
  new Date(iso).toLocaleString('fa-IR', { dateStyle: 'medium', timeStyle: 'short' })

export const toman = (n: number) => `${n.toLocaleString('fa-IR')} تومان`
