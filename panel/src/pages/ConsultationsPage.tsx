import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../services/api";
import type { ConsultationOut, Page } from "../types/api";
import { EmptyState, PageSkeleton, Pagination, StatusBadge, Table, fmtDate } from "../components/ui";

const FILTERS = [
  { value: "", label: "همه" },
  { value: "new", label: "جدید" },
  { value: "reviewing", label: "در حال بررسی" },
  { value: "awaiting_reply", label: "در انتظار پاسخ" },
  { value: "done", label: "تکمیل‌شده" },
  { value: "cancelled", label: "لغوشده" },
];

export default function ConsultationsPage() {
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "";
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [qActive, setQActive] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-consultations", page, status, qActive],
    queryFn: () =>
      api.get<Page<ConsultationOut>>(
        `/admin/consultations?page=${page}&page_size=20${status ? `&status=${status}` : ""}${qActive ? `&q=${encodeURIComponent(qActive)}` : ""}`,
      ),
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold">فرم‌های مشاوره</h1>
        <p className="mt-0.5 text-[13px] text-ink-1/60">
          درخواست‌های ثبت‌شده از سایت — {data?.total.toLocaleString("fa-IR") ?? "…"} مورد
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            className={`rounded-full border px-3 py-1 text-[12px] font-medium transition ${
              status === f.value
                ? "border-gold-1 bg-gold-1/15 text-ink-0"
                : "border-sand-2 bg-sand-1 text-ink-1/70 hover:border-sand-2"
            }`}
            onClick={() => {
              setPage(1);
              if (f.value) setParams({ status: f.value });
              else setParams({});
            }}
          >
            {f.label}
          </button>
        ))}
        <form
          className="mr-auto flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setQActive(q);
          }}
        >
          <input
            placeholder="جستجو: نام، تلفن، متن…"
            className="!w-52"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button className="btn-ghost btn-sm" type="submit">جستجو</button>
        </form>
      </div>

      {isLoading || !data ? (
        <PageSkeleton />
      ) : data.items.length === 0 ? (
        <EmptyState text="درخواستی یافت نشد" hint="با تغییر فیلتر یا عبارت جستجو دوباره تلاش کنید." />
      ) : (
        <>
          <Table head={["نام", "تلفن", "موضوع", "وضعیت", "تاریخ", ""]}>
            {data.items.map((r) => (
              <tr key={r.id} className="hover:bg-sand-2">
                <td className="px-4 py-3 font-medium">{r.full_name}</td>
                <td className="px-4 py-3 tabular-nums" dir="ltr">{r.phone}</td>
                <td className="max-w-56 truncate px-4 py-3 text-ink-1/70">
                  {r.topic || r.service_slug || "—"}
                </td>
                <td className="px-4 py-3"><StatusBadge value={r.status} /></td>
                <td className="px-4 py-3 text-[12px] text-ink-1/50">{fmtDate(r.created_at)}</td>
                <td className="px-4 py-3">
                  <Link to={`/consultations/${r.id}`} className="btn-ghost btn-sm">جزئیات</Link>
                </td>
              </tr>
            ))}
          </Table>
          <Pagination page={page} total={data.total} pageSize={data.page_size} onPage={setPage} />
        </>
      )}
    </div>
  );
}
