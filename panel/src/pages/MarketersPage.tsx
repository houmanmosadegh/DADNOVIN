/** Marketer applications + profiles + per-marketer referral audit. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ChevronDown, XCircle } from "lucide-react";
import { useState } from "react";
import { api } from "../services/api";
import { ConfirmDialog, PageSkeleton, Table, fmtDate, useToast } from "../components/ui";

interface Application {
  id: string;
  user_id: string;
  full_name: string;
  phone: string;
  status: string;
  note: string;
  created_at: string;
}

interface MarketerRow {
  id: string;
  full_name: string;
  phone: string;
  ref_code: string;
  is_active: boolean;
  fraud_flag: boolean;
  iban_masked: string;
  card_masked: string;
  created_at: string;
  stats: { clicks: number; requests: number; accepted: number; conversion: number };
}

interface ReferralRow {
  id: string;
  tracking_code?: string;
  full_name?: string;
  phone?: string;
  status?: string;
  created_at: string;
  ip: string;
  ua: string;
}

const STATUS_FA: Record<string, string> = {
  new: "جدید", reviewing: "در حال بررسی", awaiting_call: "در انتظار تماس",
  followed_up: "پیگیری شد", consulted: "مشاوره انجام شد",
  accepted: "پذیرفته شد", rejected: "رد شد", completed: "تکمیل شد", cancelled: "لغو شد",
  pending: "در انتظار",
};

export default function MarketersPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const apps = useQuery({
    queryKey: ["mk-applications"],
    queryFn: () => api.get<Application[]>("/admin/marketers/applications"),
  });
  const profiles = useQuery({
    queryKey: ["mk-profiles"],
    queryFn: () => api.get<MarketerRow[]>("/admin/marketers"),
  });
  const referrals = useQuery({
    queryKey: ["mk-referrals", expanded],
    queryFn: () => api.get<ReferralRow[]>(`/admin/marketers/${expanded}/referrals`),
    enabled: !!expanded,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["mk-applications"] });
    qc.invalidateQueries({ queryKey: ["mk-profiles"] });
  };

  const approve = useMutation({
    mutationFn: (id: string) => api.post(`/admin/marketers/applications/${id}/approve`),
    onSuccess: () => { invalidate(); toast("success", "بازاریاب تأیید شد؛ کد ارجاع صادر شد."); },
    onError: (e) => toast("error", e instanceof Error ? e.message : "خطا"),
  });
  const reject = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post(`/admin/marketers/applications/${id}/reject`, { reason }),
    onSuccess: () => { invalidate(); setRejectId(null); setRejectReason(""); toast("success", "رد شد."); },
    onError: (e) => toast("error", e instanceof Error ? e.message : "خطا"),
  });
  const patchProfile = useMutation({
    mutationFn: ({ id, body }: { id: string; body: object }) =>
      api.patch(`/admin/marketers/${id}`, body),
    onSuccess: () => { invalidate(); toast("success", "به‌روزرسانی شد."); },
    onError: (e) => toast("error", e instanceof Error ? e.message : "خطا"),
  });

  if (apps.isLoading || profiles.isLoading) return <PageSkeleton />;
  const pendingApps = (apps.data ?? []).filter((a) => a.status === "pending");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">بازاریاب‌ها</h1>
        <p className="mt-0.5 text-[13px] text-ink-1/60">
          بررسی درخواست‌های بازاریابی، کدهای ارجاع و آمار هر بازاریاب
        </p>
      </div>

      <section className="card p-5">
        <h2 className="mb-4 text-[14px] font-semibold">
          درخواست‌های در انتظار
          {pendingApps.length > 0 && (
            <span className="mr-2 rounded-full bg-gold-2 px-2 py-0.5 text-[11px] text-ink-0">
              {pendingApps.length.toLocaleString("fa-IR")}
            </span>
          )}
        </h2>
        {pendingApps.length === 0 ? (
          <p className="py-4 text-center text-[13px] text-ink-3">درخواست جدیدی نیست</p>
        ) : (
          <div className="space-y-3">
            {pendingApps.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-sand-2 p-3.5">
                <div className="min-w-40 flex-1">
                  <p className="font-medium">{a.full_name}</p>
                  <p className="text-[12px] text-ink-2" dir="ltr">{a.phone}</p>
                  {a.note && <p className="mt-1 text-[12px] text-ink-2">{a.note}</p>}
                  <p className="mt-1 text-[11px] text-ink-3">{fmtDate(a.created_at)}</p>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <button className="btn-primary btn-sm" disabled={approve.isPending}
                      onClick={() => approve.mutate(a.id)}>
                      <CheckCircle2 size={14} /> تأیید
                    </button>
                    <button className="btn-ghost btn-sm !text-red-400" onClick={() => setRejectId(a.id)}>
                      <XCircle size={14} /> رد
                    </button>
                  </div>
                  {rejectId === a.id && (
                    <input
                      className="text-[12px]"
                      placeholder="دلیل رد (اختیاری)"
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card p-5">
        <h2 className="mb-4 text-[14px] font-semibold">بازاریاب‌های فعال</h2>
        <Table head={["بازاریاب", "کد ارجاع", "آمار", "بانک", "وضعیت", "عملیات"]}>
          {(profiles.data ?? []).map((m) => (
            <>
              <tr key={m.id} className="hover:bg-sand-2">
                <td className="px-4 py-3">
                  <p className="font-medium">{m.full_name}</p>
                  <p className="text-[12px] text-ink-2" dir="ltr">{m.phone}</p>
                </td>
                <td className="px-4 py-3">
                  <code className="rounded bg-sand-1 px-2 py-0.5 text-[12px]" dir="ltr">{m.ref_code}</code>
                </td>
                <td className="px-4 py-3 text-[12px] text-ink-2">
                  کلیک {m.stats.clicks.toLocaleString("fa-IR")} · درخواست {m.stats.requests.toLocaleString("fa-IR")} · پذیرفته {m.stats.accepted.toLocaleString("fa-IR")}
                </td>
                <td className="px-4 py-3 text-[12px] text-ink-2" dir="ltr">
                  {m.iban_masked || "—"}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-[12px] font-medium ${m.is_active ? "text-emerald-400" : "text-red-400"}`}>
                    {m.is_active ? "فعال" : "غیرفعال"}
                  </span>
                  {m.fraud_flag && <span className="mr-2 text-[11px] text-amber-400">⚠ مشکوک</span>}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1.5">
                    <button
                      className="btn-ghost btn-sm"
                      onClick={() => setExpanded(expanded === m.id ? null : m.id)}
                    >
                      <ChevronDown size={13} className={expanded === m.id ? "rotate-180" : ""} /> ارجاع‌ها
                    </button>
                    <button
                      className="btn-ghost btn-sm"
                      onClick={() => patchProfile.mutate({ id: m.id, body: { is_active: !m.is_active } })}
                    >
                      {m.is_active ? "غیرفعال" : "فعال"}
                    </button>
                  </div>
                </td>
              </tr>
              {expanded === m.id && (
                <tr key={`${m.id}-refs`}>
                  <td colSpan={6} className="bg-sand-1/50 px-4 py-3">
                    {referrals.isLoading ? (
                      <p className="text-[12px] text-ink-3">در حال بارگذاری…</p>
                    ) : (referrals.data ?? []).length === 0 ? (
                      <p className="text-[12px] text-ink-3">ارجاعی ثبت نشده</p>
                    ) : (
                      <Table head={["کد رهگیری", "نام", "تلفن", "وضعیت", "تاریخ", "IP"]}>
                        {(referrals.data ?? []).map((r) => (
                          <tr key={r.id}>
                            <td className="px-3 py-2 text-[12px]" dir="ltr">{r.tracking_code ?? "—"}</td>
                            <td className="px-3 py-2 text-[12px]">{r.full_name ?? "—"}</td>
                            <td className="px-3 py-2 text-[12px]" dir="ltr">{r.phone ?? "—"}</td>
                            <td className="px-3 py-2 text-[12px]">{STATUS_FA[r.status ?? ""] ?? r.status}</td>
                            <td className="px-3 py-2 text-[12px] text-ink-2">{fmtDate(r.created_at)}</td>
                            <td className="px-3 py-2 text-[11px] text-ink-3" dir="ltr">{r.ip}</td>
                          </tr>
                        ))}
                      </Table>
                    )}
                  </td>
                </tr>
              )}
            </>
          ))}
        </Table>
        {(profiles.data ?? []).length === 0 && (
          <p className="py-6 text-center text-[13px] text-ink-3">بازاریابی تأیید نشده است</p>
        )}
      </section>

      <ConfirmDialog
        open={!!rejectId}
        title="رد درخواست بازاریابی؟"
        body="متقاضی می‌تواند بعداً دوباره درخواست دهد."
        danger
        onCancel={() => setRejectId(null)}
        onConfirm={() => rejectId && reject.mutate({ id: rejectId, reason: rejectReason })}
      />
    </div>
  );
}
