/** Labels management — create, rename, delete request labels. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { api, ApiError } from "../services/api";
import {
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  PageHeader,
  Skeleton,
  useToast,
} from "../components/ui";
import type { LabelOut } from "../types/api";

const COLORS = ["#2563eb", "#16a34a", "#d97706", "#dc2626", "#7c3aed", "#0891b2", "#b98e46"];

export default function LabelsPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [deleting, setDeleting] = useState<LabelOut | null>(null);

  const list = useQuery({
    queryKey: ["labels"],
    queryFn: () => api.get<LabelOut[]>("/admin/labels"),
  });

  const create = useMutation({
    mutationFn: () => api.post("/admin/labels", { name, color }),
    onSuccess: () => {
      toast("success", "برچسب ساخته شد.");
      setName("");
      qc.invalidateQueries({ queryKey: ["labels"] });
    },
    onError: (e) => toast("error", e instanceof ApiError ? e.message : "خطا"),
  });

  const del = useMutation({
    mutationFn: (id: string) => api.del(`/admin/labels/${id}`),
    onSuccess: () => {
      toast("success", "برچسب حذف شد.");
      setDeleting(null);
      qc.invalidateQueries({ queryKey: ["labels"] });
    },
    onError: (e) => toast("error", e instanceof ApiError ? e.message : "خطا"),
  });

  return (
    <div className="max-w-2xl">
      <PageHeader title="برچسب‌ها" subtitle="برچسب‌های قابل‌استفاده روی همهٔ درخواست‌ها" />

      <div className="card mb-4 p-4">
        <Field label="برچسب جدید">
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثلاً «فوری» یا «املاک»"
              onKeyDown={(e) => e.key === "Enter" && name.trim() && create.mutate()}
            />
            <div className="flex items-center gap-1">
              {COLORS.map((c) => (
                <button
                  key={c}
                  className={`h-6 w-6 rounded-full border-2 ${color === c ? "border-ink-0" : "border-transparent"}`}
                  style={{ backgroundColor: c }}
                  onClick={() => setColor(c)}
                  aria-label={c}
                />
              ))}
            </div>
            <button className="btn-gold btn-sm shrink-0" disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>
              <Plus size={14} /> افزودن
            </button>
          </div>
        </Field>
      </div>

      {list.isLoading && <div className="space-y-2">{[0, 1].map((i) => <Skeleton key={i} className="h-12" />)}</div>}
      {list.isError && <ErrorState text="بارگذاری ناموفق بود." onRetry={() => list.refetch()} />}
      {list.data && list.data.length === 0 && <EmptyState text="برچسبی تعریف نشده است" />}
      {list.data && list.data.length > 0 && (
        <div className="card divide-y divide-sand-2">
          {list.data.map((l) => (
            <div key={l.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: l.color }} />
              <span className="flex-1 text-[14px]">{l.name}</span>
              <button className="rounded-lg p-1.5 text-ink-3 hover:text-red-400" onClick={() => setDeleting(l)} aria-label="حذف">
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deleting}
        title="حذف برچسب"
        body={`برچسب «${deleting?.name}» از همهٔ درخواست‌ها برداشته می‌شود.`}
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && del.mutate(deleting.id)}
      />
    </div>
  );
}
