import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../services/api";
import type { Page, TicketOut } from "../types/api";
import { EmptyState, PageSkeleton, Pagination, StatusBadge, Table, fmtDate } from "../components/ui";

const FILTERS = [
  { value: "", label: "همه" },
  { value: "open", label: "باز" },
  { value: "in_progress", label: "در حال رسیدگی" },
  { value: "waiting_customer", label: "در انتظار مشتری" },
  { value: "resolved", label: "حل‌شده" },
  { value: "closed", label: "بسته" },
];

export default function TicketsPage() {
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [qActive, setQActive] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-tickets", page, status, qActive],
    queryFn: () =>
      api.get<Page<TicketOut>>(
        `/admin/tickets?page=${page}&page_size=20${status ? `&status=${status}` : ""}${qActive ? `&q=${encodeURIComponent(qActive)}` : ""}`,
      ),
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold">تیکت‌ها</h1>
        <p className="mt-0.5 text-[13px] text-ink-1/60">
          {data?.total.toLocaleString("fa-IR") ?? "…"} تیکت
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            className={`rounded-full border px-3 py-1 text-[12px] font-medium transition ${
              status === f.value ? "border-gold-1 bg-gold-1/15 text-ink-0" : "border-sand-2 bg-sand-1 text-ink-1/70"
            }`}
            onClick={() => { setPage(1); setStatus(f.value); }}
          >
            {f.label}
          </button>
        ))}
        <form
          className="mr-auto flex gap-1.5"
          onSubmit={(e) => { e.preventDefault(); setPage(1); setQActive(q); }}
        >
          <input placeholder="جستجو: شماره، نام، موضوع…" className="!w-56" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn-ghost btn-sm" type="submit">جستجو</button>
        </form>
      </div>

      {isLoading || !data ? (
        <PageSkeleton />
      ) : data.items.length === 0 ? (
        <EmptyState text="تیکتی یافت نشد" />
      ) : (
        <>
          <Table head={["شماره", "موضوع", "درخواست‌کننده", "اولویت", "وضعیت", "تاریخ", ""]}>
            {data.items.map((t) => (
              <tr key={t.id} className="hover:bg-sand-2">
                <td className="px-4 py-3 font-medium" dir="ltr">{t.ticket_number}</td>
                <td className="max-w-52 truncate px-4 py-3">{t.subject}</td>
                <td className="px-4 py-3 text-ink-1/70">{t.requester_name}</td>
                <td className="px-4 py-3"><StatusBadge value={t.priority} /></td>
                <td className="px-4 py-3"><StatusBadge value={t.status} /></td>
                <td className="px-4 py-3 text-[12px] text-ink-1/50">{fmtDate(t.created_at)}</td>
                <td className="px-4 py-3"><Link to={`/tickets/${t.id}`} className="btn-ghost btn-sm">گفتگو</Link></td>
              </tr>
            ))}
          </Table>
          <Pagination page={page} total={data.total} pageSize={data.page_size} onPage={setPage} />
        </>
      )}
    </div>
  );
}
