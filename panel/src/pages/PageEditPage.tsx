/** Page editor — SEO meta + per-section JSON editing with history. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../services/api";
import type { PageOut, SectionOut } from "../types/api";
import { Field, PageSkeleton, fmtDate, useToast } from "../components/ui";

export default function PageEditPage() {
  const { slug } = useParams<{ slug: string }>();
  const qc = useQueryClient();
  const toast = useToast();
  const { data: page, isLoading } = useQuery({
    queryKey: ["admin-page", slug],
    queryFn: () => api.get<PageOut>(`/admin/pages/${slug}`),
  });

  const [meta, setMeta] = useState({ title: "", seo_title: "", seo_description: "", is_published: true });
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (page) {
      setMeta({
        title: page.title,
        seo_title: page.seo_title,
        seo_description: page.seo_description,
        is_published: page.is_published,
      });
      setDrafts(
        Object.fromEntries(page.sections.map((s) => [s.id, JSON.stringify(s.content, null, 2)])),
      );
      setErrors({});
    }
  }, [page]);

  const saveMeta = useMutation({
    mutationFn: () => api.patch(`/admin/pages/${slug}`, meta),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-page", slug] });
      toast("success", "اطلاعات صفحه ذخیره شد.");
    },
    onError: (e) => toast("error", e instanceof Error ? e.message : "خطا در ذخیره"),
  });

  const saveSection = useMutation({
    mutationFn: ({ id, content }: { id: string; content: unknown }) =>
      api.patch(`/admin/pages/sections/${id}`, { content }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-page", slug] });
      toast("success", "بخش ذخیره شد.");
    },
    onError: (e) => toast("error", e instanceof Error ? e.message : "خطا در ذخیره"),
  });

  const toggleSection = useMutation({
    mutationFn: ({ id, is_enabled }: { id: string; is_enabled: boolean }) =>
      api.patch(`/admin/pages/sections/${id}`, { is_enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-page", slug] }),
  });

  if (isLoading || !page) return <PageSkeleton />;

  const submitSection = (s: SectionOut) => {
    try {
      const content = JSON.parse(drafts[s.id] ?? "{}");
      setErrors((p) => ({ ...p, [s.id]: "" }));
      saveSection.mutate({ id: s.id, content });
    } catch {
      setErrors((p) => ({ ...p, [s.id]: "JSON نامعتبر است — براکت‌ها و کوتیشن‌ها را بررسی کنید." }));
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">ویرایش «{page.title}»</h1>

      <div className="card space-y-4 p-5">
        <h2 className="text-sm font-semibold">اطلاعات صفحه و سئو</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="عنوان صفحه"><input value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} /></Field>
          <Field label="عنوان سئو"><input value={meta.seo_title} onChange={(e) => setMeta({ ...meta, seo_title: e.target.value })} /></Field>
        </div>
        <Field label="توضیحات سئو">
          <textarea rows={2} value={meta.seo_description} onChange={(e) => setMeta({ ...meta, seo_description: e.target.value })} />
        </Field>
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="!w-4" checked={meta.is_published} onChange={(e) => setMeta({ ...meta, is_published: e.target.checked })} />
            منتشرشده (قابل مشاهده در سایت)
          </label>
          <button className="btn-primary btn-sm" onClick={() => saveMeta.mutate()} disabled={saveMeta.isPending}>
            <Save size={14} /> ذخیره اطلاعات
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-sm font-semibold">بخش‌های صفحه</h2>
        {page.sections.map((s) => (
          <div key={s.id} className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <span className="text-sm font-semibold" dir="ltr">{s.key}</span>
                <span className="mr-2 rounded bg-sand-1 px-2 py-0.5 text-[11px] text-ink-1/60">{s.kind}</span>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-[12px] text-ink-1/70">
                  <input
                    type="checkbox"
                    className="!w-3.5"
                    checked={s.is_enabled}
                    onChange={(e) => toggleSection.mutate({ id: s.id, is_enabled: e.target.checked })}
                  />
                  فعال
                </label>
                <button className="btn-gold btn-sm" onClick={() => submitSection(s)} disabled={saveSection.isPending}>
                  <Save size={13} /> ذخیره
                </button>
              </div>
            </div>
            <textarea
              dir="ltr"
              rows={Math.min(18, (drafts[s.id]?.split("\n").length ?? 6) + 1)}
              className="font-mono text-[12.5px] leading-relaxed"
              value={drafts[s.id] ?? ""}
              onChange={(e) => setDrafts((p) => ({ ...p, [s.id]: e.target.value }))}
            />
            {errors[s.id] && <p className="field-error">{errors[s.id]}</p>}
            <SectionHistory sectionId={s.id} />
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionHistory({ sectionId }: { sectionId: string }) {
  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ["revisions", "section", sectionId],
    queryFn: () =>
      api.get<{ id: string; created_at: string; note: string }[]>(
        `/admin/pages/revisions/section/${sectionId}`,
      ),
    enabled: open,
  });
  return (
    <div className="mt-2">
      <button className="text-[12px] text-gold-1 hover:underline" onClick={() => setOpen((v) => !v)}>
        {open ? "بستن تاریخچه" : "تاریخچهٔ تغییرات"}
      </button>
      {open && data && (
        <ul className="mt-2 space-y-1 text-[12px] text-ink-1/60">
          {data.length === 0 && <li>تغییری ثبت نشده است.</li>}
          {data.map((r) => (
            <li key={r.id}>• {fmtDate(r.created_at)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
