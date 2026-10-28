/** Unified request inbox — consultations, contacts and tickets in one list. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../services/api";
import {
  EmptyState,
  ErrorState,
  fmtRelative,
  PageHeader,
  Pagination,
  Skeleton,
  StatusBadge,
  STATUS_FA,
  useToast,
} from "../components/ui";
import { useAuth } from "../stores/auth";
import type { AssigneeOut, InboxRow, Page } from "../types/api";

const TABS = [
  { key: "all", label: "همه" },
  { key: "new", label: "جدید" },
  { key: "mine", label: "کارهای من" },
  { key: "overdue", label: "معوق" },
  { key: "unanswered", label: "بی‌پاسخ" },
] as const;

const STATUS_OPTIONS = [
  "new", "reviewing", "awaiting_call", "followed_up", "waiting_reply",
  "contacted", "completed", "resolved", "closed", "cancelled",
];

export default function InboxPage({
  fixedType,
  title = "صندوق ورودی",
  subtitle = "همهٔ درخواست‌ها — مشاوره، تماس و تیکت — در یک نما",
}: {
  fixedType?: "consultation" | "ticket" | "contact";
  title?: string;
  subtitle?: string;
}) {
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<string>(params.get("tab") ?? "all");
  const [status, setStatus] = useState(params.get("status") ?? "");
  const [type, setType] = useState(params.get("type") ?? "");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<"updated_desc" | "updated_asc">("updated_desc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const q = params.get("q") ?? "";
  const [qInput, setQInput] = useState(q);
  const toast = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const navigate = useNavigate();

  const effType = fixedType ?? (type || undefined);
  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (effType) p.set("type", effType);
    if (tab !== "all") p.set("tab", tab);
    if (status) p.set("status", status);
    if (q) p.set("q", q);
    p.set("sort", sort);
    p.set("page", String(page));
    p.set("page_size", "20");
    return p.toString();
  }, [effType, tab, status, q, sort, page]);

  const list = useQuery({
    queryKey: ["inbox", qs],
    queryFn: () => api.get<Page<InboxRow>>(`/admin/inbox?${qs}`),
  });

  const assignees = useQuery({
    queryKey: ["assignees"],
    queryFn: () => api.get<AssigneeOut[]>("/admin/assignees"),
  });

  const bulkAssign = useMutation({
    mutationFn: async (target: string | null) => {
      await Promise.all(
        [...selected].map((key) => {
          const [rtype, id] = key.split(":");
          return api.patch(`/admin/requests/${rtype}/${id}`, { assigned_to: target });
        }),
      );
    },
    onSuccess: () => {
      toast("success", "ارجاع انجام شد.");
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["inbox"] });
    },
    onError: (e) =>
      toast("error", e instanceof ApiError ? e.message : "خطا در ارجاع گروهی"),
  });

  const exportCsv = async () => {
    const p = new URLSearchParams();
    if (effType) p.set("type", effType);
    if (tab !== "all") p.set("tab", tab);
    if (status) p.set("status", status);
    if (q) p.set("q", q);
    const res = await fetch(`/api/v1/admin/inbox.csv?${p}`, { credentials: "include" });
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "inbox.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const toggleAll = (rows: InboxRow[]) => {
    setSelected((s) =>
      s.size === rows.length ? new Set() : new Set(rows.map((r) => `${r.type}:${r.id}`)),
    );
  };

  const row = (r: InboxRow) => (
    <>
      <td className="td w-8">
        <input
          type="checkbox"
          className="!w-4"
          checked={selected.has(`${r.type}:${r.id}`)}
          onChange={(e) => {
            const key = `${r.type}:${r.id}`;
            setSelected((s) => {
              const n = new Set(s);
              if (e.target.checked) n.add(key);
              else n.delete(key);
              return n;
            });
          }}
          aria-label="انتخاب ردیف"
        />
      </td>
      <td className="td">
        <Link
          to={`/requests/${r.type}/${r.id}`}
          className="font-medium text-ink-0 hover:text-gold-1"
        >
          {r.name}
        </Link>
        <p className="mt-0.5 text-[11px] text-ink-3" dir="ltr">{r.tracking_code}</p>
      </td>
      {!fixedType && <td className="td"><StatusBadge value={r.type} /></td>}
      <td className="td max-w-[220px] truncate">{r.subject}</td>
      <td className="td" dir="ltr">{r.phone}</td>
      <td className="td"><StatusBadge value={r.status} /></td>
      <td className="td"><StatusBadge value={r.priority} /></td>
      <td className="td text-[12px] text-ink-1">{r.assignee_name || "—"}</td>
      <td className="td text-[12px] text-ink-2" title={new Date(r.updated_at).toLocaleString("fa-IR")}>
        {fmtRelative(r.updated_at)}
        {r.overdue && <span className="mr-1 rounded-full bg-red-500/10 px-1.5 text-[10px] text-red-400">معوق</span>}
      </td>
    </>
  );

  return (
    <div>
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          <button className="btn-ghost btn-sm" onClick={exportCsv}>
            <Download size={14} /> خروجی CSV
          </button>
        }
      />

      {/* quick tabs */}
      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`chip ${tab === t.key ? "chip-active" : ""}`}
            onClick={() => { setTab(t.key); setPage(1); }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* filter bar */}
      <div className="card mb-4 flex flex-wrap items-center gap-2 p-3">
        <form
          className="relative min-w-[200px] flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            setParams((p) => { const n = new URLSearchParams(p); qInput ? n.set("q", qInput) : n.delete("q"); return n; });
            setPage(1);
          }}
        >
          <Search size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="جستجو: نام، تلفن، کد پیگیری، موضوع…"
            className="pr-9"
          />
        </form>
        {!fixedType && (
          <select
            className="!w-32"
            value={type}
            onChange={(e) => { setType(e.target.value); setPage(1); }}
          >
            <option value="">همهٔ انواع</option>
            <option value="consultation">مشاوره</option>
            <option value="contact">تماس</option>
            <option value="ticket">تیکت</option>
          </select>
        )}
        <select
          className="!w-36"
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
        >
          <option value="">همهٔ وضعیت‌ها</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{STATUS_FA[s] ?? s}</option>
          ))}
        </select>
        <button
          className="btn-ghost btn-sm"
          onClick={() => setSort((s) => (s === "updated_desc" ? "updated_asc" : "updated_desc"))}
        >
          {sort === "updated_desc" ? "جدیدترین" : "قدیمی‌ترین"}
        </button>

        {selected.size > 0 && (
          <div className="mr-auto flex items-center gap-2">
            <span className="text-[12px] text-ink-2">
              {selected.size.toLocaleString("fa-IR")} انتخاب‌شده
            </span>
            <select
              className="!w-40"
              value=""
              onChange={(e) => {
                if (!e.target.value) return;
                bulkAssign.mutate(e.target.value === "me" ? user?.id ?? null : e.target.value || null);
              }}
            >
              <option value="">ارجاع به…</option>
              <option value="me">خودم</option>
              {(assignees.data ?? []).map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
              <option value="">— برداشتن ارجاع —</option>
            </select>
          </div>
        )}
      </div>

      {/* body */}
      {list.isLoading && (
        <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}</div>
      )}
      {list.isError && (
        <ErrorState text="بارگذاری صندوق ورودی ناموفق بود." onRetry={() => list.refetch()} />
      )}
      {list.data && list.data.items.length === 0 && (
        <EmptyState
          text="درخواستی یافت نشد"
          hint={q || status || tab !== "all" ? "فیلترها را تغییر دهید یا پاک کنید." : "هنوز درخواستی ثبت نشده است."}
        />
      )}
      {list.data && list.data.items.length > 0 && (
        <>
          {/* desktop table */}
          <div className="card hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[880px] text-sm">
              <thead>
                <tr className="border-b border-sand-2 text-right">
                  <th className="th w-8">
                    <input
                      type="checkbox"
                      className="!w-4"
                      checked={selected.size === list.data.items.length}
                      onChange={() => toggleAll(list.data.items)}
                      aria-label="انتخاب همه"
                    />
                  </th>
                  <th className="th">نام / کد پیگیری</th>
                  {!fixedType && <th className="th">نوع</th>}
                  <th className="th">موضوع</th>
                  <th className="th">تلفن</th>
                  <th className="th">وضعیت</th>
                  <th className="th">اولویت</th>
                  <th className="th">مسئول</th>
                  <th className="th">به‌روزرسانی</th>
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((r) => (
                  <tr key={`${r.type}:${r.id}`} className="tr-hover cursor-pointer" onClick={(e) => {
                    if ((e.target as HTMLElement).closest("input,a,button")) return;
                    navigate(`/requests/${r.type}/${r.id}`);
                  }}>
                    {row(r)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* mobile cards */}
          <div className="space-y-2 lg:hidden">
            {list.data.items.map((r) => (
              <Link
                key={`${r.type}:${r.id}`}
                to={`/requests/${r.type}/${r.id}`}
                className="card block p-3.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[14px] font-medium text-ink-0">{r.name}</p>
                    <p className="mt-0.5 text-[11px] text-ink-3" dir="ltr">{r.tracking_code}</p>
                  </div>
                  <div className="flex gap-1.5">
                    <StatusBadge value={r.type} />
                    <StatusBadge value={r.status} />
                  </div>
                </div>
                <p className="mt-2 truncate text-[13px] text-ink-1">{r.subject}</p>
                <div className="mt-2 flex items-center justify-between text-[11px] text-ink-2">
                  <span dir="ltr">{r.phone}</span>
                  <span>{fmtRelative(r.updated_at)}{r.overdue ? " · معوق" : ""}</span>
                </div>
              </Link>
            ))}
          </div>

          <Pagination
            page={list.data.page}
            total={list.data.total}
            pageSize={list.data.page_size}
            onPage={setPage}
          />
        </>
      )}
    </div>
  );
}
