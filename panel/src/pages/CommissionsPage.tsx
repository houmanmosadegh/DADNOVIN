/** Commission rules (admin-configured) + commission list approve/cancel. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Plus, Power, XCircle } from "lucide-react";
import { useState } from "react";
import { api } from "../services/api";
import { Field, PageSkeleton, Table, fmtDate, useToast } from "../components/ui";

interface Rule {
  id: string;
  kind: "fixed" | "percent";
  value: number;
  tier_min: number;
  marketer_id: string | null;
  is_active: boolean;
  created_at: string;
}

interface CommissionRow {
  id: string;
  marketer_id: string;
  full_name: string;
  ref_code: string;
  request_type: string;
  request_id: string;
  amount: number;
  status: string;
  basis_kind: string;
  basis_amount: number;
  hold_until: string | null;
  created_at: string;
}

const STATUS_FA: Record<string, { label: string; cls: string }> = {
  pending: { label: "در انتظار", cls: "text-amber-400" },
  approved: { label: "قابل برداشت", cls: "text-emerald-400" },
  paid: { label: "پرداخت‌شده", cls: "text-emerald-400" },
  cancelled: { label: "لغو شده", cls: "text-red-400" },
};

const rial = (n: number) => `${n.toLocaleString("fa-IR")} ریال`;

export default function CommissionsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ kind: "fixed", value: "", tier_min: "0" });

  const rules = useQuery({
    queryKey: ["comm-rules"],
    queryFn: () => api.get<Rule[]>("/admin/commissions/rules"),
  });
  const comms = useQuery({
    queryKey: ["comm-list"],
    queryFn: () => api.get<CommissionRow[]>("/admin/commissions"),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["comm-rules"] });
    qc.invalidateQueries({ queryKey: ["comm-list"] });
  };

  const createRule = useMutation({
    mutationFn: () =>
      api.post("/admin/commissions/rules", {
        kind: form.kind,
        value: parseInt(form.value.replace(/,/g, ""), 10),
        tier_min: parseInt(form.tier_min, 10) || 0,
      }),
    onSuccess: () => { invalidate(); setAdding(false); setForm({ kind: "fixed", value: "", tier_min: "0" }); toast("success", "قاعده ایجاد شد."); },
    onError: (e) => toast("error", e instanceof Error ? e.message : "خطا"),
  });
  const toggleRule = useMutation({
    mutationFn: (id: string) => api.post(`/admin/commissions/rules/${id}/toggle`),
    onSuccess: invalidate,
    onError: (e) => toast("error", e instanceof Error ? e.message : "خطا"),
  });
  const approveComm = useMutation({
    mutationFn: (id: string) => api.post(`/admin/commissions/${id}/approve`),
    onSuccess: () => { invalidate(); toast("success", "کمیسیون تأیید و به کیف پول واریز شد."); },
    onError: (e) => toast("error", e instanceof Error ? e.message : "خطا"),
  });
  const cancelComm = useMutation({
    mutationFn: (id: string) => api.post(`/admin/commissions/${id}/cancel`, { reason: "" }),
    onSuccess: () => { invalidate(); toast("success", "لغو شد."); },
    onError: (e) => toast("error", e instanceof Error ? e.message : "خطا"),
  });

  if (rules.isLoading || comms.isLoading) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">کمیسیون‌ها</h1>
          <p className="mt-0.5 text-[13px] text-ink-1/60">
            قواعد محاسبه و وضعیت کمیسیون‌های بازاریابان
          </p>
        </div>
        <button className="btn-gold" onClick={() => setAdding((v) => !v)}>
          <Plus size={16} /> قاعده جدید
        </button>
      </div>

      {adding && (
        <div className="card space-y-4 p-5">
          <p className="text-[13px] text-ink-1/70">
            مبنای محاسبه: مبلغ ثابت به‌ازای هر پروندهٔ پذیرفته‌شده، یا درصدی از حق‌الوکالهٔ ثبت‌شده توسط شما — نه درصدی از نتیجهٔ دعوا.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="نوع">
              <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                <option value="fixed">مبلغ ثابت (ریال)</option>
                <option value="percent">درصد از حق‌الوکاله</option>
              </select>
            </Field>
            <Field label={form.kind === "fixed" ? "مبلغ (ریال)" : "درصد"}>
              <input dir="ltr" inputMode="numeric" value={form.value}
                onChange={(e) => setForm({ ...form, value: e.target.value })} />
            </Field>
            <Field label="پله — حداقل پروندهٔ پذیرفته‌شده">
              <input dir="ltr" inputMode="numeric" value={form.tier_min}
                onChange={(e) => setForm({ ...form, tier_min: e.target.value })} />
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn-ghost btn-sm" onClick={() => setAdding(false)}>انصراف</button>
            <button
              className="btn-primary btn-sm"
              disabled={!form.value || createRule.isPending}
              onClick={() => createRule.mutate()}
            >
              ایجاد قاعده
            </button>
          </div>
        </div>
      )}

      <section className="card p-5">
        <h2 className="mb-4 text-[14px] font-semibold">قواعد</h2>
        {(rules.data ?? []).length === 0 ? (
          <p className="py-4 text-center text-[13px] text-ink-3">قاعده‌ای تعریف نشده — بدون قاعده کمیسیونی ثبت نمی‌شود</p>
        ) : (
          <Table head={["نوع", "مقدار", "پله", "اختصاص", "وضعیت", "عملیات"]}>
            {(rules.data ?? []).map((r) => (
              <tr key={r.id} className="hover:bg-sand-2">
                <td className="px-4 py-3 text-[13px]">{r.kind === "fixed" ? "مبلغ ثابت" : "درصدی"}</td>
                <td className="px-4 py-3 text-[13px]">
                  {r.kind === "fixed" ? rial(r.value) : `${r.value.toLocaleString("fa-IR")}٪`}
                </td>
                <td className="px-4 py-3 text-[13px]">{r.tier_min.toLocaleString("fa-IR")}+</td>
                <td className="px-4 py-3 text-[12px] text-ink-2">
                  {r.marketer_id ? "بازاریاب خاص" : "سراسری"}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-[12px] ${r.is_active ? "text-emerald-400" : "text-ink-3"}`}>
                    {r.is_active ? "فعال" : "خاموش"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button className="btn-ghost btn-sm" onClick={() => toggleRule.mutate(r.id)}>
                    <Power size={13} /> {r.is_active ? "خاموش" : "روشن"}
                  </button>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </section>

      <section className="card p-5">
        <h2 className="mb-4 text-[14px] font-semibold">کمیسیون‌های ثبت‌شده</h2>
        <Table head={["بازاریاب", "پرونده", "مبلغ", "مبنا", "نگهداری تا", "وضعیت", "عملیات"]}>
          {(comms.data ?? []).map((c) => (
            <tr key={c.id} className="hover:bg-sand-2">
              <td className="px-4 py-3">
                <p className="font-medium">{c.full_name}</p>
                <code className="text-[11px] text-ink-3" dir="ltr">{c.ref_code}</code>
              </td>
              <td className="px-4 py-3 text-[12px] text-ink-2" dir="ltr">{c.request_id.slice(0, 8)}…</td>
              <td className="px-4 py-3 text-[13px] font-medium">{rial(c.amount)}</td>
              <td className="px-4 py-3 text-[12px] text-ink-2">
                {c.basis_kind === "percent" ? `${rial(c.basis_amount)} (٪)` : "ثابت"}
              </td>
              <td className="px-4 py-3 text-[12px] text-ink-2">
                {c.hold_until ? fmtDate(c.hold_until) : "—"}
              </td>
              <td className="px-4 py-3">
                <span className={`text-[12px] font-medium ${STATUS_FA[c.status]?.cls ?? ""}`}>
                  {STATUS_FA[c.status]?.label ?? c.status}
                </span>
              </td>
              <td className="px-4 py-3">
                {c.status === "pending" && (
                  <div className="flex gap-1.5">
                    <button className="btn-ghost btn-sm" onClick={() => approveComm.mutate(c.id)}>
                      <CheckCircle2 size={13} /> تأیید
                    </button>
                    <button className="btn-ghost btn-sm !text-red-400" onClick={() => cancelComm.mutate(c.id)}>
                      <XCircle size={13} /> لغو
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </Table>
        {(comms.data ?? []).length === 0 && (
          <p className="py-6 text-center text-[13px] text-ink-3">کمیسیونی ثبت نشده است</p>
        )}
      </section>
    </div>
  );
}
