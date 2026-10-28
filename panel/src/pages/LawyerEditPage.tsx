/** Lawyer create/edit — fields, specialties, resume JSON, photo upload. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save, Upload } from "lucide-react";
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
  resume: "{}",
  phone: "",
  email: "",
  is_visible: true,
  sort_order: 0,
};

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
  const [resumeErr, setResumeErr] = useState("");
  const [portraitPreview, setPortraitPreview] = useState<string>("");

  useEffect(() => {
    if (lawyer) {
      setF({
        slug: lawyer.slug,
        name: lawyer.name,
        title: lawyer.title,
        bio: lawyer.bio,
        specialties: (lawyer.specialties ?? []).join("، "),
        resume: JSON.stringify(lawyer.resume ?? {}, null, 2),
        phone: lawyer.phone,
        email: lawyer.email,
        is_visible: lawyer.is_visible,
        sort_order: lawyer.sort_order,
      });
      if (lawyer.portrait) setPortraitPreview(`/api/v1/media/file/${lawyer.portrait.stored_name}`);
      else if (lawyer.portrait_path) setPortraitPreview(lawyer.portrait_path);
    }
  }, [lawyer]);

  const save = useMutation({
    mutationFn: async () => {
      let resume: unknown = {};
      try {
        resume = JSON.parse(f.resume || "{}");
      } catch {
        setResumeErr("JSON رزومه نامعتبر است.");
        throw new Error("bad json");
      }
      setResumeErr("");
      const body = {
        slug: f.slug.trim(),
        name: f.name.trim(),
        title: f.title.trim(),
        bio: f.bio,
        specialties: f.specialties.split(/[،,]/).map((s) => s.trim()).filter(Boolean),
        resume,
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
      if (isNew) navigate(`/lawyers/${saved.id}`, { replace: true });
      else qc.invalidateQueries({ queryKey: ["admin-lawyer", id] });
    },
    onError: (e) => {
      if (e.message !== "bad json") toast("error", e instanceof Error ? e.message : "خطا در ذخیره");
    },
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
        <Field label="رزومه (JSON — ساختار کارت رزومهٔ سایت)">
          <textarea dir="ltr" rows={10} className="font-mono text-[12.5px]" value={f.resume} onChange={(e) => setF({ ...f, resume: e.target.value })} />
        </Field>
        {resumeErr && <p className="field-error">{resumeErr}</p>}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="!w-4" checked={f.is_visible} onChange={(e) => setF({ ...f, is_visible: e.target.checked })} />
          نمایش در سایت
        </label>
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={() => navigate("/lawyers")}>بازگشت</button>
          <button className="btn-primary" onClick={() => save.mutate()} disabled={save.isPending || !f.name || !f.slug}>
            <Save size={15} /> {save.isPending ? "در حال ذخیره…" : "ذخیره"}
          </button>
        </div>
      </div>
    </div>
  );
}
