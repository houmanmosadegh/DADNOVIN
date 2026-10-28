import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../services/api";
import type { ConsultationOut } from "../types/api";
import { PageSkeleton, StatusBadge, fmtDate, useToast } from "../components/ui";

const NEXT_STATUS: Record<string, { value: string; label: string }[]> = {
  new: [
    { value: "reviewing", label: "شروع بررسی" },
    { value: "done", label: "تکمیل" },
    { value: "cancelled", label: "لغو" },
  ],
  reviewing: [
    { value: "awaiting_reply", label: "در انتظار پاسخ" },
    { value: "done", label: "تکمیل" },
    { value: "cancelled", label: "لغو" },
  ],
  awaiting_reply: [
    { value: "reviewing", label: "بازگشت به بررسی" },
    { value: "done", label: "تکمیل" },
    { value: "cancelled", label: "لغو" },
  ],
  done: [{ value: "reviewing", label: "بازگشایی" }],
  cancelled: [{ value: "new", label: "بازگشایی" }],
};

export default function ConsultationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const toast = useToast();
  const [note, setNote] = useState("");

  const { data: r, isLoading } = useQuery({
    queryKey: ["admin-consultation", id],
    queryFn: () => api.get<ConsultationOut>(`/admin/consultations/${id}`),
  });

  const patch = useMutation({
    mutationFn: (body: object) => api.patch(`/admin/consultations/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-consultation", id] });
      qc.invalidateQueries({ queryKey: ["admin-consultations"] });
      toast("success", "به‌روزرسانی شد.");
    },
    onError: (e) => toast("error", e instanceof Error ? e.message : "خطا"),
  });

  const addNote = useMutation({
    mutationFn: () => api.post(`/admin/consultations/${id}/notes`, { body: note }),
    onSuccess: () => {
      setNote("");
      qc.invalidateQueries({ queryKey: ["admin-consultation", id] });
      toast("success", "یادداشت ثبت شد.");
    },
    onError: (e) => toast("error", e instanceof Error ? e.message : "خطا"),
  });

  if (isLoading || !r) return <PageSkeleton />;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center gap-3">
        <Link to="/consultations" className="text-[13px] text-ink-1/60 hover:text-ink-0">← بازگشت</Link>
        <h1 className="text-lg font-semibold">درخواست «{r.full_name}»</h1>
        <StatusBadge value={r.status} />
      </div>

      <div className="card space-y-3 p-5">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          <div><dt className="text-[12px] text-ink-1/50">نام</dt><dd className="mt-0.5 font-medium">{r.full_name}</dd></div>
          <div><dt className="text-[12px] text-ink-1/50">تلفن</dt><dd className="mt-0.5 font-medium" dir="ltr">{r.phone}</dd></div>
          <div><dt className="text-[12px] text-ink-1/50">ایمیل</dt><dd className="mt-0.5 font-medium" dir="ltr">{r.email || "—"}</dd></div>
          <div><dt className="text-[12px] text-ink-1/50">حوزه</dt><dd className="mt-0.5 font-medium" dir="ltr">{r.service_slug || "—"}</dd></div>
          <div><dt className="text-[12px] text-ink-1/50">موضوع</dt><dd className="mt-0.5 font-medium">{r.topic || "—"}</dd></div>
          <div><dt className="text-[12px] text-ink-1/50">منبع</dt><dd className="mt-0.5 font-medium" dir="ltr">{r.source_page || "—"}</dd></div>
          <div><dt className="text-[12px] text-ink-1/50">ثبت</dt><dd className="mt-0.5 font-medium">{fmtDate(r.created_at)}</dd></div>
        </dl>
        {r.message && (
          <div className="rounded-lg bg-sand-0 p-3.5 text-sm leading-relaxed">{r.message}</div>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          {(NEXT_STATUS[r.status] ?? []).map((s) => (
            <button key={s.value} className="btn-ghost btn-sm" onClick={() => patch.mutate({ status: s.value })}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card space-y-3 p-5">
        <h2 className="text-sm font-semibold">یادداشت‌های داخلی</h2>
        {r.notes.length === 0 ? (
          <p className="text-[13px] text-ink-1/50">یادداشتی ثبت نشده است.</p>
        ) : (
          <ul className="space-y-2">
            {r.notes.map((n) => (
              <li key={n.id} className="rounded-lg border border-sand-1 bg-sand-0 px-3.5 py-2.5 text-sm">
                {n.body}
                <span className="mt-1 block text-[11px] text-ink-1/45">{fmtDate(n.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <input
            placeholder="یادداشت داخلی جدید…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <button className="btn-primary btn-sm shrink-0" disabled={!note.trim() || addNote.isPending} onClick={() => addNote.mutate()}>
            ثبت
          </button>
        </div>
      </div>
    </div>
  );
}
