/** Articles management — rich editor (TipTap), SEO fields, scheduling,
 *  categories/tags, featured image, author, version history. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History, ImagePlus, Plus, RotateCcw, Search, Trash2, X } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "../services/api";

const RichEditor = lazy(() => import("../components/RichEditor"));
import {
  ConfirmDialog,
  Drawer,
  EmptyState,
  ErrorState,
  Field,
  fmtDate,
  PageHeader,
  Pagination,
  Skeleton,
  StatusBadge,
  useToast,
} from "../components/ui";
import type { ArticleOut, ArticleRevision, LawyerOut, Page } from "../types/api";

const CATEGORIES = [
  "خانواده",
  "کیفری",
  "ملکی و املاک",
  "قراردادها",
  "چک و سفته",
  "شرکت‌ها و تجارت",
  "ارث و وصیت",
  "حقوق کار",
  "عمومی",
];

const STATUS_OPTS = [
  { v: "draft", l: "پیش‌نویس" },
  { v: "scheduled", l: "زمان‌بندی‌شده" },
  { v: "published", l: "منتشرشده" },
  { v: "archived", l: "آرشیو" },
];

interface Draft {
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  seo_title: string;
  seo_description: string;
  canonical: string;
  category: string;
  tags: string[];
  author_name: string;
  author_bio: string;
  featured_image_id: string | null;
  featured_image_url: string;
  status: string;
  scheduled_at: string;
}

const EMPTY: Draft = {
  slug: "",
  title: "",
  excerpt: "",
  body: "",
  seo_title: "",
  seo_description: "",
  canonical: "",
  category: "",
  tags: [],
  author_name: "",
  author_bio: "",
  featured_image_id: null,
  featured_image_url: "",
  status: "draft",
  scheduled_at: "",
};

function slugify(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9\u0600-\u06FF_-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

export default function ArticlesPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [qInput, setQInput] = useState("");
  const [editing, setEditing] = useState<ArticleOut | "new" | null>(null);
  const [deleting, setDeleting] = useState<ArticleOut | null>(null);
  const toast = useToast();
  const qc = useQueryClient();

  const qs = new URLSearchParams({ page: String(page), page_size: "15" });
  if (status) qs.set("status", status);
  if (q) qs.set("q", q);

  const list = useQuery({
    queryKey: ["articles", qs.toString()],
    queryFn: () => api.get<Page<ArticleOut>>(`/admin/articles?${qs}`),
  });

  const del = useMutation({
    mutationFn: (id: string) => api.del(`/admin/articles/${id}`),
    onSuccess: () => {
      toast("success", "مقاله حذف شد.");
      setDeleting(null);
      qc.invalidateQueries({ queryKey: ["articles"] });
    },
    onError: (e) => toast("error", e instanceof ApiError ? e.message : "خطا"),
  });

  return (
    <div>
      <PageHeader
        title="مقالات"
        subtitle="مدیریت مقالات سایت — پیش‌نویس، زمان‌بندی و انتشار"
        actions={
          <button className="btn-gold btn-sm" onClick={() => setEditing("new")}>
            <Plus size={15} /> مقالهٔ جدید
          </button>
        }
      />

      <div className="card mb-4 flex flex-wrap items-center gap-2 p-3">
        <form
          className="relative min-w-[200px] flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            setQ(qInput);
            setPage(1);
          }}
        >
          <Search size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="جستجو: عنوان یا اسلاگ…"
            className="pr-9"
          />
        </form>
        <select
          className="!w-36"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">همهٔ وضعیت‌ها</option>
          {STATUS_OPTS.map((o) => (
            <option key={o.v} value={o.v}>
              {o.l}
            </option>
          ))}
        </select>
      </div>

      {list.isLoading && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      )}
      {list.isError && <ErrorState text="بارگذاری مقالات ناموفق بود." onRetry={() => list.refetch()} />}
      {list.data && list.data.items.length === 0 && (
        <EmptyState
          text="مقاله‌ای وجود ندارد"
          hint="اولین مقاله را بسازید."
          action={
            <button className="btn-gold btn-sm" onClick={() => setEditing("new")}>
              مقالهٔ جدید
            </button>
          }
        />
      )}
      {list.data && list.data.items.length > 0 && (
        <>
          <div className="card divide-y divide-sand-2">
            {list.data.items.map((a) => (
              <div key={a.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <button
                    className="text-[14px] font-medium text-ink-0 hover:text-gold-1"
                    onClick={() => setEditing(a)}
                  >
                    {a.title}
                  </button>
                  <p className="mt-0.5 text-[12px] text-ink-3">
                    <span dir="ltr">/{a.slug}</span>
                    {a.category ? ` · ${a.category}` : ""}
                    {a.read_time_min ? ` · ${a.read_time_min} دقیقه` : ""}
                  </p>
                </div>
                <StatusBadge value={a.status} />
                <span className="hidden text-[12px] text-ink-3 sm:block">{fmtDate(a.updated_at)}</span>
                <button
                  className="rounded-lg p-1.5 text-ink-3 hover:text-red-400"
                  onClick={() => setDeleting(a)}
                  aria-label="حذف"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
          <Pagination page={list.data.page} total={list.data.total} pageSize={list.data.page_size} onPage={setPage} />
        </>
      )}

      <ArticleDrawer article={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={!!deleting}
        title="حذف مقاله"
        body={`«${deleting?.title}» برای همیشه حذف می‌شود.`}
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && del.mutate(deleting.id)}
      />
    </div>
  );
}

function CharHint({ len, max }: { len: number; max: number }) {
  const over = len > max;
  return (
    <span className={`text-[11px] ${over ? "text-red-400" : "text-ink-3"}`} dir="ltr">
      {len}/{max}
    </span>
  );
}

function ArticleDrawer({ article, onClose }: { article: ArticleOut | "new" | null; onClose: () => void }) {
  const isNew = article === "new";
  const [v, setV] = useState<Draft>(EMPTY);
  const [slugTouched, setSlugTouched] = useState(false);
  const [showRevisions, setShowRevisions] = useState(false);
  const [tagsInput, setTagsInput] = useState("");
  const toast = useToast();
  const qc = useQueryClient();
  const featRef = useRef<HTMLInputElement>(null);
  const autosave = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    setSlugTouched(false);
    setShowRevisions(false);
    if (!article || article === "new") {
      setV(EMPTY);
      setTagsInput("");
    } else {
      setV({
        slug: article.slug,
        title: article.title,
        excerpt: article.excerpt,
        body: article.body,
        seo_title: article.seo_title,
        seo_description: article.seo_description,
        canonical: article.canonical,
        category: article.category,
        tags: article.tags ?? [],
        author_name: article.author_name,
        author_bio: article.author_bio,
        featured_image_id: article.featured_image_id,
        featured_image_url: "",
        status: article.status,
        scheduled_at: article.scheduled_at ? article.scheduled_at.slice(0, 16) : "",
      });
      setTagsInput((article.tags ?? []).join("، "));
    }
  }, [article]);

  const lawyers = useQuery({
    queryKey: ["admin-lawyers"],
    queryFn: () => api.get<LawyerOut[]>("/admin/lawyers"),
    enabled: !!article,
    staleTime: 60_000,
  });

  const revisions = useQuery({
    queryKey: ["article-revs", !isNew && article ? article.id : ""],
    queryFn: () => api.get<ArticleRevision[]>(`/admin/articles/${(article as ArticleOut).id}/revisions`),
    enabled: showRevisions && !isNew && !!article,
  });

  const payload = useMemo(
    () => ({
      slug: slugify(v.slug),
      title: v.title,
      excerpt: v.excerpt,
      body: v.body,
      seo_title: v.seo_title,
      seo_description: v.seo_description,
      canonical: v.canonical,
      category: v.category,
      tags: tagsInput
        .split(/[،,]/)
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 20),
      author_name: v.author_name,
      author_bio: v.author_bio,
      featured_image_id: v.featured_image_id,
      clear_featured_image: !v.featured_image_id,
      status: v.status,
      scheduled_at: v.status === "scheduled" && v.scheduled_at ? new Date(v.scheduled_at).toISOString() : null,
    }),
    [v, tagsInput]
  );

  const save = useMutation({
    mutationFn: () =>
      isNew
        ? api.post<ArticleOut>("/admin/articles", payload)
        : api.patch<ArticleOut>(`/admin/articles/${(article as ArticleOut).id}`, payload),
    onSuccess: () => {
      toast("success", "مقاله ذخیره شد.");
      qc.invalidateQueries({ queryKey: ["articles"] });
      qc.invalidateQueries({ queryKey: ["article-revs"] });
      onClose();
    },
    onError: (e) => toast("error", e instanceof ApiError ? e.message : "خطا در ذخیره"),
  });

  // ذخیرهٔ خودکار پیش‌نویس — فقط در حالت ویرایش (مقالهٔ موجود)
  const quietSave = useMutation({
    mutationFn: () => api.patch<ArticleOut>(`/admin/articles/${(article as ArticleOut).id}`, payload),
  });
  function scheduleAutosave(mut: () => void) {
    mut();
    if (isNew) return;
    clearTimeout(autosave.current);
    autosave.current = setTimeout(() => {
      if (v.title.trim() && slugify(v.slug)) quietSave.mutate();
    }, 2500);
  }

  const restore = useMutation({
    mutationFn: (revId: string) =>
      api.post<ArticleOut>(`/admin/articles/${(article as ArticleOut).id}/revisions/${revId}/restore`),
    onSuccess: (a) => {
      toast("success", "نسخه بازگردانی شد (به‌صورت پیش‌نویس).");
      qc.invalidateQueries({ queryKey: ["articles"] });
      setV((p) => ({
        ...p,
        title: a.title,
        excerpt: a.excerpt,
        body: a.body,
        seo_title: a.seo_title,
        seo_description: a.seo_description,
        canonical: a.canonical,
        category: a.category,
        tags: a.tags,
        author_name: a.author_name,
        author_bio: a.author_bio,
        status: a.status,
      }));
      setShowRevisions(false);
    },
    onError: (e) => toast("error", e instanceof ApiError ? e.message : "خطا"),
  });

  async function pickFeatured(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast("error", "فقط JPG/PNG/WebP قابل قبول است.");
      return;
    }
    const form = new FormData();
    form.append("file", file);
    form.append("alt", v.title || "تصویر شاخص");
    try {
      const media = await api.upload<{ id: string; url: string }>("/admin/media", form);
      setV((p) => ({ ...p, featured_image_id: media.id, featured_image_url: media.url }));
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "آپلود ناموفق بود.");
    }
  }

  if (!article) return null;
  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    scheduleAutosave(() =>
      setV((p) => {
        const next = { ...p, [k]: e.target.value };
        if (k === "title" && isNew && !slugTouched) next.slug = slugify(e.target.value);
        return next;
      })
    );

  const seoTitle = v.seo_title || v.title;
  const seoDesc = v.seo_description || v.excerpt;

  return (
    <Drawer open onClose={onClose} title={isNew ? "مقالهٔ جدید" : "ویرایش مقاله"} width="max-w-4xl">
      <div className="space-y-5">
        {/* عنوان + اسلاگ */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="عنوان" error={!v.title.trim() && save.isError ? "الزامی" : undefined}>
            <input value={v.title} onChange={set("title")} placeholder="عنوان مقاله" />
          </Field>
          <Field label="اسلاگ" hint="فارسی یا انگلیسی — در آدرس مقاله می‌آید">
            <input
              dir="ltr"
              className="text-left"
              value={v.slug}
              onChange={(e) => {
                setSlugTouched(true);
                scheduleAutosave(() => setV((p) => ({ ...p, slug: slugify(e.target.value) })));
              }}
              placeholder="family-law-101 یا حقوق-خانواده"
            />
          </Field>
        </div>

        {/* دسته + برچسب + نویسنده */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="حوزهٔ تخصصی">
            <select value={v.category} onChange={set("category")}>
              <option value="">— انتخاب —</option>
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </Field>
          <Field label="برچسب‌ها" hint="با ویرگول جدا کنید">
            <input value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="طلاق، حضانت، مهریه" />
          </Field>
          <Field label="زمان مطالعه">
            <input value={!isNew && article ? `${article.read_time_min} دقیقه (خودکار)` : "خودکار"} disabled />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="نویسنده">
            <select
              value={v.author_name}
              onChange={(e) => {
                const lw = lawyers.data?.find((l) => l.name === e.target.value);
                scheduleAutosave(() =>
                  setV((p) => ({
                    ...p,
                    author_name: e.target.value,
                    author_bio: lw ? lw.bio.slice(0, 400) : p.author_bio,
                  }))
                );
              }}
            >
              <option value="">— بدون نویسنده —</option>
              {(lawyers.data ?? []).map((l) => (
                <option key={l.id} value={l.name}>
                  {l.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="بیوگرافی کوتاه نویسنده">
            <input value={v.author_bio} onChange={set("author_bio")} placeholder="از پروفایل وکیل پر می‌شود" />
          </Field>
        </div>

        {/* تصویر شاخص */}
        <div className="flex items-end gap-4">
          <div className="flex-1">
            <Field label="تصویر شاخص" hint="JPG/PNG/WebP — در بالای مقاله و کارت فهرست">
              <div className="flex items-center gap-3">
                {v.featured_image_id ? (
                  <div className="relative">
                    <img
                      src={v.featured_image_url || `/api/v1/media/${v.featured_image_id}`}
                      alt="تصویر شاخص"
                      className="h-20 w-32 rounded-lg border border-line object-cover"
                    />
                    <button
                      className="absolute -left-2 -top-2 rounded-full border border-line bg-sand-1 p-1 text-ink-2 hover:text-red-400"
                      onClick={() =>
                        scheduleAutosave(() => setV((p) => ({ ...p, featured_image_id: null, featured_image_url: "" })))
                      }
                      aria-label="حذف تصویر"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <button className="btn-ghost btn-sm" onClick={() => featRef.current?.click()}>
                    <ImagePlus size={15} /> انتخاب تصویر
                  </button>
                )}
                {v.featured_image_id && (
                  <button className="btn-ghost btn-sm" onClick={() => featRef.current?.click()}>
                    تعویض
                  </button>
                )}
              </div>
            </Field>
          </div>
          <input
            ref={featRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => void pickFeatured(e)}
          />
        </div>

        <Field label="چکیده">
          <textarea
            rows={2}
            value={v.excerpt}
            onChange={set("excerpt")}
            placeholder="خلاصه‌ای که در فهرست مقالات و نتایج جستجو دیده می‌شود"
          />
        </Field>

        {/* ادیتور */}
        <div>
          <span className="mb-1.5 block text-[13px] font-medium text-ink-1">متن مقاله</span>
          <Suspense fallback={<Skeleton className="h-64" />}>
            <RichEditor
              value={v.body}
              onChange={(html) => scheduleAutosave(() => setV((p) => ({ ...p, body: html })))}
            />
          </Suspense>
        </div>

        {/* SEO */}
        <div className="rounded-lg border border-sand-2 p-4">
          <h4 className="mb-3 text-[13px] font-semibold text-ink-0">سئو</h4>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={
                <>
                  عنوان سئو <CharHint len={seoTitle.length} max={60} />
                </>
              }
            >
              <input
                value={v.seo_title}
                onChange={set("seo_title")}
                placeholder="اگر خالی بماند عنوان مقاله استفاده می‌شود"
              />
            </Field>
            <Field
              label={
                <>
                  توضیح سئو <CharHint len={seoDesc.length} max={160} />
                </>
              }
            >
              <input
                value={v.seo_description}
                onChange={set("seo_description")}
                placeholder="اگر خالی بماند چکیده استفاده می‌شود"
              />
            </Field>
          </div>
          <Field label="آدرس کانونیکال (اختیاری)" hint="فقط اگر نسخهٔ اصلی این متن جای دیگری منتشر شده">
            <input
              dir="ltr"
              className="text-left"
              value={v.canonical}
              onChange={set("canonical")}
              placeholder="https://…"
            />
          </Field>
          {/* پیش‌نمایش نتیجهٔ گوگل */}
          <div className="mt-3 rounded-lg border border-line bg-sand-0 p-3" dir="ltr">
            <p className="truncate text-[13px] text-[#8ab4f8]">{seoTitle || "عنوان مقاله"}</p>
            <p className="text-[12px] text-[#9aa0a6]">dadnovin.ir/articles/{slugify(v.slug) || "slug"}</p>
            <p className="mt-0.5 line-clamp-2 text-[12px] text-[#bdc1c6]">
              {seoDesc || "توضیح مقاله در اینجا نمایش داده می‌شود."}
            </p>
          </div>
        </div>

        {/* انتشار */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="وضعیت">
            <select value={v.status} onChange={set("status")}>
              {STATUS_OPTS.map((o) => (
                <option key={o.v} value={o.v}>
                  {o.l}
                </option>
              ))}
            </select>
          </Field>
          {v.status === "scheduled" && (
            <Field label="زمان انتشار">
              <input type="datetime-local" dir="ltr" value={v.scheduled_at} onChange={set("scheduled_at")} />
            </Field>
          )}
        </div>

        {/* نسخه‌ها */}
        {!isNew && (
          <div className="rounded-lg border border-sand-2">
            <button
              className="flex w-full items-center gap-2 px-4 py-2.5 text-[13px] text-ink-1 hover:text-ink-0"
              onClick={() => setShowRevisions((s) => !s)}
            >
              <History size={14} /> تاریخچهٔ نسخه‌ها
            </button>
            {showRevisions && (
              <div className="border-t border-sand-2 px-4 py-2">
                {revisions.isLoading && <Skeleton className="h-8" />}
                {revisions.data?.length === 0 && <p className="py-2 text-[13px] text-ink-3">نسخه‌ای ثبت نشده.</p>}
                {revisions.data?.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center gap-3 border-b border-sand-2 py-2 text-[13px] last:border-0"
                  >
                    <span className="min-w-0 flex-1 truncate text-ink-1">
                      {r.title} {r.note ? <em className="text-ink-3 not-italic">— {r.note}</em> : null}
                    </span>
                    <StatusBadge value={r.status} />
                    <span className="text-[12px] text-ink-3">{fmtDate(r.created_at)}</span>
                    <button
                      className="btn-ghost btn-sm"
                      disabled={restore.isPending}
                      onClick={() => restore.mutate(r.id)}
                    >
                      <RotateCcw size={13} /> بازگردانی
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-sand-2 pt-4">
          <span className="text-[12px] text-ink-3">
            {quietSave.isPending
              ? "در حال ذخیرهٔ خودکار…"
              : quietSave.isSuccess && !isNew
                ? "پیش‌نویس خودکار ذخیره شد"
                : ""}
          </span>
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={onClose}>
              انصراف
            </button>
            <button
              className="btn-gold"
              disabled={!v.title.trim() || !slugify(v.slug) || save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? "در حال ذخیره…" : v.status === "published" ? "انتشار" : "ذخیره"}
            </button>
          </div>
        </div>
      </div>
    </Drawer>
  );
}
