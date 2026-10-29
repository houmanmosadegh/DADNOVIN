/** Payout queue — approve (with manual bank tracking ref) / reject. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle } from "lucide-react";
import { useState } from "react";
import { api } from "../services/api";
import { PageSkeleton, Table, fmtDate, useToast } from "../components/ui";

interface PayoutRow {
  id: string;
  marketer_id: string;
  full_name: string;
  ref_code: string;
  amount: number;
  status: string;
  iban_masked: string;
  payment_ref: string;
  reject_reason: string;
  created_at: string;
}

const STATUS_FA: Record<string, { label: string; cls: string }> = {
  pending: { label: "در انتظار", cls: "text-amber-400" },
  paid: { label: "پرداخت‌شده", cls: "text-emerald-400" },
  approved: { label: "تأییدشده", cls: "text-emerald-400" },
  rejected: { label: "رد شده", cls: "text-red-400" },
};

const rial = (n: number) => `${n.toLocaleString("fa-IR")} ریال`;

export default function PayoutsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [payRef, setPayRef] = useState<Record<string, string>>({});
  const [reason, setReason] = useState<Record<string, string>>({});

  const payouts = useQuery({
    queryKey: ["payouts"],
    queryFn: () => api.get<PayoutRow[]>("/admin/payouts"),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["payouts"] });

  const approve = useMutation({
    mutationFn: ({ id, payment_ref }: { id: string; payment_ref: string }) =>
      api.post(`/admin/payouts/${id}/approve`, { payment_ref }),
    onSuccess: () => { invalidate(); toast("success", "برداشت تأیید و ثبت شد."); },
    onError: (e) => toast("error", e instanceof Error ? e.message : "خطا"),
  });
  const reject = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post(`/admin/payouts/${id}/reject`, { reason }),
    onSuccess: () => { invalidate(); toast("success", "رد شد."); },
    onError: (e) => toast("error", e instanceof Error ? e.message : "خطا"),
  });

  if (payouts.isLoading) return <PageSkeleton />;
  const rows = payouts.data ?? [];
  const pending = rows.filter((r) => r.status === "pending");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">درخواست‌های برداشت</h1>
        <p className="mt-0.5 text-[13px] text-ink-1/60">
          پرداخت دستی انجام می‌شود — پس از واریز، شماره پیگیری را ثبت کنید
        </p>
      </div>

      <section className="card p-5">
        <h2 className="mb-4 text-[14px] font-semibold">
          صف انتظار
          {pending.length > 0 && (
            <span className="mr-2 rounded-full bg-gold-2 px-2 py-0.5 text-[11px] text-ink-0">
              {pending.length.toLocaleString("fa-IR")}
            </span>
          )}
        </h2>
        {pending.length === 0 ? (
          <p className="py-4 text-center text-[13px] text-ink-3">درخواستی در صف نیست</p>
        ) : (
          <div className="space-y-3">
            {pending.map((p) => (
              <div key={p.id} className="rounded-xl border border-sand-2 p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-40 flex-1">
                    <p className="font-medium">{p.full_name}</p>
                    <p className="text-[12px] text-ink-2">
                      <code dir="ltr">{p.ref_code}</code> · {fmtDate(p.created_at)}
                    </p>
                  </div>
                  <div className="text-left">
                    <p className="text-[15px] font-semibold">{rial(p.amount)}</p>
                    <p className="text-[12px] text-ink-2" dir="ltr">{p.iban_masked || "شبا ثبت نشده"}</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input
                    className="w-56 text-[12px]"
                    dir="ltr"
                    placeholder="شماره پیگیری پرداخت (بانک)"
                    value={payRef[p.id] ?? ""}
                    onChange={(e) => setPayRef({ ...payRef, [p.id]: e.target.value })}
                  />
                  <button
                    className="btn-primary btn-sm"
                    disabled={approve.isPending || (payRef[p.id] ?? "").trim().length < 2}
                    onClick={() => approve.mutate({ id: p.id, payment_ref: payRef[p.id] ?? "" })}
                  >
                    <CheckCircle2 size={14} /> ثبت پرداخت
                  </button>
                  <input
                    className="w-44 text-[12px]"
                    placeholder="دلیل رد"
                    value={reason[p.id] ?? ""}
                    onChange={(e) => setReason({ ...reason, [p.id]: e.target.value })}
                  />
                  <button
                    className="btn-ghost btn-sm !text-red-400"
                    disabled={reject.isPending}
                    onClick={() => reject.mutate({ id: p.id, reason: reason[p.id] ?? "" })}
                  >
                    <XCircle size={14} /> رد
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card p-5">
        <h2 className="mb-4 text-[14px] font-semibold">تاریخچه</h2>
        <Table head={["بازاریاب", "مبلغ", "شبا", "وضعیت", "پیگیری", "تاریخ"]}>
          {rows.filter((r) => r.status !== "pending").map((p) => (
            <tr key={p.id} className="hover:bg-sand-2">
              <td className="px-4 py-3">
                <p className="font-medium">{p.full_name}</p>
                <code className="text-[11px] text-ink-3" dir="ltr">{p.ref_code}</code>
              </td>
              <td className="px-4 py-3 text-[13px]">{rial(p.amount)}</td>
              <td className="px-4 py-3 text-[12px]" dir="ltr">{p.iban_masked || "—"}</td>
              <td className="px-4 py-3">
                <span className={`text-[12px] font-medium ${STATUS_FA[p.status]?.cls ?? ""}`}>
                  {STATUS_FA[p.status]?.label ?? p.status}
                </span>
                {p.reject_reason && <p className="text-[11px] text-ink-3">{p.reject_reason}</p>}
              </td>
              <td className="px-4 py-3 text-[12px]" dir="ltr">{p.payment_ref || "—"}</td>
              <td className="px-4 py-3 text-[12px] text-ink-2">{fmtDate(p.created_at)}</td>
            </tr>
          ))}
        </Table>
      </section>
    </div>
  );
}
