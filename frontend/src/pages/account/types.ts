export interface MyRequest {
  id: string
  tracking_code: string
  topic: string
  status: string
  created_at: string
}

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

export interface MarketerHome {
  status: string
  ref_code?: string
  ref_link?: string
  is_active?: boolean
  commission_enabled?: boolean
  cookie_days?: number
  stats?: { clicks: number; requests: number; accepted: number; conversion: number }
  iban_masked?: string
}

export interface WalletView {
  balance: number
  pending_commissions: number
  pending_payouts: number
  min_payout: number
  commission_enabled: boolean
  entries: { id: string; kind: string; amount: number; memo: string; created_at: string }[]
}

export interface Referral {
  masked_name: string
  status: string
  created_at: string
}

export interface Payout {
  id: string
  amount: number
  status: string
  iban_masked: string
  payment_ref: string
  created_at: string
}

export const STATUS_FA: Record<string, string> = {
  new: 'جدید', reviewing: 'در حال بررسی', awaiting_call: 'در انتظار تماس',
  followed_up: 'پیگیری شد', consulted: 'مشاوره انجام شد', accepted: 'پرونده پذیرفته شد',
  rejected: 'رد شد', completed: 'تکمیل شد', cancelled: 'لغو شد',
}

export const PAYOUT_FA: Record<string, string> = {
  pending: 'در انتظار', approved: 'تأییدشده', paid: 'پرداخت‌شده', rejected: 'رد شده',
}

export const LEDGER_FA: Record<string, string> = {
  commission_credit: 'کمیسیون', payout_debit: 'برداشت', adjustment: 'تعدیل دستی',
}

export const faDate = (iso: string) =>
  new Date(iso).toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' })

export const faDateTime = (iso: string) =>
  new Date(iso).toLocaleString('fa-IR', { dateStyle: 'medium', timeStyle: 'short' })

export const rial = (n: number) => `${n.toLocaleString('fa-IR')} ریال`
