import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../services/api";
import type { TicketOut } from "../types/api";
import { PageSkeleton, StatusBadge, fmtDate, useToast } from "../components/ui";

const STATUSES = ["open", "in_progress", "waiting_customer", "resolved", "closed"];
const PRIORITIES = ["low", "normal", "high", "urgent"];

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const toast = useToast();
  const [reply, setReply] = useState("");
  const [isNote, setIsNote] = useState(false);

  const { data: t, isLoading } = useQuery({
    queryKey: ["admin-ticket", id],
    queryFn: () => api.get<TicketOut>(`/admin/tickets/${id}`),
    refetchInterval: 30_000,
  });

  const patch = useMutation({
    mutationFn: (body: object) => api.patch(`/admin/tickets/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-ticket", id] });
      qc.invalidateQueries({ queryKey: ["admin-tickets"] });
    },
    onError: (e) => toast("error", e instanceof Error ? e.message : "خطا"),
  });

  const send = useMutation({
    mutationFn: () => api.post(`/admin/tickets/${id}/messages`, { body: reply, is_note: isNote }),
    onSuccess: () => {
      setReply("");
      qc.invalidateQueries({ queryKey: ["admin-ticket", id] });
      toast("success", isNote ? "یادداشت ثبت شد." : "پاسخ ارسال شد.");
    },
    onError: (e) => toast("error", e instanceof Error ? e.message : "خطا"),
  });

  if (isLoading || !t) return <PageSkeleton />;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/tickets" className="text-[13px] text-ink-1/60 hover:text-ink-0">← بازگشت</Link>
        <h1 className="text-lg font-semibold" dir="ltr">{t.ticket_number}</h1>
        <StatusBadge value={t.status} />
        <StatusBadge value={t.priority} />
      </div>

      <div className="card space-y-3 p-5">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          <div><dt className="text-[12px] text-ink-1/50">درخواست‌کننده</dt><dd className="mt-0.5 font-medium">{t.requester_name}</dd></div>
          <div><dt className="text-[12px] text-ink-1/50">تلفن</dt><dd className="mt-0.5 font-medium" dir="ltr">{t.requester_phone}</dd></div>
          <div><dt className="text-[12px] text-ink-1/50">ایمیل</dt><dd className="mt-0.5 font-medium" dir="ltr">{t.requester_email || "—"}</dd></div>
          <div><dt className="text-[12px] text-ink-1/50">موضوع</dt><dd className="mt-0.5 font-medium">{t.subject}</dd></div>
          <div><dt className="text-[12px] text-ink-1/50">دسته</dt><dd className="mt-0.5 font-medium">{t.category}</dd></div>
          <div><dt className="text-[12px] text-ink-1/50">ثبت</dt><dd className="mt-0.5 font-medium">{fmtDate(t.created_at)}</dd></div>
        </dl>
        <div className="flex flex-wrap items-center gap-3 border-t border-sand-1 pt-3">
          <label className="flex items-center gap-1.5 text-[12px] text-ink-1/70">
            وضعیت:
            <select className="!w-auto !px-2 !py-1" value={t.status} onChange={(e) => patch.mutate({ status: e.target.value })}>
              {STATUSES.map((s) => <option key={s} value={s}>{({ open: "باز", in_progress: "در حال رسیدگی", waiting_customer: "در انتظار مشتری", resolved: "حل‌شده", closed: "بسته" } as Record<string, string>)[s]}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-[12px] text-ink-1/70">
            اولویت:
            <select className="!w-auto !px-2 !py-1" value={t.priority} onChange={(e) => patch.mutate({ priority: e.target.value })}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{({ low: "کم", normal: "عادی", high: "زیاد", urgent: "فوری" } as Record<string, string>)[p]}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className="card space-y-3 p-5">
        <h2 className="text-sm font-semibold">گفتگو</h2>
        <div className="space-y-2.5">
          {t.messages.map((m) => (
            <div
              key={m.id}
              className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
                m.sender_type === "customer"
                  ? "bg-sand-1 text-ink-0"
                  : m.sender_type === "note"
                    ? "border border-dashed border-amber-500/40 bg-amber-500/10 text-amber-300"
                    : "mr-auto bg-gold-1/25"
              }`}
            >
              <p className="whitespace-pre-wrap">{m.body}</p>
              <p className={`mt-1 text-[10px] ${m.sender_type === "staff" ? "text-ink-1/50" : "text-ink-1/45"}`}>
                {m.sender_type === "customer" ? "مشتری" : m.sender_type === "note" ? "یادداشت داخلی" : "کارشناس"} — {fmtDate(m.created_at)}
              </p>
            </div>
          ))}
        </div>
        <div className="space-y-2 border-t border-sand-1 pt-3">
          <textarea rows={3} placeholder={isNote ? "یادداشت داخلی (مشتری نمی‌بیند)…" : "پاسخ به مشتری…"} value={reply} onChange={(e) => setReply(e.target.value)} />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-1.5 text-[12px] text-ink-1/70">
              <input type="checkbox" className="!w-3.5" checked={isNote} onChange={(e) => setIsNote(e.target.checked)} />
              یادداشت داخلی
            </label>
            <button className="btn-primary btn-sm" disabled={!reply.trim() || send.isPending} onClick={() => send.mutate()}>
              ارسال
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
