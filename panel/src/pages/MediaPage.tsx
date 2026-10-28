/** Media library — upload, preview, alt edit, delete. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { api } from "../services/api";
import type { MediaOut, Page } from "../types/api";
import { ConfirmDialog, EmptyState, PageSkeleton, Pagination, useToast } from "../components/ui";

function fmtSize(b: number) {
  if (b > 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} مگابایت`;
  return `${Math.round(b / 1024)} کیلوبایت`;
}

export default function MediaPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [page, setPage] = useState(1);
  const [deleting, setDeleting] = useState<MediaOut | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-media", page],
    queryFn: () => api.get<Page<MediaOut>>(`/admin/media?page=${page}&page_size=24`),
  });

  const upload = useMutation({
    mutationFn: async (files: FileList) => {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("file", file);
        await api.upload("/admin/media", form);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-media"] });
      toast("success", "بارگذاری انجام شد.");
    },
    onError: (e) => toast("error", e instanceof Error ? e.message : "خطا در بارگذاری"),
  });

  const del = useMutation({
    mutationFn: (id: string) => api.del(`/admin/media/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-media"] });
      setDeleting(null);
      toast("success", "فایل حذف شد.");
    },
    onError: (e) => toast("error", e instanceof Error ? e.message : "خطا در حذف"),
  });

  const patchAlt = useMutation({
    mutationFn: ({ id, alt }: { id: string; alt: string }) =>
      api.patch(`/admin/media/${id}`, { alt }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-media"] }),
  });

  const pick = (files: FileList | null) => {
    if (files?.length) upload.mutate(files);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">تصاویر و رسانه‌ها</h1>
          <p className="mt-0.5 text-[13px] text-ink-1/60">
            JPG / PNG / WebP — حداکثر ۶ مگابایت
          </p>
        </div>
        <button className="btn-gold" onClick={() => fileRef.current?.click()} disabled={upload.isPending}>
          <Upload size={16} /> {upload.isPending ? "در حال بارگذاری…" : "بارگذاری تصویر"}
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => { pick(e.target.files); e.target.value = ""; }}
        />
      </div>

      <div
        className={`rounded-xl border-2 border-dashed p-3 text-center text-[12px] transition ${
          dragOver ? "border-gold-1 bg-gold-1/15 text-ink-1" : "border-sand-2 text-ink-1/40"
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); pick(e.dataTransfer.files); }}
      >
        یا فایل‌ها را اینجا رها کنید
      </div>

      {isLoading || !data ? (
        <PageSkeleton />
      ) : data.items.length === 0 ? (
        <EmptyState text="رسانه‌ای بارگذاری نشده است" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {data.items.map((m) => (
              <div key={m.id} className="card group overflow-hidden">
                <div className="relative aspect-square bg-sand-1">
                  <img src={m.url} alt={m.alt || m.original_name} className="h-full w-full object-cover" loading="lazy" />
                  <button
                    className="absolute left-1.5 top-1.5 rounded-lg bg-black/70 p-1.5 text-white opacity-0 transition group-hover:opacity-100"
                    onClick={() => setDeleting(m)}
                    aria-label="حذف"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="p-2.5">
                  <p className="truncate text-[12px] font-medium" title={m.original_name}>
                    {m.original_name || m.stored_name}
                  </p>
                  <p className="text-[11px] text-ink-1/50">
                    {m.width.toLocaleString("fa-IR")}×{m.height.toLocaleString("fa-IR")} — {fmtSize(m.size_bytes)}
                  </p>
                  <input
                    placeholder="متن جایگزین (alt)…"
                    defaultValue={m.alt}
                    className="mt-1.5 !border-sand-1 !px-2 !py-1 !text-[11px]"
                    onBlur={(e) => {
                      if (e.target.value !== m.alt)
                        patchAlt.mutate({ id: m.id, alt: e.target.value });
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          <Pagination page={page} total={data.total} pageSize={data.page_size} onPage={setPage} />
        </>
      )}

      <ConfirmDialog
        open={!!deleting}
        title="حذف فایل؟"
        body={`«${deleting?.original_name || deleting?.stored_name}» برای همیشه حذف می‌شود.`}
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && del.mutate(deleting.id)}
      />
    </div>
  );
}
