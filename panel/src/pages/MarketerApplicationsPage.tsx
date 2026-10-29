/** Marketer applications — pending queue, approve / reject-with-reason. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { useState } from "react";
import { api, ApiError } from "../services/api";
import { EmptyState, ErrorState, PageHeader, Skeleton, useToast } from "../components/ui";

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

const STATUS_FA: Record<string, string> = {
  pending: "در انتظار",
  approved: "تأییدشده",
  rejected: "رد شده",
};

export default function MarketerApplicationsPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [showAll, setShowAll] = useState(false);

  const list = useQuery({
    queryKey: ["marketer-apps"],
    queryFn: () => api.get<ApplicationOut[]>("/admin/marketers/applications"),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["marketer-apps"] });

  const approve = useMutation({
    mutationFn: (id: string) => api.post(`/admin/marketers/applications/${id}/approve`, {}),
    onSuccess: () => {
      toast("success", "درخواست تأیید شد و کد ارجاع فعال شد.");
      invalidate();
    },
    onError: (e) => toast("error", e instanceof ApiError ? e.message : "خطا"),
  });

  const reject = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post(`/admin/marketers/applications/${id}/reject`, { reason }),
    onSuccess: () => {
      toast("success", "درخواست رد شد.");
      setRejecting(null);
      setReason("");
      invalidate();
    },
    onError: (e) => toast("error", e instanceof ApiError ? e.message : "خطا"),
  });

  const rows = (list.data ?? []).filter((a) => showAll || a.status === "pending");

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="درخواست‌های بازاریابی"
        subtitle="با تأیید، کد ارجاع اختصاصی کاربر فعال می‌شود"
        actions={
          <button className="btn-ghost btn-sm" onClick={() => setShowAll((v) => !v)}>
            {showAll ? "فقط در انتظار" : "نمایش همه"}
          </button>
        }
      />

      {list.isLoading && (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div>
      )}
      {list.isError && <ErrorState text="بارگذاری ناموفق بود." onRetry={() => list.refetch()} />}
      {list.data && rows.length === 0 && (
        <EmptyState text={showAll ? "درخواستی ثبت نشده است" : "درخواست در انتظاری نیست"} />
      )}

      <div className="space-y-3">
        {rows.map((a) => (
          <div key={a.id} className="card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[14px] font-medium">{a.full_name}</span>
              <span dir="ltr" className="text-[12px] text-ink-2">{a.phone}</span>
              {a.channel && (
                <span className="rounded-full bg-sand-1 px-2 py-0.5 text-[11px] text-ink-1">{a.channel}</span>
              )}
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] ${
                  a.status === "pending"
                    ? "bg-amber-500/10 text-amber-400"
                    : a.status === "approved"
                      ? "bg-emerald-500/10 text-emerald-400"
                      : "bg-red-500/10 text-red-400"
                }`}
              >
                {STATUS_FA[a.status] ?? a.status}
              </span>
              <span className="mr-auto text-[12px] text-ink-2">
                {new Date(a.created_at).toLocaleDateString("fa-IR")}
              </span>
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
                      className="btn-ghost btn-sm text-red-400"
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
                    <button
                      className="btn-gold btn-sm"
                      disabled={approve.isPending}
                      onClick={() => approve.mutate(a.id)}
                    >
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
    </div>
  );
}
