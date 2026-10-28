/** Page editor — SEO meta + structured per-section editing with history. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../services/api";
import type { PageOut } from "../types/api";
import { Field, PageSkeleton, fmtDate, useToast } from "../components/ui";

type Json = Record<string, unknown>;

const SECTION_LABELS: Record<string, string> = {
  head: "سرصفحه", hero: "هیرو", stats: "آمار", about: "معرفی",
  services_head: "تیتر خدمات", services: "خدمات", items: "موارد",
  picture: "تصویر", lawyers_head: "تیتر وکلا", cta_band: "نوار دعوت",
  paragraphs: "پاراگراف‌ها", trust: "اعتماد", for_whom: "برای چه کسانی",
  receive: "چه دریافت می‌کنید", prepare: "آماده‌سازی", faqs: "پرسش‌های متداول",
  steps: "مراحل", note: "یادداشت",
};

export default function PageEditPage() {
  const { slug } = useParams<{ slug: string }>();
  const qc = useQueryClient();
  const toast = useToast();
  const { data: page, isLoading } = useQuery({
    queryKey: ["admin-page", slug],
    queryFn: () => api.get<PageOut>(`/admin/pages/${slug}`),
  });

  const [meta, setMeta] = useState({ title: "", seo_title: "", seo_description: "", is_published: true });
  const [drafts, setDrafts] = useState<Record<string, Json>>({});

  useEffect(() => {
    if (page) {
      setMeta({
        title: page.title,
        seo_title: page.seo_title,
        seo_description: page.seo_description,
        is_published: page.is_published,
      });
      setDrafts(
        Object.fromEntries(
          page.sections.map((s) => [s.id, structuredClone(s.content)]),
        ),
      );
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
                <span className="text-sm font-semibold">
                  {SECTION_LABELS[s.key] ?? s.key}
                </span>
                <span className="mr-2 rounded bg-sand-0 px-2 py-0.5 text-[11px] text-ink-2" dir="ltr">{s.key}</span>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-[12px] text-ink-2">
                  <input
                    type="checkbox"
                    className="!w-3.5"
                    checked={s.is_enabled}
                    onChange={(e) => toggleSection.mutate({ id: s.id, is_enabled: e.target.checked })}
                  />
                  فعال
                </label>
                <button
                  className="btn-gold btn-sm"
                  onClick={() => saveSection.mutate({ id: s.id, content: drafts[s.id] })}
                  disabled={saveSection.isPending}
                >
                  <Save size={13} /> ذخیره
                </button>
              </div>
            </div>
            {drafts[s.id] !== undefined && (
              <ContentEditor
                value={drafts[s.id]}
                onChange={(v) => setDrafts((p) => ({ ...p, [s.id]: v }))}
              />
            )}
            <SectionHistory sectionId={s.id} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- structured content editor ----------

const isScalarObj = (v: unknown): v is Json =>
  typeof v === "object" && v !== null && !Array.isArray(v) &&
  Object.values(v).every((x) => x === null || ["string", "number", "boolean"].includes(typeof x));

function ContentEditor({ value, onChange }: { value: Json; onChange: (v: Json) => void }) {
  const entries = Object.entries(value);
  return (
    <div className="space-y-3">
      {entries.map(([k, v]) => (
        <ValueEditor
          key={k}
          name={k}
          value={v}
          onChange={(nv) => onChange({ ...value, [k]: nv })}
        />
      ))}
      {entries.length === 0 && <p className="text-[12px] text-ink-3">این بخش محتوایی ندارد.</p>}
    </div>
  );
}

function ValueEditor({ name, value, onChange }: { name: string; value: unknown; onChange: (v: unknown) => void }) {
  // array of strings → per-row inputs
  if (Array.isArray(value) && value.every((x) => typeof x === "string")) {
    return (
      <div>
        <p className="mb-1.5 text-[12px] font-medium text-ink-2" dir="ltr">{name}</p>
        <div className="space-y-1.5">
          {value.map((it, i) => (
            <div key={i} className="flex gap-2">
              <input
                className="!py-1.5 text-[13px]"
                value={it}
                onChange={(e) => onChange(value.map((x, j) => (j === i ? e.target.value : x)))}
              />
              <button className="rounded-lg p-1.5 text-ink-3 hover:text-red-400" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label="حذف">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        <button className="btn-ghost btn-sm mt-2" onClick={() => onChange([...value, ""])}>
          <Plus size={13} /> افزودن
        </button>
      </div>
    );
  }

  // array of flat objects → per-item card
  if (Array.isArray(value) && value.every(isScalarObj)) {
    return (
      <div>
        <p className="mb-1.5 text-[12px] font-medium text-ink-2" dir="ltr">{name}</p>
        <div className="space-y-2">
          {value.map((it, i) => (
            <div key={i} className="rounded-lg border border-sand-2 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] text-ink-3">مورد {(i + 1).toLocaleString("fa-IR")}</span>
                <button className="rounded p-1 text-ink-3 hover:text-red-400" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label="حذف">
                  <Trash2 size={13} />
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {Object.entries(it).map(([k2, v2]) => (
                  <div key={k2} className={String(v2).length > 40 ? "sm:col-span-2" : ""}>
                    <label className="!mb-1 text-[11px]" dir="ltr">{k2}</label>
                    <input
                      className="!py-1.5 text-[13px]"
                      dir={typeof v2 === "string" && /[a-zA-Z]/.test(v2) ? "ltr" : "rtl"}
                      value={String(v2 ?? "")}
                      onChange={(e) =>
                        onChange(value.map((x, j) => (j === i ? { ...x, [k2]: e.target.value } : x)))
                      }
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <button
          className="btn-ghost btn-sm mt-2"
          onClick={() => {
            const proto = value[0] ?? {};
            onChange([...value, Object.fromEntries(Object.keys(proto).map((k) => [k, ""]))]);
          }}
        >
          <Plus size={13} /> افزودن
        </button>
      </div>
    );
  }

  // scalars
  if (typeof value === "string") {
    const long = value.length > 80;
    return (
      <Field label={name}>
        {long ? (
          <textarea rows={3} value={value} onChange={(e) => onChange(e.target.value)} />
        ) : (
          <input dir={/[a-zA-Z]{4}/.test(value) ? "ltr" : "rtl"} value={value} onChange={(e) => onChange(e.target.value)} />
        )}
      </Field>
    );
  }
  if (typeof value === "number") {
    return (
      <Field label={name}>
        <input type="number" dir="ltr" value={value} onChange={(e) => onChange(Number(e.target.value))} />
      </Field>
    );
  }
  if (typeof value === "boolean") {
    return (
      <label className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" className="!w-4" checked={value} onChange={(e) => onChange(e.target.checked)} />
        <span dir="ltr">{name}</span>
      </label>
    );
  }

  // nested object / unknown shape → raw JSON
  return <JsonField name={name} value={value} onChange={onChange} />;
}

function JsonField({ name, value, onChange }: { name: string; value: unknown; onChange: (v: unknown) => void }) {
  const [text, setText] = useState(() => JSON.stringify(value, null, 2));
  const [err, setErr] = useState("");
  return (
    <div>
      <p className="mb-1.5 text-[12px] font-medium text-ink-2" dir="ltr">{name} (JSON)</p>
      <textarea
        dir="ltr"
        rows={Math.min(12, text.split("\n").length + 1)}
        className="font-mono text-[12px] leading-relaxed"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          try {
            onChange(JSON.parse(e.target.value));
            setErr("");
          } catch {
            setErr("JSON نامعتبر");
          }
        }}
      />
      {err && <p className="field-error">{err}</p>}
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
    <div className="mt-2 border-t border-sand-2 pt-2">
      <button className="text-[12px] text-gold-1 hover:underline" onClick={() => setOpen((v) => !v)}>
        {open ? "بستن تاریخچه" : "تاریخچهٔ تغییرات"}
      </button>
      {open && data && (
        <ul className="mt-2 space-y-1 text-[12px] text-ink-2">
          {data.length === 0 && <li>تغییری ثبت نشده است.</li>}
          {data.map((r) => (
            <li key={r.id}>• {fmtDate(r.created_at)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
