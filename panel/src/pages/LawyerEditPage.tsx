/** Lawyer create/edit — fields, specialties, structured résumé editor, photo upload. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Save, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../services/api";
import type { LawyerOut, MediaOut } from "../types/api";
import { Field, PageSkeleton, useToast } from "../components/ui";

const EMPTY = {
  slug: "",
  name: "",
  title: "",
  bio: "",
  specialties: "",
  phone: "",
  email: "",
  is_visible: true,
  sort_order: 0,
};

/** Résumé shape consumed by the public ResumeCard component. */
interface ResumeDraft {
  role: string;
  nameEn: string;
  degree: string;
  motto: string;
  highlights: { icon: string; title: string; text: string }[];
  expertiseTitle: string;
  expertise: string[];
  educationTitle: string;
  education: string[];
  /** anything the site template may carry that this editor doesn't know */
  extra: Record<string, unknown>;
}

const KNOWN_KEYS = new Set([
  "role", "nameEn", "degree", "motto", "highlights",
  "expertiseTitle", "expertise", "educationTitle", "education",
]);

const EMPTY_RESUME: ResumeDraft = {
  role: "", nameEn: "", degree: "", motto: "",
  highlights: [],
  expertiseTitle: "سوابق و تخصص‌ها", expertise: [],
  educationTitle: "تحصیلات", education: [],
  extra: {},
};

const ICONS = [
  { value: "scale", label: "ترازو" },
  { value: "landmark", label: "ساختمان/دادگستری" },
  { value: "shield-check", label: "سپر تأیید" },
  { value: "file-text", label: "سند" },
];

function resumeFromApi(raw: unknown): ResumeDraft {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const arr = (v: unknown) => (Array.isArray(v) ? v.map((x) => str(x)).filter(Boolean) : []);
  const hl = Array.isArray(r.highlights)
    ? r.highlights.map((h) => ({
        icon: str((h as Record<string, unknown>).icon) || "scale",
        title: str((h as Record<string, unknown>).title),
        text: str((h as Record<string, unknown>).text),
      }))
    : [];
  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) if (!KNOWN_KEYS.has(k)) extra[k] = v;
  return {
    role: str(r.role), nameEn: str(r.nameEn), degree: str(r.degree), motto: str(r.motto),
    highlights: hl,
    expertiseTitle: str(r.expertiseTitle) || "سوابق و تخصص‌ها",
    expertise: arr(r.expertise),
    educationTitle: str(r.educationTitle) || "تحصیلات",
    education: arr(r.education),
    extra,
  };
}

export default function LawyerEditPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === "new";
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: lawyer, isLoading } = useQuery({
    queryKey: ["admin-lawyer", id],
    queryFn: () => api.get<LawyerOut>(`/admin/lawyers/${id}`),
    enabled: !isNew,
  });

  const [f, setF] = useState(EMPTY);
  const [resume, setResume] = useState<ResumeDraft>(EMPTY_RESUME);
  const [portraitPreview, setPortraitPreview] = useState<string>("");

  useEffect(() => {
    if (lawyer) {
      setF({
        slug: lawyer.slug,
        name: lawyer.name,
        title: lawyer.title,
        bio: lawyer.bio,
        specialties: (lawyer.specialties ?? []).join("، "),
        phone: lawyer.phone,
        email: lawyer.email,
        is_visible: lawyer.is_visible,
        sort_order: lawyer.sort_order,
      });
      setResume(resumeFromApi(lawyer.resume));
      if (lawyer.portrait) setPortraitPreview(`/api/v1/media/file/${lawyer.portrait.stored_name}`);
      else if (lawyer.portrait_path) setPortraitPreview(lawyer.portrait_path);
    }
  }, [lawyer]);

  const save = useMutation({
    mutationFn: async () => {
      const { extra, ...core } = resume;
      const body = {
        slug: f.slug.trim(),
        name: f.name.trim(),
        title: f.title.trim(),
        bio: f.bio,
        specialties: f.specialties.split(/[،,]/).map((s) => s.trim()).filter(Boolean),
        resume: {
          ...extra,
          ...core,
          highlights: core.highlights.filter((h) => h.title || h.text),
          expertise: core.expertise.filter(Boolean),
          education: core.education.filter(Boolean),
        },
        phone: f.phone.trim(),
        email: f.email.trim(),
        is_visible: f.is_visible,
        sort_order: Number(f.sort_order) || 0,
      };
      if (isNew) return api.post<LawyerOut>("/admin/lawyers", body);
      return api.patch<LawyerOut>(`/admin/lawyers/${id}`, body);
    },
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ["admin-lawyers"] });
      toast("success", "ذخیره شد.");
      if (isNew) navigate(`/content/lawyers/${saved.id}`, { replace: true });
      else qc.invalidateQueries({ queryKey: ["admin-lawyer", id] });
    },
    onError: (e) => toast("error", e instanceof Error ? e.message : "خطا در ذخیره"),
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      form.append("alt", f.name);
      const media = await api.upload<MediaOut>("/admin/media", form);
      await api.patch(`/admin/lawyers/${id}`, { portrait_media_id: media.id });
      return media;
    },
    onSuccess: (media) => {
      setPortraitPreview(`/api/v1/media/file/${media.stored_name}`);
      qc.invalidateQueries({ queryKey: ["admin-lawyer", id] });
      toast("success", "تصویر بارگذاری و اتصال شد.");
    },
    onError: (e) => toast("error", e instanceof Error ? e.message : "خطا در بارگذاری"),
  });

  if (!isNew && (isLoading || !lawyer)) return <PageSkeleton />;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="text-lg font-semibold">{isNew ? "وکیل جدید" : `ویرایش «${lawyer?.name}»`}</h1>

      <div className="card space-y-4 p-5">
        <div className="flex items-start gap-4">
          <div className="shrink-0">
            {portraitPreview ? (
              <img src={portraitPreview} alt="" className="h-24 w-24 rounded-xl object-cover" />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded-xl bg-sand-1 text-2xl text-ink-1/40">
                {(f.name || "؟").slice(0, 1)}
              </div>
            )}
          </div>
          <div className="flex-1">
            <p className="mb-2 text-[13px] font-medium text-ink-1">عکس پرتره</p>
            {isNew ? (
              <p className="text-[12px] text-ink-1/60">ابتدا وکیل را ذخیره کنید، سپس عکس بارگذاری کنید.</p>
            ) : (
              <button className="btn-ghost btn-sm" onClick={() => fileRef.current?.click()} disabled={upload.isPending}>
                <Upload size={14} /> {upload.isPending ? "در حال بارگذاری…" : "بارگذاری/جایگزینی عکس"}
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) upload.mutate(file);
                e.target.value = "";
              }}
            />
            <p className="mt-1.5 text-[11px] text-ink-1/50">JPG / PNG / WebP — حداکثر ۶ مگابایت</p>
          </div>
        </div>
      </div>

      <div className="card space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="نام کامل"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="نامک (انگلیسی، یکتا)"><input dir="ltr" value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value.toLowerCase() })} placeholder="vaziri" /></Field>
          <Field label="عنوان شغلی"><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="وکیل پایه یک دادگستری" /></Field>
          <Field label="ترتیب نمایش"><input type="number" dir="ltr" value={f.sort_order} onChange={(e) => setF({ ...f, sort_order: Number(e.target.value) })} /></Field>
          <Field label="تلفن"><input dir="ltr" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
          <Field label="ایمیل"><input dir="ltr" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        </div>
        <Field label="تخصص‌ها (با «،» جدا کنید)">
          <input value={f.specialties} onChange={(e) => setF({ ...f, specialties: e.target.value })} placeholder="امور کیفری، دعاوی ملکی" />
        </Field>
        <Field label="بیوگرافی کوتاه"><textarea rows={3} value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} /></Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="!w-4" checked={f.is_visible} onChange={(e) => setF({ ...f, is_visible: e.target.checked })} />
          نمایش در سایت
        </label>
      </div>

      {/* ——— structured résumé (same shape the public ResumeCard renders) ——— */}
      <div className="card space-y-4 p-5">
        <h2 className="text-[15px] font-semibold">کارت رزومهٔ صفحهٔ «دربارهٔ ما»</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="سمت (kicker)"><input value={resume.role} onChange={(e) => setResume({ ...resume, role: e.target.value })} placeholder="وکیل پایه یک دادگستری" /></Field>
          <Field label="نام لاتین"><input dir="ltr" value={resume.nameEn} onChange={(e) => setResume({ ...resume, nameEn: e.target.value })} placeholder="Mohammad Vaziri" /></Field>
          <Field label="مدرک تحصیلی"><input value={resume.degree} onChange={(e) => setResume({ ...resume, degree: e.target.value })} /></Field>
          <Field label="شعار/جمله"><input value={resume.motto} onChange={(e) => setResume({ ...resume, motto: e.target.value })} /></Field>
        </div>

        {/* highlights — the 3-cell stats strip */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[13px] font-medium text-ink-1">نوار شاخص‌ها (۳ سلول زیر نام)</p>
            <button
              className="btn-ghost btn-sm"
              onClick={() => setResume({ ...resume, highlights: [...resume.highlights, { icon: "scale", title: "", text: "" }] })}
              disabled={resume.highlights.length >= 3}
            >
              <Plus size={13} /> افزودن
            </button>
          </div>
          <div className="space-y-2">
            {resume.highlights.map((h, i) => (
              <div key={i} className="flex items-end gap-2 rounded-lg border border-sand-2 p-2.5">
                <div className="w-36">
                  <label className="!mb-1 text-[11px]">آیکن</label>
                  <select className="!py-1.5 text-[13px]" value={h.icon} onChange={(e) => setResume({ ...resume, highlights: resume.highlights.map((x, j) => j === i ? { ...x, icon: e.target.value } : x) })}>
                    {ICONS.map((ic) => <option key={ic.value} value={ic.value}>{ic.label}</option>)}
                  </select>
                </div>
                <div className="w-36">
                  <label className="!mb-1 text-[11px]">تیتر</label>
                  <input className="!py-1.5 text-[13px]" value={h.title} onChange={(e) => setResume({ ...resume, highlights: resume.highlights.map((x, j) => j === i ? { ...x, title: e.target.value } : x) })} />
                </div>
                <div className="flex-1">
                  <label className="!mb-1 text-[11px]">متن</label>
                  <input className="!py-1.5 text-[13px]" value={h.text} onChange={(e) => setResume({ ...resume, highlights: resume.highlights.map((x, j) => j === i ? { ...x, text: e.target.value } : x) })} />
                </div>
                <button className="rounded-lg p-1.5 text-ink-3 hover:text-red-600" onClick={() => setResume({ ...resume, highlights: resume.highlights.filter((_, j) => j !== i) })} aria-label="حذف">
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
            {resume.highlights.length === 0 && <p className="text-[12px] text-ink-3">موردی نیست — حداکثر ۳ مورد اضافه کنید.</p>}
          </div>
        </div>

        <ListEditor
          title={resume.expertiseTitle}
          onTitle={(v) => setResume({ ...resume, expertiseTitle: v })}
          items={resume.expertise}
          onItems={(v) => setResume({ ...resume, expertise: v })}
          addLabel="افزودن تخصص/سابقه"
        />
        <ListEditor
          title={resume.educationTitle}
          onTitle={(v) => setResume({ ...resume, educationTitle: v })}
          items={resume.education}
          onItems={(v) => setResume({ ...resume, education: v })}
          addLabel="افزودن مدرک"
        />
      </div>

      <div className="flex justify-end gap-2">
        <button className="btn-ghost" onClick={() => navigate("/content/lawyers")}>بازگشت</button>
        <button className="btn-primary" onClick={() => save.mutate()} disabled={save.isPending || !f.name || !f.slug}>
          <Save size={15} /> {save.isPending ? "در حال ذخیره…" : "ذخیره"}
        </button>
      </div>
    </div>
  );
}

/** Repeatable list of single-line entries with an editable section title. */
function ListEditor({
  title,
  onTitle,
  items,
  onItems,
  addLabel,
}: {
  title: string;
  onTitle: (v: string) => void;
  items: string[];
  onItems: (v: string[]) => void;
  addLabel: string;
}) {
  return (
    <div>
      <div className="mb-2 grid gap-2 sm:grid-cols-[1fr_auto]">
        <Field label="تیتر بخش"><input value={title} onChange={(e) => onTitle(e.target.value)} /></Field>
        <button className="btn-ghost btn-sm self-end" onClick={() => onItems([...items, ""])}>
          <Plus size={13} /> {addLabel}
        </button>
      </div>
      <div className="space-y-1.5">
        {items.map((it, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              className="!py-1.5 text-[13px]"
              value={it}
              onChange={(e) => onItems(items.map((x, j) => (j === i ? e.target.value : x)))}
            />
            <button
              className="shrink-0 rounded-lg p-1.5 text-ink-3 hover:text-red-600"
              onClick={() => onItems(items.filter((_, j) => j !== i))}
              aria-label="حذف"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
