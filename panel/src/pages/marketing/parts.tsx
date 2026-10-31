/** Shared marketer-management tabs — consumed by the Marketing, Users and
 *  Requests hub pages (one sidebar item each per spec §2). Backend:
 *  /admin/marketers*, /admin/commissions*, /admin/settings/commission. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Download, Eye, Plus, ToggleLeft, ToggleRight, X } from "lucide-react";
import { useState } from "react";
import { api, ApiError } from "../../services/api";
import { ConfirmDialog, Drawer, EmptyState, ErrorState, Skeleton, Table, useToast } from "../../components/ui";

// ---------- types ----------

interface Stats {
  clicks: number;
  unique_clicks: number;
  suspicious_clicks: number;
  requests: number;
  accepted: number;
  conversion: number;
}

interface ProfileOut {
  id: string;
  user_id: string;
  ref_code: string;
  is_active: boolean;
  fraud_flag: boolean;
  iban_masked: string;
  card_masked: string;
  custom_rate: number | null;
  accepted_terms_version: number;
  full_name: string;
  phone: string;
  stats: Stats;
  created_at: string;
}

export interface ApplicationOut {
  id: string;
  user_id: string;
  full_name: string;
  phone: string;
  status: string;
  note: string;
  channel: string;
  review_note: string;
  created_at: string;
}

interface CommissionOut {
  id: string;
  marketer_id: string;
  full_name: string;
  ref_code: string;
  request_type: string;
  request_id: string;
  tracking_code: string;
  client_name: string;
  entry_type: "accrual" | "reversal";
  parent_id: string | null;
  amount: number;
  status: string;
  basis_kind: string;
  basis_amount: number;
  rate: number;
  payout_id: string | null;
  paid_at: string | null;
  paid_note: string;
  created_at: string;
}

// ---------- helpers ----------

const fmt = (n: number) => `${n.toLocaleString("fa-IR")} تومان`;
const faDate = (iso: string) => new Date(iso).toLocaleDateString("fa-IR");
const faDateTime = (iso: string) => new Date(iso).toLocaleString("fa-IR");

const APP_STATUS: Record<string, [string, string]> = {
  pending: ["در انتظار", "bg-amber-500/10 text-amber-400"],
  approved: ["تأییدشده", "bg-emerald-500/10 text-emerald-400"],
  rejected: ["رد شده", "bg-red-500/10 text-red-400"],
};
const COMM_STATUS: Record<string, [string, string]> = {
  pending: ["در انتظار", "bg-amber-500/10 text-amber-400"],
  approved: ["تأییدشده", "bg-emerald-500/10 text-emerald-400"],
  paid: ["پرداخت‌شده", "bg-emerald-600/15 text-emerald-300"],
  cancelled: ["لغوشده", "bg-red-500/10 text-red-400"],
};
const STATUS_PILL: Record<string, [string, string]> = {
  new: ["جدید", "bg-sky-500/10 text-sky-400"],
  reviewing: ["در حال بررسی", "bg-amber-500/10 text-amber-400"],
  awaiting_call: ["تماس گرفته شد", "bg-teal-500/10 text-teal-400"],
  followed_up: ["پیگیری شد", "bg-teal-500/10 text-teal-400"],
  consulted: ["مشاوره انجام شد", "bg-emerald-500/10 text-emerald-400"],
  accepted: ["پذیرفته شد", "bg-emerald-600/15 text-emerald-300"],
  rejected: ["رد شده", "bg-red-500/10 text-red-400"],
  cancelled: ["لغوشده", "bg-red-500/10 text-red-400"],
  completed: ["بسته شد", "bg-sand-2 text-ink-1"],
};

function Pill({ value, map }: { value: string; map: Record<string, [string, string]> }) {
  const [label, cls] = map[value] ?? [value, "bg-sand-2 text-ink-1"];
  return <span className={`rounded-full px-2 py-0.5 text-[11px] ${cls}`}>{label}</span>;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card p-3 text-center">
      <p className="text-[11px] text-ink-2">{label}</p>
      <p className="mt-0.5 text-lg font-bold text-gold-1">{value}</p>
    </div>
  );
}

export function useApplications() {
  return useQuery({
    queryKey: ["marketer-apps"],
    queryFn: () => api.get<ApplicationOut[]>("/admin/marketers/applications"),
  });
}

export function useProfiles() {
  return useQuery({
    queryKey: ["marketer-profiles"],
    queryFn: () => api.get<ProfileOut[]>("/admin/marketers"),
  });
}

// ---------- profiles (کاربران ← بازاریاب‌ها) ----------

export function ProfilesTab() {
  const toast = useToast();
  const qc = useQueryClient();
  const [refsFor, setRefsFor] = useState<ProfileOut | null>(null);

  const list = useProfiles();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["marketer-profiles"] });

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, boolean | number | null> }) =>
      api.patch(`/admin/marketers/${id}`, body),
    onSuccess: () => {
      invalidate();
      toast("success", "ذخیره شد.");
    },
    onError: (e) => toast("error", e instanceof ApiError ? e.message : "خطا"),
  });

  const editRate = (p: ProfileOut) => {
    const raw = window.prompt(
      `نرخ اختصاصی ${p.full_name} (٪) — خالی یعنی نرخ پیش‌فرض:`,
      p.custom_rate != null ? String(p.custom_rate) : ""
    );
    if (raw === null) return;
    const v = raw.trim();
    patch.mutate({ id: p.id, body: { custom_rate: v === "" ? 0 : Number(v) } });
  };

  const rows = list.data ?? [];
  const totals = rows.reduce(
    (acc, p) => ({
      clicks: acc.clicks + p.stats.clicks,
      requests: acc.requests + p.stats.requests,
      accepted: acc.accepted + p.stats.accepted,
    }),
    { clicks: 0, requests: 0, accepted: 0 }
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="بازاریاب فعال" value={rows.filter((p) => p.is_active).length.toLocaleString("fa-IR")} />
        <Stat label="کل کلیک‌ها" value={totals.clicks.toLocaleString("fa-IR")} />
        <Stat label="درخواست ارجاع‌شده" value={totals.requests.toLocaleString("fa-IR")} />
        <Stat label="پروندهٔ پذیرفته" value={totals.accepted.toLocaleString("fa-IR")} />
      </div>

      {list.isLoading && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      )}
      {list.isError && <ErrorState text="بارگذاری ناموفق بود." onRetry={() => list.refetch()} />}
      {list.data && rows.length === 0 && (
        <EmptyState
          text="بازاریاب فعالی نیست"
          hint="با تأیید درخواست‌ها در «درخواست‌ها ← بازاریابی» بازاریاب ساخته می‌شود."
        />
      )}

      {rows.length > 0 && (
        <Table head={["بازاریاب", "کد ارجاع", "نرخ", "کلیک (یکتا)", "درخواست", "پذیرفته", "تبدیل", "وضعیت", ""]}>
          {rows.map((p) => (
            <tr key={p.id} className="border-b border-sand-2 last:border-0">
              <td className="td">
                <div className="font-medium">{p.full_name}</div>
                <div dir="ltr" className="text-[11px] text-ink-2">
                  {p.phone}
                </div>
              </td>
              <td className="td">
                <span dir="ltr" className="font-mono text-[12px] text-gold-1">
                  {p.ref_code}
                </span>
              </td>
              <td className="td">
                <button
                  className="text-[12px] text-ink-1 underline decoration-dotted underline-offset-4 hover:text-gold-1"
                  onClick={() => editRate(p)}
                  title="تنظیم نرخ اختصاصی"
                >
                  {p.custom_rate != null ? `${p.custom_rate.toLocaleString("fa-IR")}٪` : "پیش‌فرض"}
                </button>
              </td>
              <td className="td">
                {p.stats.clicks.toLocaleString("fa-IR")}
                <span className="text-[11px] text-ink-3"> ({p.stats.unique_clicks.toLocaleString("fa-IR")})</span>
              </td>
              <td className="td">{p.stats.requests.toLocaleString("fa-IR")}</td>
              <td className="td">{p.stats.accepted.toLocaleString("fa-IR")}</td>
              <td className="td">{p.stats.conversion.toLocaleString("fa-IR")}٪</td>
              <td className="td">
                <button
                  className={`inline-flex items-center gap-1 text-[12px] ${p.is_active ? "text-emerald-400" : "text-ink-3"}`}
                  onClick={() => patch.mutate({ id: p.id, body: { is_active: !p.is_active } })}
                >
                  {p.is_active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                  {p.is_active ? "فعال" : "معلق"}
                </button>
                {p.fraud_flag && (
                  <Pill value="rejected" map={{ rejected: ["پرچم تقلب", "bg-red-500/10 text-red-400"] }} />
                )}
              </td>
              <td className="td text-left">
                <button className="btn-ghost btn-sm" onClick={() => setRefsFor(p)}>
                  <Eye size={13} /> ارجاع‌ها
                </button>
              </td>
            </tr>
          ))}
        </Table>
      )}

      <ReferralsDrawer profile={refsFor} onClose={() => setRefsFor(null)} />
    </div>
  );
}

// ---------- marketer detail (spec §2.3) ----------
// One drawer: summary cards, masked bank (audited reveal), referrals table
// with contract status, commissions, payout history with receipts, payout
// registration (multipart + receipt file), custom rate, suspend, code rotation.

interface DetailOut {
  profile: ProfileOut;
  full_name: string;
  phone: string;
  username: string;
  bank: {
    account_name_masked: string;
    iban_masked: string;
    card_masked: string;
    bank_updated_at: string | null;
    payout_hold_until: string | null;
  };
  summary: {
    referrals: number;
    contracts: number;
    fee_total: number;
    commissions: { pending: number; approved: number; paid: number; cancelled: number };
    payable: number;
  };
  referrals: {
    id: string;
    full_name: string;
    status: string;
    contract_status: string;
    tracking_code: string;
    fee_amount: number;
    channel: string;
    consent: boolean;
    flag: string;
    created_at: string;
  }[];
  commissions: {
    id: string;
    entry_type: string;
    amount: number;
    rate: number;
    basis_amount: number;
    status: string;
    payout_id: string | null;
    paid_at: string | null;
    created_at: string;
  }[];
  payouts: {
    id: string;
    amount: number;
    paid_at: string;
    tracking_ref: string;
    note: string;
    has_receipt: boolean;
  }[];
  terms_version: number;
}

function ReferralsDrawer({ profile, onClose }: { profile: ProfileOut | null; onClose: () => void }) {
  return (
    <Drawer open={!!profile} onClose={onClose} title={profile ? `جزئیات ${profile.full_name}` : ""}>
      {profile && <MarketerDetail profile={profile} />}
    </Drawer>
  );
}

function MarketerDetail({ profile }: { profile: ProfileOut }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payRef, setPayRef] = useState("");
  const [payNote, setPayNote] = useState("");
  const [payFile, setPayFile] = useState<File | null>(null);
  const [revealed, setRevealed] = useState<{ account_name: string; iban: string; card: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const q = useQuery({
    queryKey: ["marketer-detail", profile.id],
    queryFn: () => api.get<DetailOut>(`/admin/marketers/${profile.id}/detail`),
  });
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["marketer-detail", profile.id] });
    qc.invalidateQueries({ queryKey: ["marketer-profiles"] });
    qc.invalidateQueries({ queryKey: ["commissions"] });
  };

  const reveal = useMutation({
    mutationFn: () =>
      api.post<{ account_name: string; iban: string; card: string }>(`/admin/marketers/${profile.id}/reveal-bank`, {}),
    onSuccess: (d) => setRevealed(d),
    onError: (e) => toast("error", e instanceof ApiError ? e.message : "خطا"),
  });
  const rotate = useMutation({
    mutationFn: () => api.post<{ ref_code: string }>(`/admin/marketers/${profile.id}/rotate-code`, {}),
    onSuccess: () => {
      toast("success", "کد جدید صادر شد؛ کد قبلی برای لینک‌های گذشته فعال می‌ماند.");
      invalidate();
    },
    onError: (e) => toast("error", e instanceof ApiError ? e.message : "خطا"),
  });
  const payout = useMutation({
    mutationFn: (fd: FormData) =>
      api.upload<{ id: string; amount: number }>(`/admin/marketers/${profile.id}/payouts`, fd),
    onSuccess: () => {
      toast("success", "پرداخت ثبت شد؛ بازاریاب آن را در پنل خود می‌بیند.");
      setPayOpen(false);
      setPayAmount("");
      setPayRef("");
      setPayNote("");
      setPayFile(null);
      invalidate();
    },
    onError: (e) => toast("error", e instanceof ApiError ? e.message : "خطا"),
  });

  const d = q.data;
  const payable = d?.summary.payable ?? 0;
  const submitPay = () => {
    const fd = new FormData();
    if (payAmount.trim()) fd.set("amount", payAmount.replace(/[^0-9]/g, ""));
    if (payRef.trim()) fd.set("tracking_ref", payRef.trim());
    if (payNote.trim()) fd.set("note", payNote.trim());
    if (payFile) fd.set("file", payFile);
    payout.mutate(fd);
  };
  const copy = () => {
    void navigator.clipboard.writeText(`${location.origin}/r/${profile.ref_code}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (q.isLoading) return <Skeleton className="h-72" />;
  if (q.isError || !d) return <ErrorState text="بارگذاری ناموفق بود." onRetry={() => q.refetch()} />;

  return (
    <div className="space-y-5">
      {/* summary cards */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label="معرفی‌شده" value={d.summary.referrals.toLocaleString("fa-IR")} />
        <Stat label="قرارداد بسته‌شده" value={d.summary.contracts.toLocaleString("fa-IR")} />
        <Stat label="جمع حق‌الوکاله" value={fmt(d.summary.fee_total)} />
        <Stat label="کمیسیون در انتظار" value={fmt(d.summary.commissions.pending)} />
        <Stat label="کمیسیون تأییدشده" value={fmt(d.summary.commissions.approved)} />
        <div className={`card p-3 text-center ${payable > 0 ? "border-gold-1/50" : ""}`}>
          <p className="text-[11px] text-ink-2">ماندهٔ قابل پرداخت</p>
          <p className={`mt-0.5 text-lg font-bold ${payable > 0 ? "text-gold-1" : "text-ink-2"}`}>{fmt(payable)}</p>
          {payable > 0 && (
            <span className="mt-1 inline-block rounded-full bg-gold-1/10 px-2 py-0.5 text-[11px] text-gold-1">
              نیاز به پرداخت
            </span>
          )}
        </div>
      </div>

      {/* ref code + rotate */}
      <div className="flex items-center justify-between rounded-lg border border-sand-2 p-3">
        <span dir="ltr" className="font-mono text-sm text-gold-1">
          /r/{d.profile.ref_code}
        </span>
        <div className="flex gap-1">
          <button className="btn-ghost btn-sm" onClick={copy}>
            <Copy size={13} /> {copied ? "کپی شد" : "کپی لینک"}
          </button>
          <button
            className="btn-ghost btn-sm"
            disabled={rotate.isPending}
            onClick={() => {
              if (window.confirm("کد جدید صادر شود؟ کد قبلی برای لینک‌های گذشته فعال می‌ماند.")) rotate.mutate();
            }}
          >
            چرخش کد
          </button>
        </div>
      </div>

      {/* payment registration */}
      {payable > 0 && (
        <div className="card space-y-3 border-gold-1/30 p-4">
          <div className="flex items-center justify-between">
            <h4 className="text-[13px] font-semibold">ثبت پرداخت و فیش</h4>
            <button className="btn-gold btn-sm" onClick={() => setPayOpen((v) => !v)}>
              {payOpen ? "بستن" : "ثبت پرداخت"}
            </button>
          </div>
          {payOpen && (
            <div className="space-y-2 border-t border-sand-2 pt-3">
              <input
                className="w-full"
                dir="ltr"
                inputMode="numeric"
                placeholder={`مبلغ (تومان) — خالی یعنی کل مانده ${payable.toLocaleString("fa-IR")}`}
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
              />
              <input
                className="w-full"
                dir="ltr"
                placeholder="کد پیگیری واریز (اختیاری)"
                value={payRef}
                onChange={(e) => setPayRef(e.target.value)}
              />
              <input
                className="w-full"
                placeholder="توضیح (اختیاری)"
                value={payNote}
                onChange={(e) => setPayNote(e.target.value)}
              />
              <label className="block text-[12px] text-ink-2">
                فیش پرداخت (JPG/PNG/WebP/PDF)
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  className="mt-1 block w-full text-[12px]"
                  onChange={(e) => setPayFile(e.target.files?.[0] ?? null)}
                />
              </label>
              <button className="btn-gold btn-sm" disabled={payout.isPending} onClick={submitPay}>
                {payout.isPending ? "در حال ثبت…" : "ثبت نهایی پرداخت"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* bank coordinates */}
      <div className="card p-4">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-[13px] font-semibold">اطلاعات پرداخت بازاریاب</h4>
          {(d.bank.iban_masked || d.bank.card_masked) && (
            <button className="btn-ghost btn-sm" disabled={reveal.isPending} onClick={() => reveal.mutate()}>
              <Eye size={13} /> نمایش کامل
            </button>
          )}
        </div>
        {revealed ? (
          <div className="space-y-1 text-[13px]" dir="ltr">
            <p>
              صاحب حساب: <bdi>{revealed.account_name}</bdi>
            </p>
            <p className="font-mono">شبا: {revealed.iban}</p>
            <p className="font-mono">کارت: {revealed.card}</p>
          </div>
        ) : d.bank.iban_masked || d.bank.card_masked ? (
          <div className="space-y-1 text-[13px] text-ink-1">
            <p>صاحب حساب: {d.bank.account_name_masked || "—"}</p>
            {d.bank.iban_masked && (
              <p dir="ltr" className="font-mono">
                شبا: {d.bank.iban_masked}
              </p>
            )}
            {d.bank.card_masked && (
              <p dir="ltr" className="font-mono">
                کارت: {d.bank.card_masked}
              </p>
            )}
            {d.bank.payout_hold_until && new Date(d.bank.payout_hold_until) > new Date() && (
              <p className="text-[11px] text-amber-400">
                اطلاعات تازه تغییر کرده — پرداخت تا {faDateTime(d.bank.payout_hold_until)} ممکن نیست.
              </p>
            )}
          </div>
        ) : (
          <p className="text-[12px] text-ink-2">اطلاعات بانکی ثبت نشده است.</p>
        )}
        <p className="mt-2 text-[11px] text-ink-3">هر «نمایش کامل» در لاگ ممیزی ثبت می‌شود.</p>
      </div>

      {/* referrals */}
      <div>
        <h4 className="mb-2 text-[13px] font-semibold text-ink-1">ارجاع‌ها</h4>
        {d.referrals.length === 0 && <EmptyState text="ارجاعی ثبت نشده است" />}
        <div className="space-y-2">
          {d.referrals.map((r) => (
            <div key={r.id} className="card p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">{r.full_name || "—"}</span>
                <span className="text-[11px] text-ink-2">
                  {r.channel ? `کانال: ${r.channel}` : ""} {!r.consent && "· بدون رضایت نام"}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between text-[12px] text-ink-2">
                <span>
                  {r.contract_status}
                  {r.fee_amount > 0 && ` · حق‌الوکاله ${fmt(r.fee_amount)}`}
                </span>
                <span>{faDate(r.created_at)}</span>
              </div>
              {r.flag === "review" && (
                <p className="mt-1 text-[11px] text-amber-400">نیازمند بررسی — کمیسیونی نمی‌سازد</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* commissions */}
      <div>
        <h4 className="mb-2 text-[13px] font-semibold text-ink-1">کمیسیون‌ها</h4>
        {d.commissions.length === 0 && <EmptyState text="کمیسیونی ثبت نشده است" />}
        <div className="space-y-2">
          {d.commissions.map((c) => (
            <div key={c.id} className="card p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className={`font-medium ${c.amount < 0 ? "text-red-400" : "text-gold-1"}`}>{fmt(c.amount)}</span>
                <Pill value={c.status} map={COMM_STATUS} />
              </div>
              <div className="mt-1 flex items-center justify-between text-[12px] text-ink-2">
                <span>
                  {c.entry_type === "reversal"
                    ? "برگشت"
                    : `${c.rate.toLocaleString("fa-IR")}٪ از ${fmt(c.basis_amount)}`}
                </span>
                <span>{faDate(c.created_at)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* payout history */}
      <div>
        <h4 className="mb-2 text-[13px] font-semibold text-ink-1">تاریخچهٔ پرداخت‌ها</h4>
        {d.payouts.length === 0 && <EmptyState text="پرداختی ثبت نشده است" />}
        <div className="space-y-2">
          {d.payouts.map((p) => (
            <div key={p.id} className="card flex items-center justify-between p-3 text-sm">
              <div>
                <span className="font-medium text-gold-1">{fmt(p.amount)}</span>
                <span className="ms-2 text-[12px] text-ink-2">
                  {faDate(p.paid_at)}
                  {p.tracking_ref ? ` · پیگیری ${p.tracking_ref}` : ""}
                </span>
                {p.note && <p className="mt-0.5 text-[12px] text-ink-2">{p.note}</p>}
              </div>
              {p.has_receipt && (
                <a
                  className="btn-ghost btn-sm"
                  href={`${location.origin}/api/v1/admin/marketers/payouts/${p.id}/receipt`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Download size={13} /> فیش
                </a>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------- applications (درخواست‌ها ← بازاریابی) ----------

export function ApplicationsTab() {
  const toast = useToast();
  const qc = useQueryClient();
  const apps = useApplications();
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [showAll, setShowAll] = useState(false);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["marketer-apps"] });
    qc.invalidateQueries({ queryKey: ["marketer-profiles"] });
  };

  const approve = useMutation({
    mutationFn: (id: string) => api.post(`/admin/marketers/applications/${id}/approve`, {}),
    onSuccess: () => {
      toast("success", "تأیید شد و کد ارجاع فعال شد.");
      invalidate();
    },
    onError: (e) => toast("error", e instanceof ApiError ? e.message : "خطا"),
  });
  const reject = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post(`/admin/marketers/applications/${id}/reject`, { reason }),
    onSuccess: () => {
      toast("success", "رد شد.");
      setRejecting(null);
      setReason("");
      invalidate();
    },
    onError: (e) => toast("error", e instanceof ApiError ? e.message : "خطا"),
  });

  const rows = (apps.data ?? []).filter((a) => showAll || a.status === "pending");

  return (
    <div className="max-w-3xl space-y-3">
      <div className="flex justify-end">
        <button className="btn-ghost btn-sm" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "فقط در انتظار" : "نمایش همه"}
        </button>
      </div>
      {apps.isLoading && [0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}
      {apps.isError && <ErrorState text="بارگذاری ناموفق بود." onRetry={() => apps.refetch()} />}
      {apps.data && rows.length === 0 && (
        <EmptyState text={showAll ? "درخواستی ثبت نشده است" : "درخواست در انتظاری نیست"} />
      )}
      {rows.map((a) => (
        <div key={a.id} className="card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-medium">{a.full_name}</span>
            <span dir="ltr" className="text-[12px] text-ink-2">
              {a.phone}
            </span>
            {a.channel && (
              <span className="rounded-full bg-sand-1 px-2 py-0.5 text-[11px] text-ink-1">{a.channel}</span>
            )}
            <Pill value={a.status} map={APP_STATUS} />
            <span className="mr-auto text-[12px] text-ink-2">{faDate(a.created_at)}</span>
          </div>
          {a.note && <p className="mt-2 text-[13px] text-ink-1">{a.note}</p>}
          {a.status === "rejected" && a.review_note && (
            <p className="mt-1 text-[12px] text-red-400">دلیل رد: {a.review_note}</p>
          )}
          {a.status === "pending" && (
            <div className="mt-3 border-t border-sand-2 pt-3">
              {rejecting === a.id ? (
                <div className="flex flex-wrap items-end gap-2">
                  <input
                    className="min-w-[14rem] flex-1"
                    placeholder="دلیل رد (برای کاربر نمایش داده می‌شود)"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                  <button
                    className="btn-danger btn-sm"
                    disabled={reject.isPending}
                    onClick={() => reject.mutate({ id: a.id, reason })}
                  >
                    ثبت رد
                  </button>
                  <button
                    className="btn-ghost btn-sm"
                    onClick={() => {
                      setRejecting(null);
                      setReason("");
                    }}
                  >
                    انصراف
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button className="btn-gold btn-sm" disabled={approve.isPending} onClick={() => approve.mutate(a.id)}>
                    <Check size={14} /> تأیید و فعال‌سازی کد
                  </button>
                  <button className="btn-ghost btn-sm" onClick={() => setRejecting(a.id)}>
                    <X size={14} /> رد
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------- commission rules (بازاریابی ← قواعد کمیسیون) ----------
// تب ساده‌شده: فقط درصد پیش‌فرض + تاریخچهٔ تغییر. درصد اختصاصی هر بازاریاب
// در صفحهٔ جزئیات همان بازاریاب است و در لحظهٔ ایجاد کمیسیون snapshot می‌شود.

interface RateHistoryRow {
  actor: string;
  from: number | null;
  to: number | null;
  created_at: string;
}

export function RulesTab() {
  const toast = useToast();
  const qc = useQueryClient();
  const [rate, setRate] = useState("");

  const cfg = useQuery({
    queryKey: ["commission-config"],
    queryFn: () => api.get<{ default_rate: number }>("/admin/commissions/config"),
  });
  const history = useQuery({
    queryKey: ["commission-rate-history"],
    queryFn: () => api.get<RateHistoryRow[]>("/admin/commissions/rate-history"),
  });

  const save = useMutation({
    mutationFn: (v: number) => api.patch("/admin/commissions/config", { default_rate: v }),
    onSuccess: () => {
      toast("success", "درصد پیش‌فرض ذخیره شد.");
      setRate("");
      qc.invalidateQueries({ queryKey: ["commission-config"] });
      qc.invalidateQueries({ queryKey: ["commission-rate-history"] });
    },
    onError: (e) => toast("error", e instanceof ApiError ? e.message : "خطا"),
  });

  const current = cfg.data?.default_rate;
  const parsed = Number(rate.replace(/[^0-9.]/g, ""));
  const valid = rate !== "" && Number.isFinite(parsed) && parsed >= 0 && parsed <= 100;

  return (
    <div className="max-w-xl space-y-4">
      <div className="card space-y-4 p-5">
        <div>
          <h3 className="text-[14px] font-semibold">درصد کمیسیون پیش‌فرض</h3>
          <p className="mt-1 text-[12px] leading-5 text-ink-2">
            درصدی از «حق‌الوکالهٔ دریافتی دفتر» که برای بازاریاب‌های بدون نرخ اختصاصی اعمال می‌شود. درصد در لحظهٔ ایجاد
            هر کمیسیون ثبت (snapshot) می‌شود و تغییر آن روی کمیسیون‌های قبلی اثر ندارد.
          </p>
        </div>
        {cfg.isLoading && <Skeleton className="h-10" />}
        {cfg.isError && <ErrorState text="بارگذاری ناموفق بود." onRetry={() => cfg.refetch()} />}
        {cfg.data && (
          <div className="flex items-end gap-3">
            <label className="block">
              <span className="mb-1 block text-[12px] text-ink-2">
                درصد فعلی: <strong className="text-gold-1">{current!.toLocaleString("fa-IR")}٪</strong>
              </span>
              <input
                dir="ltr"
                inputMode="decimal"
                className="w-32"
                placeholder="۰ تا ۱۰۰"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
              />
            </label>
            <button className="btn-gold btn-sm" disabled={!valid || save.isPending} onClick={() => save.mutate(parsed)}>
              ذخیره
            </button>
          </div>
        )}
        {rate !== "" && !valid && <p className="text-[12px] text-red-400">عددی بین ۰ تا ۱۰۰ وارد کنید.</p>}
      </div>

      <div className="card p-5">
        <h3 className="mb-3 text-[14px] font-semibold">تاریخچهٔ تغییر درصد</h3>
        {history.isLoading && <Skeleton className="h-16" />}
        {history.data && history.data.length === 0 && (
          <p className="text-[12px] text-ink-2">هنوز تغییری ثبت نشده است.</p>
        )}
        <div className="space-y-1.5">
          {(history.data ?? []).map((h, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-lg border border-sand-2 px-3 py-2 text-[12px]"
            >
              <span className="text-ink-1">
                <strong>{h.actor}</strong> — از {(h.from ?? 0).toLocaleString("fa-IR")}٪ به{" "}
                <strong className="text-gold-1">{(h.to ?? 0).toLocaleString("fa-IR")}٪</strong>
              </span>
              <span className="text-ink-3">{faDateTime(h.created_at)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------- commissions list (بازاریابی ← کمیسیون‌ها) ----------

export function CommissionsTab() {
  const toast = useToast();
  const qc = useQueryClient();
  const [cancelling, setCancelling] = useState<CommissionOut | null>(null);
  const [paying, setPaying] = useState<CommissionOut | null>(null);
  const [payNote, setPayNote] = useState("");
  const [reversing, setReversing] = useState<CommissionOut | null>(null);
  const [revAmount, setRevAmount] = useState("");
  const [revNote, setRevNote] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const list = useQuery({
    queryKey: ["commissions"],
    queryFn: () => api.get<CommissionOut[]>("/admin/commissions"),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["commissions"] });

  const approveComm = useMutation({
    mutationFn: (id: string) => api.post(`/admin/commissions/${id}/approve`, {}),
    onSuccess: () => {
      toast("success", "کمیسیون تأیید شد.");
      invalidate();
    },
    onError: (e) => toast("error", e instanceof ApiError ? e.message : "خطا"),
  });
  const payComm = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) => api.post(`/admin/commissions/${id}/pay`, { note }),
    onSuccess: () => {
      toast("success", "کمیسیون پرداخت‌شده علامت خورد.");
      setPaying(null);
      setPayNote("");
      invalidate();
    },
    onError: (e) => toast("error", e instanceof ApiError ? e.message : "خطا"),
  });
  const cancelComm = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post(`/admin/commissions/${id}/cancel`, { reason }),
    onSuccess: () => {
      toast("success", "کمیسیون لغو شد.");
      setCancelling(null);
      invalidate();
    },
    onError: (e) => toast("error", e instanceof ApiError ? e.message : "خطا"),
  });
  const reverseComm = useMutation({
    mutationFn: ({ id, amount, note }: { id: string; amount?: number; note?: string }) =>
      api.post(`/admin/commissions/${id}/reverse`, { amount, note }),
    onSuccess: () => {
      toast("success", "ورودی برگشت ثبت شد.");
      setReversing(null);
      setRevAmount("");
      setRevNote("");
      invalidate();
    },
    onError: (e) => toast("error", e instanceof ApiError ? e.message : "خطا"),
  });
  const bulkApprove = useMutation({
    mutationFn: () => api.post<{ approved: number }>("/admin/commissions/bulk-approve", {}),
    onSuccess: (r: { approved: number }) => {
      toast("success", `${r.approved.toLocaleString("fa-IR")} کمیسیون تأیید شد.`);
      invalidate();
    },
    onError: (e) => toast("error", e instanceof ApiError ? e.message : "خطا"),
  });

  const rows = (list.data ?? []).filter((c) => !statusFilter || c.status === statusFilter);
  const sums = rows.reduce(
    (a, c) => ({ ...a, [c.status]: (a[c.status] ?? 0) + c.amount }),
    {} as Record<string, number>
  );
  const pendingCount = (list.data ?? []).filter((c) => c.status === "pending").length;

  return (
    <div className="space-y-4">
      {(list.data ?? []).length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(["pending", "approved", "paid", "cancelled"] as const).map((s) => (
            <Stat key={s} label={COMM_STATUS[s][0]} value={fmt(sums[s] ?? 0)} />
          ))}
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        {pendingCount > 1 ? (
          <button className="btn-ghost btn-sm" disabled={bulkApprove.isPending} onClick={() => bulkApprove.mutate()}>
            <Check size={13} /> تأیید گروهی ({pendingCount.toLocaleString("fa-IR")})
          </button>
        ) : (
          <span />
        )}
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-40">
          <option value="">همهٔ وضعیت‌ها</option>
          <option value="pending">در انتظار</option>
          <option value="approved">تأییدشده</option>
          <option value="paid">پرداخت‌شده</option>
          <option value="cancelled">لغوشده</option>
        </select>
      </div>
      {list.isLoading && <Skeleton className="h-40" />}
      {list.isError && <ErrorState text="بارگذاری ناموفق بود." onRetry={() => list.refetch()} />}
      {list.data && rows.length === 0 && (
        <EmptyState
          text="کمیسیونی ثبت نشده است"
          hint="با ثبت «حق‌الوکالهٔ دریافتی» در صفحهٔ پرونده، کمیسیون خودکار ساخته می‌شود."
        />
      )}
      {rows.length > 0 && (
        <Table head={["بازاریاب", "پرونده", "نوع", "حق‌الوکاله", "نرخ", "کمیسیون", "وضعیت", "پرداخت", "تاریخ", ""]}>
          {rows.map((c) => (
            <tr key={c.id} className="border-b border-sand-2 last:border-0">
              <td className="td">
                <div className="font-medium">{c.full_name}</div>
                <div dir="ltr" className="font-mono text-[11px] text-ink-2">
                  {c.ref_code}
                </div>
              </td>
              <td className="td">
                {c.tracking_code ? (
                  <a
                    className="font-mono text-[11px] text-gold-1 hover:underline"
                    href={`/requests/${c.request_type}/${c.request_id}`}
                  >
                    {c.tracking_code}
                  </a>
                ) : (
                  "—"
                )}
                {c.client_name && <div className="text-[11px] text-ink-2">{c.client_name}</div>}
              </td>
              <td className="td">
                {c.entry_type === "reversal" ? (
                  <span className="text-[11px] text-red-400">برگشت</span>
                ) : (
                  <span className="text-[11px] text-ink-1">تخصیص</span>
                )}
              </td>
              <td className="td text-[12px] text-ink-1">{c.basis_amount > 0 ? fmt(c.basis_amount) : "—"}</td>
              <td className="td text-[12px] text-ink-1">{c.rate ? `${c.rate.toLocaleString("fa-IR")}٪` : "—"}</td>
              <td className={`td font-medium ${c.amount < 0 ? "text-red-400" : "text-gold-1"}`}>{fmt(c.amount)}</td>
              <td className="td">
                <Pill value={c.status} map={COMM_STATUS} />
              </td>
              <td className="td text-[12px] text-ink-2">
                {c.status === "paid" && c.paid_at ? (
                  <>
                    {faDate(c.paid_at)}
                    {c.paid_note ? <span className="block text-[11px]">{c.paid_note}</span> : null}
                  </>
                ) : (
                  "—"
                )}
              </td>
              <td className="td text-[12px] text-ink-2">{faDate(c.created_at)}</td>
              <td className="td text-left">
                {c.entry_type === "accrual" && c.status === "pending" && (
                  <div className="flex gap-1">
                    <button
                      className="btn-gold btn-sm"
                      disabled={approveComm.isPending}
                      onClick={() => approveComm.mutate(c.id)}
                    >
                      <Check size={13} /> تأیید
                    </button>
                    <button className="btn-ghost btn-sm" onClick={() => setCancelling(c)}>
                      <X size={13} /> لغو
                    </button>
                  </div>
                )}
                {c.entry_type === "accrual" && c.status === "approved" && (
                  <div className="flex gap-1">
                    <button className="btn-gold btn-sm" onClick={() => setPaying(c)}>
                      <Check size={13} /> پرداخت شد
                    </button>
                    <button className="btn-ghost btn-sm" onClick={() => setReversing(c)}>
                      برگشت
                    </button>
                  </div>
                )}
                {c.entry_type === "accrual" && c.status === "paid" && (
                  <button className="btn-ghost btn-sm" onClick={() => setReversing(c)}>
                    برگشت
                  </button>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}

      {/* علامت پرداخت دستی — تاریخ + توضیح */}
      <Drawer open={!!paying} onClose={() => setPaying(null)} title="ثبت پرداخت کمیسیون">
        {paying && (
          <div className="space-y-3">
            <p className="text-sm">
              پرداخت <strong className="text-gold-1">{fmt(paying.amount)}</strong> به{" "}
              <strong>{paying.full_name}</strong> ثبت می‌شود؛ تاریخ همین لحظه درج می‌گردد.
            </p>
            <input
              className="w-full"
              placeholder="توضیح پرداخت (شماره فیش، روش واریز…)"
              value={payNote}
              onChange={(e) => setPayNote(e.target.value)}
            />
            <button
              className="btn-gold btn-sm"
              disabled={payComm.isPending}
              onClick={() => payComm.mutate({ id: paying.id, note: payNote })}
            >
              ثبت پرداخت
            </button>
          </div>
        )}
      </Drawer>

      {/* برگشت کمیسیون — ورودی منفی append-only، نه حذف */}
      <Drawer open={!!reversing} onClose={() => setReversing(null)} title="ثبت برگشت کمیسیون">
        {reversing && (
          <div className="space-y-3">
            <p className="text-sm">
              برای برگشت، یک ورودی منفی (reversal) ثبت می‌شود — رکورد اصلی حذف نمی‌گردد. خالی‌گذاشتن مبلغ یعنی برگشت
              کامل {fmt(reversing.amount)}.
            </p>
            <input
              className="w-full"
              inputMode="numeric"
              placeholder={`مبلغ برگشت (تومان) — حداکثر ${reversing.amount.toLocaleString("fa-IR")}`}
              value={revAmount}
              onChange={(e) => setRevAmount(e.target.value)}
            />
            <input
              className="w-full"
              placeholder="دلیل برگشت (عودت وجه به موکل، لغوی پرونده…)"
              value={revNote}
              onChange={(e) => setRevNote(e.target.value)}
            />
            <button
              className="btn-gold btn-sm"
              disabled={reverseComm.isPending}
              onClick={() => {
                const n = Number(revAmount.replace(/[,،\s]/g, ""));
                reverseComm.mutate({
                  id: reversing.id,
                  amount: n > 0 ? n : undefined,
                  note: revNote || undefined,
                });
              }}
            >
              ثبت برگشت
            </button>
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        open={!!cancelling}
        danger
        title="لغو کمیسیون"
        body={`کمیسیون ${cancelling ? fmt(cancelling.amount) : ""} برای ${cancelling?.full_name} لغو شود؟`}
        onCancel={() => setCancelling(null)}
        onConfirm={() => cancelling && cancelComm.mutate({ id: cancelling.id, reason: "لغو دستی" })}
      />
    </div>
  );
}

// ---------- performance report (بازاریابی ← گزارش عملکرد) ----------

interface ReportOut {
  leaderboard: {
    id: string;
    full_name: string;
    phone: string;
    ref_code: string;
    is_active: boolean;
    fraud_flag: boolean;
    earned: number;
    sales: number;
    commissions: { pending: number; approved: number; paid: number; cancelled: number };
    clicks: number;
    unique_clicks: number;
    requests: number;
    accepted: number;
    conversion: number;
    last_activity: string | null;
  }[];
  funnel: { clicks: number; unique_clicks: number; requests: number; accepted: number; sales: number };
  sources: { label: string; clicks: number; unique: number }[];
  suspicious: { id: string; ref_code: string; reason: string; ip: string; created_at: string }[];
}

export function ReportTab() {
  const [q_, setQ] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const params = new URLSearchParams();
  if (q_.trim()) params.set("q", q_.trim());
  if (start) params.set("start", new Date(start).toISOString());
  if (end) params.set("end", new Date(end).toISOString());
  const qs = params.toString();

  const q = useQuery({
    queryKey: ["marketer-report", qs],
    queryFn: () => api.get<ReportOut>(`/admin/marketers/report${qs ? `?${qs}` : ""}`),
  });
  const monthly = useQuery({
    queryKey: ["marketer-monthly"],
    queryFn: () =>
      api.get<{ month: string; referrals: number; accrued: number; paid: number }[]>("/admin/marketers/report/monthly"),
  });
  const funnel = q.data?.funnel;
  const maxBar = funnel?.clicks || 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="w-52"
          placeholder="جستجو: نام، کد یا موبایل"
          value={q_}
          onChange={(e) => setQ(e.target.value)}
        />
        <input
          type="datetime-local"
          dir="ltr"
          title="از تاریخ"
          value={start}
          onChange={(e) => setStart(e.target.value)}
        />
        <input type="datetime-local" dir="ltr" title="تا تاریخ" value={end} onChange={(e) => setEnd(e.target.value)} />
        <a
          className="btn-ghost btn-sm mr-auto"
          href={`${location.origin}/api/v1/admin/marketers/report.csv${qs ? `?${qs}` : ""}`}
          download
        >
          <Download size={13} /> خروجی CSV
        </a>
      </div>
      <p className="text-[13px] text-ink-2">رتبه‌بندی، قیف تبدیل، فروش، کمیسیون و موارد مشکوک</p>

      {q.isLoading && <Skeleton className="h-56" />}
      {q.isError && <ErrorState text="بارگذاری ناموفق بود." onRetry={() => q.refetch()} />}

      {q.data && (
        <>
          {/* funnel */}
          <div className="card p-4">
            <h3 className="mb-3 text-[14px] font-semibold">قیف تبدیل کل</h3>
            <div className="space-y-2">
              {(
                [
                  ["کلیک", funnel!.clicks],
                  ["کلیک یکتا", funnel!.unique_clicks],
                  ["درخواست", funnel!.requests],
                  ["پذیرفته", funnel!.accepted],
                ] as [string, number][]
              ).map(([label, n], i) => (
                <div key={label} className="flex items-center gap-3">
                  <span className="w-20 shrink-0 text-[12px] text-ink-2">{label}</span>
                  <div className="h-5 flex-1 rounded bg-sand-1">
                    <div
                      className="h-full rounded bg-gradient-to-l from-gold-2 to-gold-1 transition-all"
                      style={{ width: `${Math.max(2, (n / maxBar) * 100)}%`, opacity: 1 - i * 0.15 }}
                    />
                  </div>
                  <span className="w-16 shrink-0 text-left text-[13px] font-semibold" dir="ltr">
                    {n.toLocaleString("fa-IR")}
                  </span>
                </div>
              ))}
            </div>
            {funnel!.sales > 0 && (
              <p className="mt-3 border-t border-sand-2 pt-3 text-[13px] text-ink-1">
                مجموع فروش پرونده‌های پذیرفته: <strong className="text-gold-1">{fmt(funnel!.sales)}</strong>
              </p>
            )}
          </div>

          {/* leaderboard — بازاریاب‌ها و فعالیتشان */}
          <div className="card p-4">
            <h3 className="mb-3 text-[14px] font-semibold">بازاریاب‌ها و فعالیتشان</h3>
            <Table head={["#", "بازاریاب", "کلیک", "لید/پرونده", "موفق", "فروش", "کمیسیون", "آخرین فعالیت"]}>
              {q.data.leaderboard.map((b, i) => (
                <tr key={b.id} className="border-b border-sand-2 last:border-0">
                  <td className="td text-ink-3">{(i + 1).toLocaleString("fa-IR")}</td>
                  <td className="td">
                    <div className="font-medium">{b.full_name}</div>
                    <div dir="ltr" className="font-mono text-[11px] text-ink-2">
                      {b.ref_code}
                    </div>
                  </td>
                  <td className="td">{b.clicks.toLocaleString("fa-IR")}</td>
                  <td className="td">{b.requests.toLocaleString("fa-IR")}</td>
                  <td className="td">{b.accepted.toLocaleString("fa-IR")}</td>
                  <td className="td">{b.sales ? fmt(b.sales) : "—"}</td>
                  <td className="td text-[12px]">
                    <span className="font-medium text-gold-1">{fmt(b.earned)}</span>
                    <span className="block text-[11px] text-ink-2">
                      انتظار {fmt(b.commissions.pending)} · تأیید {fmt(b.commissions.approved)} · پرداخت{" "}
                      {fmt(b.commissions.paid)}
                    </span>
                  </td>
                  <td className="td text-[12px] text-ink-2">{b.last_activity ? faDateTime(b.last_activity) : "—"}</td>
                </tr>
              ))}
              {q.data.leaderboard.length === 0 && (
                <tr>
                  <td className="td py-6 text-center text-ink-2" colSpan={8}>
                    بازاریابی نیست
                  </td>
                </tr>
              )}
            </Table>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* top sources */}
            <div className="card p-4">
              <h3 className="mb-3 text-[14px] font-semibold">منابع پرترافیک</h3>
              {q.data.sources.length === 0 && <p className="text-[12px] text-ink-2">کلیکی ثبت نشده است.</p>}
              <div className="space-y-1.5">
                {q.data.sources.map((s) => (
                  <div
                    key={s.label}
                    className="flex items-center justify-between rounded-lg border border-sand-2 px-3 py-2 text-[13px]"
                  >
                    <span dir="ltr" className="font-mono text-[12px]">
                      {s.label}
                    </span>
                    <span className="text-ink-2">
                      {s.clicks.toLocaleString("fa-IR")} کلیک ({s.unique.toLocaleString("fa-IR")} یکتا)
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* suspicious */}
            <div className="card border-red-500/20 p-4">
              <h3 className="mb-3 text-[14px] font-semibold text-red-400">موارد مشکوک</h3>
              {q.data.suspicious.length === 0 && <p className="text-[12px] text-ink-2">موردی نیست — پاک است.</p>}
              <div className="max-h-56 space-y-1.5 overflow-y-auto">
                {q.data.suspicious.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-[12px]"
                  >
                    <span dir="ltr" className="font-mono">
                      {s.ref_code}
                    </span>
                    <span className="text-ink-2">
                      {s.reason} — {s.ip}
                    </span>
                    <span className="text-ink-3">{faDateTime(s.created_at)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* monthly rollup — جمع‌های ماهانهٔ ارجاع و کمیسیون */}
          <div className="card p-4">
            <h3 className="mb-3 text-[14px] font-semibold">جمع‌های ماهانه</h3>
            {monthly.data && monthly.data.length === 0 && <p className="text-[12px] text-ink-2">داده‌ای نیست.</p>}
            {monthly.data && monthly.data.length > 0 && (
              <Table head={["ماه", "ارجاع", "کمیسیون تخصیص‌یافته", "کمیسیون پرداخت‌شده"]}>
                {[...monthly.data].reverse().map((m) => (
                  <tr key={m.month} className="border-b border-sand-2 last:border-0">
                    <td className="td" dir="ltr">
                      {m.month}
                    </td>
                    <td className="td">{m.referrals.toLocaleString("fa-IR")}</td>
                    <td className="td text-gold-1">{fmt(m.accrued)}</td>
                    <td className="td">{fmt(m.paid)}</td>
                  </tr>
                ))}
              </Table>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ---------- referral settings (بازاریابی ← تنظیمات ارجاع) ----------

interface CommissionSettings {
  marketing_enabled: boolean;
  default_rate: number;
  cookie_days: number;
  reapply_days: number;
}

export function SettingsTab() {
  const toast = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState<CommissionSettings | null>(null);

  const q = useQuery({
    queryKey: ["setting-commission"],
    queryFn: () => api.get<{ value: Partial<CommissionSettings> }>("/admin/settings/commission"),
  });

  const defaults: CommissionSettings = {
    marketing_enabled: false,
    default_rate: 0,
    cookie_days: 30,
    reapply_days: 14,
  };
  const current = form ?? { ...defaults, ...(q.data?.value ?? {}) };
  const set = <K extends keyof CommissionSettings>(k: K, v: CommissionSettings[K]) => setForm({ ...current, [k]: v });

  const save = useMutation({
    mutationFn: () => api.put("/admin/settings/commission", { value: current }),
    onSuccess: () => {
      toast("success", "تنظیمات ذخیره شد.");
      qc.invalidateQueries({ queryKey: ["setting-commission"] });
    },
    onError: (e) => toast("error", e instanceof ApiError ? e.message : "خطا"),
  });

  const num = (v: string) => Number(v.replace(/[^0-9]/g, "")) || 0;

  return (
    <div className="max-w-xl space-y-4">
      {q.isLoading && <Skeleton className="h-56" />}
      {q.data && (
        <div className="card space-y-4 p-5">
          <label className="flex items-center justify-between gap-3">
            <span>
              <span className="block text-[14px] font-medium">بازاریابی و ارجاع فعال</span>
              <span className="block text-[12px] text-ink-2">
                با خاموش‌بودن، همهٔ لینک‌ها/منوها/روت‌های بازاریابی در سایت و پنل پنهان می‌شوند و API مربوطه ۴۰۴ می‌دهد.
              </span>
            </span>
            <button
              className={`inline-flex items-center gap-1 text-[13px] ${current.marketing_enabled ? "text-emerald-400" : "text-ink-3"}`}
              onClick={() => set("marketing_enabled", !current.marketing_enabled)}
            >
              {current.marketing_enabled ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
              {current.marketing_enabled ? "فعال" : "غیرفعال"}
            </button>
          </label>

          {(
            [
              ["cookie_days", "عمر کوکی ارجاع (روز)"],
              ["reapply_days", "فاصلهٔ درخواست مجدد پس از رد (روز)"],
            ] as [keyof CommissionSettings, string][]
          ).map(([k, label]) => (
            <label key={k} className="block">
              <span className="mb-1 block text-[12px] text-ink-2">{label}</span>
              <div className="w-48">
                <input
                  dir="ltr"
                  value={String(current[k] ?? 0)}
                  onChange={(e) => set(k, num(e.target.value) as never)}
                />
              </div>
            </label>
          ))}

          <p className="text-[12px] text-ink-2">
            درصد کمیسیون در تب «قواعد کمیسیون» تنظیم می‌شود؛ درصد اختصاصی هر بازاریاب در صفحهٔ جزئیات خودش.
          </p>
          <button className="btn-gold btn-sm" disabled={save.isPending} onClick={() => save.mutate()}>
            ذخیره تنظیمات
          </button>
        </div>
      )}
      {q.isError && <ErrorState text="بارگذاری تنظیمات ناموفق بود." onRetry={() => q.refetch()} />}
    </div>
  );
}

// ---------- referrals admin (بازاریابی ← ارجاع‌ها) ----------

interface AdminReferralOut {
  id: string;
  marketer_id: string;
  marketer_name: string;
  ref_code: string;
  flag: string;
  request_id: string;
  tracking_code: string;
  client_name: string;
  status: string;
  created_at: string;
}

export function ReferralsTab() {
  const toast = useToast();
  const qc = useQueryClient();
  const [flagFilter, setFlagFilter] = useState("");
  const [search, setSearch] = useState("");
  const [attaching, setAttaching] = useState(false);
  const [trackCode, setTrackCode] = useState("");
  const [refCode, setRefCode] = useState("");

  const q = useQuery({
    queryKey: ["admin-referrals", flagFilter, search],
    queryFn: () => {
      const p = new URLSearchParams();
      if (flagFilter) p.set("flag", flagFilter);
      if (search.trim()) p.set("q", search.trim());
      const qs = p.toString();
      return api.get<AdminReferralOut[]>(`/admin/marketers/referrals${qs ? `?${qs}` : ""}`);
    },
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-referrals"] });

  const flagMut = useMutation({
    mutationFn: ({ id, flag }: { id: string; flag: string }) => api.patch(`/admin/marketers/referrals/${id}`, { flag }),
    onSuccess: () => {
      toast("success", "به‌روز شد.");
      invalidate();
    },
    onError: (e) => toast("error", e instanceof ApiError ? e.message : "خطا"),
  });

  const attach = useMutation({
    mutationFn: (p: { tracking_code: string; ref_code: string }) =>
      api.post<{ reassigned: boolean }>("/admin/marketers/referrals/attach", p),
    onSuccess: (r: { reassigned: boolean }) => {
      toast("success", r.reassigned ? "ارجاع به بازاریاب جدید منتقل شد." : "ارجاع متصل شد.");
      setAttaching(false);
      setTrackCode("");
      setRefCode("");
      invalidate();
    },
    onError: (e) => toast("error", e instanceof ApiError ? e.message : "خطا"),
  });

  const rows = q.data ?? [];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <input
            className="w-52 !py-1.5 text-[13px]"
            placeholder="جستجو (نام بازاریاب، کد)…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select value={flagFilter} onChange={(e) => setFlagFilter(e.target.value)} className="w-36 !py-1.5">
            <option value="">همه</option>
            <option value="review">نیازمند بررسی</option>
          </select>
        </div>
        <button className="btn-gold btn-sm" onClick={() => setAttaching(true)}>
          <Plus size={13} /> اتصال دستی به پرونده
        </button>
      </div>

      {q.isLoading && <Skeleton className="h-40" />}
      {q.isError && <ErrorState text="بارگذاری ناموفق بود." onRetry={() => q.refetch()} />}
      {q.data && rows.length === 0 && <EmptyState text="ارجاعی ثبت نشده است" />}
      {rows.length > 0 && (
        <Table head={["بازاریاب", "کد", "مراجع", "پرونده", "وضعیت پرونده", "پرچم", "تاریخ", ""]}>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-sand-2 last:border-0">
              <td className="td font-medium">{r.marketer_name}</td>
              <td className="td">
                <span dir="ltr" className="font-mono text-[11px] text-gold-1">
                  {r.ref_code}
                </span>
              </td>
              <td className="td">{r.client_name || "—"}</td>
              <td className="td">
                {r.tracking_code ? (
                  <a
                    className="font-mono text-[11px] text-gold-1 hover:underline"
                    href={`/requests/consultation/${r.request_id}`}
                  >
                    {r.tracking_code}
                  </a>
                ) : (
                  "—"
                )}
              </td>
              <td className="td">{r.status ? <Pill value={r.status} map={STATUS_PILL} /> : "—"}</td>
              <td className="td">
                {r.flag === "review" ? (
                  <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-400">
                    نیازمند بررسی
                  </span>
                ) : (
                  <span className="text-[11px] text-ink-3">—</span>
                )}
              </td>
              <td className="td text-[12px] text-ink-2">{faDate(r.created_at)}</td>
              <td className="td text-left">
                <button
                  className="btn-ghost btn-sm"
                  onClick={() => flagMut.mutate({ id: r.id, flag: r.flag === "review" ? "" : "review" })}
                >
                  {r.flag === "review" ? "رفع پرچم" : "پرچم بررسی"}
                </button>
              </td>
            </tr>
          ))}
        </Table>
      )}
      <p className="text-[12px] text-ink-3">ارجاعِ «نیازمند بررسی» تا رفع پرچم هیچ کمیسیونی نمی‌سازد.</p>

      <Drawer open={attaching} onClose={() => setAttaching(false)} title="اتصال دستی ارجاع به پرونده">
        <div className="space-y-3">
          <p className="text-[13px] text-ink-2">
            پرونده را با کد پیگیری و کد معرف به یک بازاریاب وصل کنید؛ اگر قبلاً ارجاع داشته، انتساب جایگزین می‌شود (با
            ثبت در لاگ ممیزی).
          </p>
          <input
            className="w-full"
            placeholder="کد پیگیری پرونده (مثلاً DN-1234)"
            value={trackCode}
            onChange={(e) => setTrackCode(e.target.value)}
          />
          <input
            className="w-full"
            dir="ltr"
            placeholder="کد معرف بازاریاب (DN-XXXXXX)"
            value={refCode}
            onChange={(e) => setRefCode(e.target.value)}
          />
          <button
            className="btn-gold btn-sm"
            disabled={attach.isPending || !trackCode.trim() || !refCode.trim()}
            onClick={() => attach.mutate({ tracking_code: trackCode.trim(), ref_code: refCode.trim() })}
          >
            {attach.isPending ? "در حال اتصال…" : "اتصال"}
          </button>
        </div>
      </Drawer>
    </div>
  );
}

// ---------- versioned terms (بازاریابی ← قوانین همکاری) ----------

interface TermsOut {
  id: string;
  version: number;
  is_active: boolean;
  body: string;
  created_at: string;
}

export function TermsTab() {
  const toast = useToast();
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");
  const [showNew, setShowNew] = useState(false);

  const q = useQuery({
    queryKey: ["marketing-terms"],
    queryFn: () => api.get<TermsOut[]>("/admin/marketers/terms"),
  });

  const create = useMutation({
    mutationFn: (body: string) => api.post("/admin/marketers/terms", { body }),
    onSuccess: () => {
      toast("success", "نسخهٔ جدید قوانین فعال شد.");
      setDraft("");
      setShowNew(false);
      qc.invalidateQueries({ queryKey: ["marketing-terms"] });
    },
    onError: (e) => toast("error", e instanceof ApiError ? e.message : "خطا"),
  });

  const rows = q.data ?? [];
  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-ink-2">
          هر ویرایش یک نسخهٔ جدید می‌سازد؛ نسخهٔ پذیرفته‌شدهٔ هر بازاریاب ثبت می‌ماند.
        </p>
        <button className="btn-gold btn-sm" onClick={() => setShowNew((v) => !v)}>
          <Plus size={13} /> نسخهٔ جدید
        </button>
      </div>

      {showNew && (
        <div className="card space-y-3 p-4">
          <textarea
            className="min-h-40 w-full text-[13px] leading-6"
            placeholder="متن قوانین و شرایط همکاری در بازاریابی…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-ink-3">حداقل ۲۰ نویسه — پس از ذخیره، نسخهٔ قبلی غیرفعال می‌شود.</span>
            <button
              className="btn-gold btn-sm"
              disabled={create.isPending || draft.trim().length < 20}
              onClick={() => create.mutate(draft.trim())}
            >
              انتشار نسخهٔ جدید
            </button>
          </div>
        </div>
      )}

      {q.isLoading && <Skeleton className="h-40" />}
      {q.data && rows.length === 0 && (
        <EmptyState
          text="هنوز نسخه‌ای از قوانین منتشر نشده است"
          hint="پیش از بازکردن درخواست همکاری، یک نسخه بسازید."
        />
      )}
      <div className="space-y-2">
        {rows.map((t) => (
          <details key={t.id} className="card p-4" open={t.is_active}>
            <summary className="flex cursor-pointer items-center justify-between text-[13px] font-medium">
              <span>
                نسخهٔ {t.version.toLocaleString("fa-IR")}
                {t.is_active && (
                  <span className="ms-2 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-400">
                    فعال
                  </span>
                )}
              </span>
              <span className="text-[11px] text-ink-3">{faDate(t.created_at)}</span>
            </summary>
            <p className="mt-3 whitespace-pre-line border-t border-line pt-3 text-[13px] leading-6 text-ink-2">
              {t.body}
            </p>
          </details>
        ))}
      </div>
    </div>
  );
}
