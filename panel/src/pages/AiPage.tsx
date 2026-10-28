/** AI assistant admin — status, knowledge CRUD, sync. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { api } from "../services/api";
import type { AiStatusOut, KnowledgeOut, Page } from "../types/api";
import { ConfirmDialog, EmptyState, Field, PageSkeleton, Pagination, fmtDate, useToast } from "../components/ui";

export default function AiPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<KnowledgeOut | null>(null);
  const [form, setForm] = useState({ title: "", body: "" });

  const { data: status } = useQuery({
    queryKey: ["ai-status"],
    queryFn: () => api.get<AiStatusOut>("/admin/ai/status"),
  });
  const { data, isLoading } = useQuery({
    queryKey: ["ai-knowledge", page],
    queryFn: () => api.get<Page<KnowledgeOut>>(`/admin/ai/knowledge?page=${page}&page_size=20`),
  });

  const sync = useMutation({
    mutationFn: () => api.post<{ changed: number; message: string }>("/admin/ai/sync"),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["ai-knowledge"] });
      qc.invalidateQueries({ queryKey: ["ai-status"] });
      toast("success", r.message);
    },
    onError: (e) => toast("error", e instanceof Error ? e.message : "خطا"),
  });

  const create = useMutation({
    mutationFn: () => api.post("/admin/ai/knowledge", { title: form.title, body: form.body, source_type: "manual" }),
    onSuccess: () => {
      setAdding(false);
      setForm({ title: "", body: "" });
      qc.invalidateQueries({ queryKey: ["ai-knowledge"] });
      toast("success", "دانش جدید اضافه شد.");
    },
    onError: (e) => toast("error", e instanceof Error ? e.message : "خطا"),
  });

  const toggle = useMutation({
    mutationFn: (k: KnowledgeOut) => api.patch(`/admin/ai/knowledge/${k.id}`, { is_active: !k.is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-knowledge"] }),
  });

  const del = useMutation({
    mutationFn: (id: string) => api.del(`/admin/ai/knowledge/${id}`),
    onSuccess: () => {
      setDeleting(null);
      qc.invalidateQueries({ queryKey: ["ai-knowledge"] });
      toast("success", "رکورد حذف شد.");
    },
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">مشاور هوشمند</h1>
        <button className="btn-primary btn-sm" onClick={() => sync.mutate()} disabled={sync.isPending}>
          <RefreshCw size={14} className={sync.isPending ? "animate-spin" : ""} />
          {sync.isPending ? "در حال همگام‌سازی…" : "همگام‌سازی دانش با سایت"}
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-[12px] text-ink-1/60">وضعیت ارائه‌دهنده</p>
          <p className="mt-1 flex items-center gap-2 text-sm font-semibold">
            <span className={`h-2 w-2 rounded-full ${status?.configured ? "bg-emerald-500" : "bg-amber-500"}`} />
            {status?.configured ? "متصل" : "بدون کلید — حالت بازیابی"}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-[12px] text-ink-1/60">فعال در سایت</p>
          <p className="mt-1 text-sm font-semibold">{status?.enabled ? "فعال" : "غیرفعال"}</p>
        </div>
        <div className="card p-4">
          <p className="text-[12px] text-ink-1/60">منابع دانش</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{(status?.knowledge_sources ?? 0).toLocaleString("fa-IR")}</p>
        </div>
      </div>

      {!status?.configured && (
        <div className="card border-amber-500/30 bg-amber-500/10 p-4 text-[13px] text-amber-300">
          کلید API ارائه‌دهنده تنظیم نشده است (AI_API_KEY). دستیار در این حالت با
          پاسخ‌های مبتنی بر دانش سایت کار می‌کند، اما پاسخ‌های مولد تولید نمی‌شود.
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">منابع دانش تأییدشده</h2>
        <button className="btn-ghost btn-sm" onClick={() => setAdding((v) => !v)}>
          <Plus size={14} /> دانش جدید
        </button>
      </div>

      {adding && (
        <div className="card space-y-3 p-5">
          <Field label="عنوان"><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <Field label="متن دانش"><textarea rows={4} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></Field>
          <div className="flex justify-end gap-2">
            <button className="btn-ghost btn-sm" onClick={() => setAdding(false)}>انصراف</button>
            <button className="btn-gold btn-sm" disabled={!form.title || !form.body || create.isPending} onClick={() => create.mutate()}>افزودن</button>
          </div>
        </div>
      )}

      {isLoading || !data ? (
        <PageSkeleton />
      ) : data.items.length === 0 ? (
        <EmptyState text="دانشی ثبت نشده" hint="«همگام‌سازی» را بزنید تا محتوای سایت وارد شود." />
      ) : (
        <>
          <div className="space-y-2">
            {data.items.map((k) => (
              <div key={k.id} className="card flex items-start gap-3 p-4">
                <Bot size={16} className="mt-0.5 shrink-0 text-gold-1" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{k.title}</p>
                    <span className="rounded bg-sand-1 px-1.5 py-0.5 text-[10px] text-ink-1/60" dir="ltr">{k.source_type}</span>
                    {!k.is_active && <span className="rounded bg-sand-1 px-1.5 py-0.5 text-[10px] text-red-400">غیرفعال</span>}
                  </div>
                  <p className="mt-1 line-clamp-2 text-[12px] text-ink-1/60">{k.body}</p>
                  <p className="mt-1 text-[11px] text-ink-1/40">{fmtDate(k.updated_at)}</p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button className="btn-ghost btn-sm" onClick={() => toggle.mutate(k)}>
                    {k.is_active ? "غیرفعال" : "فعال"}
                  </button>
                  <button className="btn-ghost btn-sm !text-red-400" onClick={() => setDeleting(k)}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <Pagination page={page} total={data.total} pageSize={data.page_size} onPage={setPage} />
        </>
      )}

      <ConfirmDialog
        open={!!deleting}
        title="حذف دانش؟"
        body={`«${deleting?.title}» دیگر در پاسخ‌ها استفاده نمی‌شود.`}
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && del.mutate(deleting.id)}
      />
    </div>
  );
}
