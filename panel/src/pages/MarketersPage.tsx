/** Marketer management — profiles+stats, applications, commissions+rules,
 *  payouts, and commission settings. Backend: /admin/marketers*,
 *  /admin/commissions*, /admin/payouts*, /admin/settings/commission. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Eye, Plus, ToggleLeft, ToggleRight, X } from "lucide-react";
import { useState } from "react";
import { api, ApiError } from "../services/api";
import {
  ConfirmDialog,
  Drawer,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
  Table,
  Tabs,
  useToast,
} from "../components/ui";

// ---------- types ----------

interface Stats {
  clicks: number;
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
  full_name: string;
  phone: string;
  stats: Stats;
  created_at: string;
}

interface ApplicationOut {
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

interface ReferralOut {
  id: string;
  created_at: string;
  tracking_code?: string;
  full_name?: string;
  phone?: string;
  status?: string;
}

interface CommissionOut {
  id: string;
  marketer_id: string;
  full_name: string;
  ref_code: string;
  amount: number;
  status: string;
  basis_kind: string;
  basis_amount: number;
  hold_until: string | null;
  created_at: string;
}

interface RuleOut {
  id: string;
  kind: "fixed" | "percent";
  value: number;
  tier_min: number;
  marketer_id: string | null;
  is_active: boolean;
}

interface PayoutOut {
  id: string;
  full_name: string;
  ref_code: string;
  amount: number;
  status: string;
  iban_masked: string;
  payment_ref: string;
  reject_reason: string;
  created_at: string;
}

// ---------- helpers ----------

const fmt = (n: number) => `${n.toLocaleString("fa-IR")} ریال`;
const faDate = (iso: string) => new Date(iso).toLocaleDateString("fa-IR");

const APP_STATUS: Record<string, [string, string]> = {
  pending: ["در انتظار", "bg-amber-500/10 text-amber-400"],
  approved: ["تأییدشده", "bg-emerald-500/10 text-emerald-400"],
  rejected: ["رد شده", "bg-red-500/10 text-red-400"],
};
const COMM_STATUS: Record<string, [string, string]> = {
  pending: ["در هولد", "bg-amber-500/10 text-amber-400"],
  approved: ["تأییدشده", "bg-emerald-500/10 text-emerald-400"],
  paid: ["پرداخت‌شده", "bg-emerald-600/15 text-emerald-300"],
  cancelled: ["لغوشده", "bg-red-500/10 text-red-400"],
};
const PAYOUT_STATUS: Record<string, [string, string]> = {
  pending: ["در انتظار", "bg-amber-500/10 text-amber-400"],
  paid: ["پرداخت‌شده", "bg-emerald-500/10 text-emerald-400"],
  rejected: ["رد شده", "bg-red-500/10 text-red-400"],
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

// ---------- page ----------

export default function MarketersPage() {
  const [tab, setTab] = useState("profiles");
  const apps = useQuery({
    queryKey: ["marketer-apps"],
    queryFn: () => api.get<ApplicationOut[]>("/admin/marketers/applications"),
  });
  const pendingCount = (apps.data ?? []).filter((a) => a.status === "pending").length;

  return (
    <div>
      <PageHeader
        title="مدیریت بازاریابی"
        subtitle="بازاریاب‌ها، درخواست‌ها، کمیسیون، برداشت و تنظیمات ارجاع"
      />
      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: "profiles", label: "بازاریاب‌ها" },
          { key: "applications", label: "درخواست‌ها", count: pendingCount || undefined },
          { key: "commissions", label: "کمیسیون‌ها" },
          { key: "payouts", label: "برداشت‌ها" },
          { key: "settings", label: "تنظیمات" },
        ]}
      />
      <div className="pt-4">
        {tab === "profiles" && <ProfilesTab />}
        {tab === "applications" && <ApplicationsTab apps={apps} />}
        {tab === "commissions" && <CommissionsTab />}
        {tab === "payouts" && <PayoutsTab />}
        {tab === "settings" && <SettingsTab />}
      </div>
    </div>
  );
}

// ---------- profiles ----------

function ProfilesTab() {
  const toast = useToast();
  const qc = useQueryClient();
  const [refsFor, setRefsFor] = useState<ProfileOut | null>(null);

  const list = useQuery({
    queryKey: ["marketer-profiles"],
    queryFn: () => api.get<ProfileOut[]>("/admin/marketers"),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["marketer-profiles"] });

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, boolean> }) =>
      api.patch(`/admin/marketers/${id}`, body),
    onSuccess: invalidate,
    onError: (e) => toast("error", e instanceof ApiError ? e.message : "خطا"),
  });

  const rows = list.data ?? [];
  const totals = rows.reduce(
    (acc, p) => ({
      clicks: acc.clicks + p.stats.clicks,
      requests: acc.requests + p.stats.requests,
      accepted: acc.accepted + p.stats.accepted,
    }),
    { clicks: 0, requests: 0, accepted: 0 },
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
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>
      )}
      {list.isError && <ErrorState text="بارگذاری ناموفق بود." onRetry={() => list.refetch()} />}
      {list.data && rows.length === 0 && (
        <EmptyState text="بازاریاب فعالی نیست" hint="با تأیید درخواست‌ها در تب «درخواست‌ها» بازاریاب ساخته می‌شود." />
      )}

      {rows.length > 0 && (
        <Table head={["بازاریاب", "کد ارجاع", "کلیک", "درخواست", "پذیرفته", "نرخ تبدیل", "وضعیت", ""]}>
          {rows.map((p) => (
            <tr key={p.id} className="border-b border-sand-2 last:border-0">
              <td className="td">
                <div className="font-medium">{p.full_name}</div>
                <div dir="ltr" className="text-[11px] text-ink-2">{p.phone}</div>
              </td>
              <td className="td">
                <span dir="ltr" className="font-mono text-[12px] text-gold-1">{p.ref_code}</span>
              </td>
              <td className="td">{p.stats.clicks.toLocaleString("fa-IR")}</td>
              <td className="td">{p.stats.requests.toLocaleString("fa-IR")}</td>
              <td className="td">{p.stats.accepted.toLocaleString("fa-IR")}</td>
              <td className="td">{p.stats.conversion.toLocaleString("fa-IR")}٪</td>
              <td className="td">
                <button
                  className={`inline-flex items-center gap-1 text-[12px] ${p.is_active ? "text-emerald-400" : "text-ink-3"}`}
                  onClick={() => patch.mutate({ id: p.id, body: { is_active: !p.is_active } })}
                >
                  {p.is_active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                  {p.is_active ? "فعال" : "غیرفعال"}
                </button>
                {p.fraud_flag && <Pill value="rejected" map={{ rejected: ["پرچم تقلب", "bg-red-500/10 text-red-400"] }} />}
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

function ReferralsDrawer({ profile, onClose }: { profile: ProfileOut | null; onClose: () => void }) {
  const q = useQuery({
    queryKey: ["marketer-refs", profile?.id],
    queryFn: () => api.get<ReferralOut[]>(`/admin/marketers/${profile!.id}/referrals`),
    enabled: !!profile,
  });
  const [copied, setCopied] = useState(false);
  const copy = () => {
    if (!profile) return;
    void navigator.clipboard.writeText(`${location.origin}/?ref=${profile.ref_code}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <Drawer open={!!profile} onClose={onClose} title={profile ? `ارجاع‌های ${profile.full_name}` : ""}>
      {profile && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-sand-2 p-3">
          <span dir="ltr" className="font-mono text-sm text-gold-1">{profile.ref_code}</span>
          <button className="btn-ghost btn-sm" onClick={copy}>
            <Copy size={13} /> {copied ? "کپی شد" : "کپی لینک"}
          </button>
        </div>
      )}
      {q.isLoading && <Skeleton className="h-40" />}
      {q.data && q.data.length === 0 && <EmptyState text="ارجاعی ثبت نشده است" />}
      <div className="space-y-2">
        {(q.data ?? []).map((r) => (
          <div key={r.id} className="card p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium">{r.full_name ?? "—"}</span>
              <span dir="ltr" className="font-mono text-[11px] text-ink-2">{r.tracking_code ?? ""}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-[12px] text-ink-2">
              <span dir="ltr">{r.phone ?? ""}</span>
              <span>{r.created_at && faDate(r.created_at)}</span>
            </div>
            {r.status && <div className="mt-1"><Pill value={r.status} map={STATUS_PILL} /></div>}
          </div>
        ))}
      </div>
    </Drawer>
  );
}

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

// ---------- applications ----------

function ApplicationsTab({ apps }: { apps: ReturnType<typeof useQuery<ApplicationOut[]>> }) {
  const toast = useToast();
  const qc = useQueryClient();
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
            <span dir="ltr" className="text-[12px] text-ink-2">{a.phone}</span>
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
                  <button className="btn-ghost btn-sm" onClick={() => { setRejecting(null); setReason(""); }}>
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

// ---------- commissions + rules ----------

function CommissionsTab() {
  const toast = useToast();
  const qc = useQueryClient();
  const [kind, setKind] = useState<"fixed" | "percent">("fixed");
  const [value, setValue] = useState("");
  const [tierMin, setTierMin] = useState("0");
  const [ruleMarketer, setRuleMarketer] = useState("");
  const [cancelling, setCancelling] = useState<CommissionOut | null>(null);

  const list = useQuery({
    queryKey: ["commissions"],
    queryFn: () => api.get<CommissionOut[]>("/admin/commissions"),
  });
  const rules = useQuery({
    queryKey: ["commission-rules"],
    queryFn: () => api.get<RuleOut[]>("/admin/commissions/rules"),
  });
  const profiles = useQuery({
    queryKey: ["marketer-profiles"],
    queryFn: () => api.get<ProfileOut[]>("/admin/marketers"),
  });
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["commissions"] });
    qc.invalidateQueries({ queryKey: ["commission-rules"] });
  };

  const createRule = useMutation({
    mutationFn: () =>
      api.post("/admin/commissions/rules", {
        kind,
        value: Number(value) || 0,
        tier_min: Number(tierMin) || 0,
        marketer_id: ruleMarketer || null,
      }),
    onSuccess: () => {
      toast("success", "قاعدهٔ کمیسیون ثبت شد.");
      setValue("");
      invalidate();
    },
    onError: (e) => toast("error", e instanceof ApiError ? e.message : "خطا"),
  });
  const toggleRule = useMutation({
    mutationFn: (id: string) => api.post(`/admin/commissions/rules/${id}/toggle`, {}),
    onSuccess: invalidate,
  });
  const approveComm = useMutation({
    mutationFn: (id: string) => api.post(`/admin/commissions/${id}/approve`, {}),
    onSuccess: () => {
      toast("success", "کمیسیون تأیید و به کیف پول واریز شد.");
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

  const nameOf = (mid: string | null) =>
    mid ? profiles.data?.find((p) => p.id === mid)?.full_name ?? "بازاریاب خاص" : "عمومی";

  return (
    <div className="space-y-5">
      {/* قواعد کمیسیون */}
      <div className="card p-4">
        <h3 className="mb-3 text-[14px] font-semibold">قواعد کمیسیون</h3>
        <p className="mb-3 text-[12px] text-ink-2">
          «درصد» از مبلغ قرارداد پروندهٔ پذیرفته‌شده محاسبه می‌شود؛ «مبلغ ثابت» برای هر پذیرش. ردیفِ آستانه: از فلانی پذیرش به بعد اعمال می‌شود.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-28">
            <select value={kind} onChange={(e) => setKind(e.target.value as "fixed" | "percent")}>
              <option value="fixed">مبلغ ثابت</option>
              <option value="percent">درصد</option>
            </select>
          </div>
          <div className="w-36">
            <input
              dir="ltr"
              placeholder={kind === "fixed" ? "مبلغ (ریال)" : "درصد"}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
          <div className="w-28">
            <input
              dir="ltr"
              placeholder="از پذیرشِ n"
              title="حداقل تعداد پذیرش برای این ردیف"
              value={tierMin}
              onChange={(e) => setTierMin(e.target.value)}
            />
          </div>
          <div className="w-44">
            <select value={ruleMarketer} onChange={(e) => setRuleMarketer(e.target.value)}>
              <option value="">همهٔ بازاریاب‌ها</option>
              {(profiles.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.full_name}</option>
              ))}
            </select>
          </div>
          <button
            className="btn-gold btn-sm"
            disabled={createRule.isPending || !Number(value)}
            onClick={() => createRule.mutate()}
          >
            <Plus size={14} /> افزودن قاعده
          </button>
        </div>
        <div className="mt-3 space-y-1.5">
          {(rules.data ?? []).map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-sand-2 px-3 py-2 text-[13px]">
              <span className={r.is_active ? "" : "opacity-50"}>
                {nameOf(r.marketer_id)} — {r.kind === "fixed" ? fmt(r.value) : `${r.value.toLocaleString("fa-IR")}٪`}
                {r.tier_min > 0 && <span className="text-ink-2"> · از {r.tier_min.toLocaleString("fa-IR")}مین پذیرش</span>}
              </span>
              <button
                className={`mr-auto inline-flex items-center gap-1 text-[12px] ${r.is_active ? "text-emerald-400" : "text-ink-3"}`}
                onClick={() => toggleRule.mutate(r.id)}
              >
                {r.is_active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                {r.is_active ? "فعال" : "غیرفعال"}
              </button>
            </div>
          ))}
          {rules.data && rules.data.length === 0 && (
            <p className="text-[12px] text-ink-2">قاعده‌ای نیست — تا قاعده فعال تعریف نشود کمیسیونی ثبت نمی‌شود.</p>
          )}
        </div>
      </div>

      {/* لیست کمیسیون‌ها */}
      {list.isLoading && <Skeleton className="h-40" />}
      {list.isError && <ErrorState text="بارگذاری ناموفق بود." onRetry={() => list.refetch()} />}
      {list.data && list.data.length === 0 && <EmptyState text="کمیسیونی ثبت نشده است" />}
      {(list.data ?? []).length > 0 && (
        <Table head={["بازاریاب", "مبلغ", "مبنا", "وضعیت", "هولد تا", "تاریخ", ""]}>
          {(list.data ?? []).map((c) => (
            <tr key={c.id} className="border-b border-sand-2 last:border-0">
              <td className="td">
                <div className="font-medium">{c.full_name}</div>
                <div dir="ltr" className="font-mono text-[11px] text-ink-2">{c.ref_code}</div>
              </td>
              <td className="td font-medium text-gold-1">{fmt(c.amount)}</td>
              <td className="td text-[12px] text-ink-1">
                {c.basis_kind === "percent" ? "درصدی" : "ثابت"}
                {c.basis_kind === "percent" && c.basis_amount > 0 && (
                  <span className="block text-[11px] text-ink-2">قرارداد: {fmt(c.basis_amount)}</span>
                )}
              </td>
              <td className="td"><Pill value={c.status} map={COMM_STATUS} /></td>
              <td className="td text-[12px] text-ink-2">{c.hold_until ? faDate(c.hold_until) : "—"}</td>
              <td className="td text-[12px] text-ink-2">{faDate(c.created_at)}</td>
              <td className="td text-left">
                {c.status === "pending" && (
                  <div className="flex gap-1">
                    <button className="btn-gold btn-sm" disabled={approveComm.isPending} onClick={() => approveComm.mutate(c.id)}>
                      <Check size={13} /> تأیید
                    </button>
                    <button className="btn-ghost btn-sm" onClick={() => setCancelling(c)}>
                      <X size={13} /> لغو
                    </button>
                  </div>
                )}
                {c.status === "approved" && (
                  <button className="btn-ghost btn-sm" onClick={() => setCancelling(c)}>
                    <X size={13} /> لغو
                  </button>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}

      <ConfirmDialog
        open={!!cancelling}
        danger
        title="لغو کمیسیون"
        body={`کمیسیون ${cancelling ? fmt(cancelling.amount) : ""} برای ${cancelling?.full_name} لغو شود؟${cancelling?.status === "approved" ? " مبلغ از کیف پول برمی‌گردد." : ""}`}
        onCancel={() => setCancelling(null)}
        onConfirm={() => cancelling && cancelComm.mutate({ id: cancelling.id, reason: "لغو دستی" })}
      />
    </div>
  );
}

// ---------- payouts ----------

function PayoutsTab() {
  const toast = useToast();
  const qc = useQueryClient();
  const [approving, setApproving] = useState<PayoutOut | null>(null);
  const [rejecting, setRejecting] = useState<PayoutOut | null>(null);
  const [paymentRef, setPaymentRef] = useState("");
  const [reason, setReason] = useState("");

  const list = useQuery({
    queryKey: ["payouts"],
    queryFn: () => api.get<PayoutOut[]>("/admin/payouts"),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["payouts"] });

  const approve = useMutation({
    mutationFn: ({ id, payment_ref }: { id: string; payment_ref: string }) =>
      api.post(`/admin/payouts/${id}/approve`, { payment_ref }),
    onSuccess: () => {
      toast("success", "برداشت پرداخت شد.");
      setApproving(null);
      setPaymentRef("");
      invalidate();
    },
    onError: (e) => toast("error", e instanceof ApiError ? e.message : "خطا"),
  });
  const reject = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post(`/admin/payouts/${id}/reject`, { reason }),
    onSuccess: () => {
      toast("success", "برداشت رد شد.");
      setRejecting(null);
      setReason("");
      invalidate();
    },
    onError: (e) => toast("error", e instanceof ApiError ? e.message : "خطا"),
  });

  const rows = list.data ?? [];

  return (
    <div className="space-y-3">
      {list.isLoading && <Skeleton className="h-40" />}
      {list.isError && <ErrorState text="بارگذاری ناموفق بود." onRetry={() => list.refetch()} />}
      {list.data && rows.length === 0 && <EmptyState text="درخواست برداشتی نیست" />}
      {rows.length > 0 && (
        <Table head={["بازاریاب", "مبلغ", "شبا", "وضعیت", "تاریخ", "پیگیری/دلیل", ""]}>
          {rows.map((p) => (
            <tr key={p.id} className="border-b border-sand-2 last:border-0">
              <td className="td">
                <div className="font-medium">{p.full_name}</div>
                <div dir="ltr" className="font-mono text-[11px] text-ink-2">{p.ref_code}</div>
              </td>
              <td className="td font-medium text-gold-1">{fmt(p.amount)}</td>
              <td className="td" dir="ltr"><span className="font-mono text-[12px]">{p.iban_masked || "—"}</span></td>
              <td className="td"><Pill value={p.status} map={PAYOUT_STATUS} /></td>
              <td className="td text-[12px] text-ink-2">{faDate(p.created_at)}</td>
              <td className="td text-[12px] text-ink-1">
                {p.payment_ref || p.reject_reason || "—"}
              </td>
              <td className="td text-left">
                {p.status === "pending" && (
                  <div className="flex gap-1">
                    <button className="btn-gold btn-sm" onClick={() => setApproving(p)}>
                      <Check size={13} /> پرداخت
                    </button>
                    <button className="btn-ghost btn-sm" onClick={() => setRejecting(p)}>
                      <X size={13} /> رد
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}

      {/* پرداخت */}
      <Drawer open={!!approving} onClose={() => setApproving(null)} title="ثبت پرداخت">
        {approving && (
          <div className="space-y-3">
            <p className="text-sm">
              پرداخت <strong className="text-gold-1">{fmt(approving.amount)}</strong> به{" "}
              <strong>{approving.full_name}</strong> ({approving.iban_masked || "بدون شبا"})
            </p>
            <input
              dir="ltr"
              className="w-full"
              placeholder="شماره پیگیری پرداخت *"
              value={paymentRef}
              onChange={(e) => setPaymentRef(e.target.value)}
            />
            <button
              className="btn-gold btn-sm"
              disabled={approve.isPending || paymentRef.trim().length < 2}
              onClick={() => approve.mutate({ id: approving.id, payment_ref: paymentRef })}
            >
              ثبت پرداخت
            </button>
          </div>
        )}
      </Drawer>

      {/* رد */}
      <Drawer open={!!rejecting} onClose={() => setRejecting(null)} title="رد برداشت">
        {rejecting && (
          <div className="space-y-3">
            <p className="text-sm">رد برداشت {fmt(rejecting.amount)} برای {rejecting.full_name}</p>
            <input
              className="w-full"
              placeholder="دلیل رد"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <button
              className="btn-danger btn-sm"
              disabled={reject.isPending}
              onClick={() => reject.mutate({ id: rejecting.id, reason })}
            >
              ثبت رد
            </button>
          </div>
        )}
      </Drawer>
    </div>
  );
}

// ---------- settings ----------

interface CommissionSettings {
  commission_enabled: boolean;
  basis: string;
  min_payout: number;
  hold_days: number;
  cookie_days: number;
  monthly_cap: number;
  reapply_days: number;
}

function SettingsTab() {
  const toast = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState<CommissionSettings | null>(null);

  const q = useQuery({
    queryKey: ["setting-commission"],
    queryFn: () => api.get<{ value: Partial<CommissionSettings> }>("/admin/settings/commission"),
  });

  const defaults: CommissionSettings = {
    commission_enabled: false,
    basis: "fixed",
    min_payout: 1_000_000,
    hold_days: 14,
    cookie_days: 30,
    monthly_cap: 0,
    reapply_days: 14,
  };
  const current = form ?? { ...defaults, ...(q.data?.value ?? {}) };
  const set = <K extends keyof CommissionSettings>(k: K, v: CommissionSettings[K]) =>
    setForm({ ...current, [k]: v });

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
              <span className="block text-[14px] font-medium">کمیسیون فعال</span>
              <span className="block text-[12px] text-ink-2">با خاموش‌بودن، کمیسیونی ثبت نمی‌شود و کیف پول بازاریاب پنهان می‌ماند.</span>
            </span>
            <button
              className={`inline-flex items-center gap-1 text-[13px] ${current.commission_enabled ? "text-emerald-400" : "text-ink-3"}`}
              onClick={() => set("commission_enabled", !current.commission_enabled)}
            >
              {current.commission_enabled ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
              {current.commission_enabled ? "فعال" : "غیرفعال"}
            </button>
          </label>

          {(
            [
              ["min_payout", "حداقل مبلغ برداشت (ریال)"],
              ["hold_days", "ایام هولد کمیسیون (روز)"],
              ["cookie_days", "عمر کوکی ارجاع (روز)"],
              ["monthly_cap", "سقف کمیسیون ماهانه (ریال — ۰ یعنی نامحدود)"],
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

          <button className="btn-gold btn-sm" disabled={save.isPending} onClick={() => save.mutate()}>
            ذخیره تنظیمات
          </button>
        </div>
      )}
      {q.isError && <ErrorState text="بارگذاری تنظیمات ناموفق بود." onRetry={() => q.refetch()} />}
    </div>
  );
}
