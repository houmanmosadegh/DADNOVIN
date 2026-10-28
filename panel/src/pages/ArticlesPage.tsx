/** Articles management — draft/published workflow with SEO fields. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { api, ApiError } from "../services/api";
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
import type { ArticleOut, Page } from "../types/api";

interface Draft {
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  seo_title: string;
  seo_description: string;
  status: string;
}

const EMPTY: Draft = {
  slug: "",
  title: "",
  excerpt: "",
  body: "",
  seo_title: "",
  seo_description: "",
  status: "draft",
};

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
        subtitle="مدیریت مقالات سایت — پیش‌نویس و انتشار"
        actions={
          <button className="btn-gold btn-sm" onClick={() => setEditing("new")}>
            <Plus size={15} /> مقالهٔ جدید
          </button>
        }
      />

      <div className="card mb-4 flex flex-wrap items-center gap-2 p-3">
        <form
          className="relative min-w-[200px] flex-1"
          onSubmit={(e) => { e.preventDefault(); setQ(qInput); setPage(1); }}
        >
          <Search size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <input value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="جستجو: عنوان یا اسلاگ…" className="pr-9" />
        </form>
        <select className="!w-32" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">همه</option>
          <option value="draft">پیش‌نویس</option>
          <option value="published">منتشرشده</option>
        </select>
      </div>

      {list.isLoading && <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>}
      {list.isError && <ErrorState text="بارگذاری مقالات ناموفق بود." onRetry={() => list.refetch()} />}
      {list.data && list.data.items.length === 0 && (
        <EmptyState
          text="مقاله‌ای وجود ندارد"
          hint="اولین مقاله را بسازید."
          action={<button className="btn-gold btn-sm" onClick={() => setEditing("new")}>مقالهٔ جدید</button>}
        />
      )}
      {list.data && list.data.items.length > 0 && (
        <>
          <div className="card divide-y divide-sand-2">
            {list.data.items.map((a) => (
              <div key={a.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <button className="text-[14px] font-medium text-ink-0 hover:text-gold-1" onClick={() => setEditing(a)}>
                    {a.title}
                  </button>
                  <p className="mt-0.5 text-[11px] text-ink-3" dir="ltr">/{a.slug}</p>
                </div>
                <StatusBadge value={a.status} />
                <span className="hidden text-[11px] text-ink-3 sm:block">{fmtDate(a.updated_at)}</span>
                <button className="rounded-lg p-1.5 text-ink-3 hover:text-red-600" onClick={() => setDeleting(a)} aria-label="حذف">
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

function ArticleDrawer({ article, onClose }: { article: ArticleOut | "new" | null; onClose: () => void }) {
  const isNew = article === "new";
  const [v, setV] = useState<Draft>(EMPTY);
  const toast = useToast();
  const qc = useQueryClient();

  useEffect(() => {
    if (!article || article === "new") setV(EMPTY);
    else setV({
      slug: article.slug, title: article.title, excerpt: article.excerpt,
      body: article.body, seo_title: article.seo_title,
      seo_description: article.seo_description, status: article.status,
    });
  }, [article]);

  const save = useMutation({
    mutationFn: () =>
      isNew
        ? api.post<ArticleOut>("/admin/articles", v)
        : api.patch<ArticleOut>(`/admin/articles/${(article as ArticleOut).id}`, v),
    onSuccess: () => {
      toast("success", "مقاله ذخیره شد.");
      qc.invalidateQueries({ queryKey: ["articles"] });
      onClose();
    },
    onError: (e) => toast("error", e instanceof ApiError ? e.message : "خطا در ذخیره"),
  });

  if (!article) return null;
  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setV((p) => ({ ...p, [k]: e.target.value }));

  return (
    <Drawer open onClose={onClose} title={isNew ? "مقالهٔ جدید" : "ویرایش مقاله"} width="max-w-2xl">
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="عنوان" error={!v.title.trim() && save.isError ? "الزامی" : undefined}>
            <input value={v.title} onChange={set("title")} />
          </Field>
          <Field label="اسلاگ (انگلیسی)" hint="فقط حروف کوچک، عدد و خط تیره">
            <input dir="ltr" value={v.slug} onChange={set("slug")} placeholder="family-law-101" />
          </Field>
        </div>
        <Field label="خلاصه">
          <textarea rows={2} value={v.excerpt} onChange={set("excerpt")} />
        </Field>
        <Field label="متن مقاله">
          <textarea rows={12} value={v.body} onChange={set("body")} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="عنوان سئو"><input value={v.seo_title} onChange={set("seo_title")} /></Field>
          <Field label="وضعیت">
            <select value={v.status} onChange={set("status")}>
              <option value="draft">پیش‌نویس</option>
              <option value="published">منتشرشده</option>
            </select>
          </Field>
        </div>
        <Field label="توضیح سئو">
          <textarea rows={2} value={v.seo_description} onChange={set("seo_description")} />
        </Field>
        <div className="flex justify-end gap-2 border-t border-sand-2 pt-4">
          <button className="btn-ghost" onClick={onClose}>انصراف</button>
          <button className="btn-gold" disabled={!v.title.trim() || !v.slug.trim() || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "در حال ذخیره…" : "ذخیره"}
          </button>
        </div>
      </div>
    </Drawer>
  );
}
