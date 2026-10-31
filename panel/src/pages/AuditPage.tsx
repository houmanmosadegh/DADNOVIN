import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../services/api";
import type { AuditRow, Page } from "../types/api";
import { EmptyState, PageSkeleton, Pagination, Table, fmtDate } from "../components/ui";

const ACTION_FA: Record<string, string> = {
  "auth.login": "ورود",
  "setting.update": "ویرایش تنظیمات",
  "page.update": "ویرایش صفحه",
  "section.update": "ویرایش بخش",
  "lawyer.create": "ایجاد وکیل",
  "lawyer.update": "ویرایش وکیل",
  "lawyer.delete": "حذف وکیل",
  "media.upload": "بارگذاری رسانه",
  "media.update": "ویرایش رسانه",
  "media.delete": "حذف رسانه",
  "consultation.update": "به‌روزرسانی درخواست",
  "ticket.update": "به‌روزرسانی تیکت",
  "user.create": "ایجاد کاربر",
  "user.update": "ویرایش کاربر",
  "knowledge.create": "ایجاد دانش",
  "knowledge.update": "ویرایش دانش",
  "knowledge.delete": "حذف دانش",
  "knowledge.sync": "همگام‌سازی دانش",
};

export default function AuditPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-audit", page],
    queryFn: () => api.get<Page<AuditRow>>(`/admin/audit?page=${page}&page_size=30`),
  });

  if (isLoading || !data) return <PageSkeleton />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold">گزارش فعالیت‌ها</h1>
        <p className="mt-0.5 text-[13px] text-ink-1/60">رویدادهای مدیریتی — جدیدترین‌ها اول</p>
      </div>
      {data.items.length === 0 ? (
        <EmptyState text="رویدادی ثبت نشده است" />
      ) : (
        <>
          <Table head={["زمان", "کاربر", "اقدام", "موجودیت", "جزئیات"]}>
            {data.items.map((r) => (
              <tr key={r.id} className="hover:bg-sand-2">
                <td className="whitespace-nowrap px-4 py-3 text-[12px] text-ink-1/50">{fmtDate(r.created_at)}</td>
                <td className="px-4 py-3 text-[13px]" dir="ltr">
                  {r.actor_username || "—"}
                </td>
                <td className="px-4 py-3">
                  <span className="rounded bg-sand-1 px-2 py-0.5 text-[12px]">{ACTION_FA[r.action] ?? r.action}</span>
                </td>
                <td className="px-4 py-3 text-[12px] text-ink-1/60" dir="ltr">
                  {r.entity}
                  {r.entity_id ? `#${String(r.entity_id).slice(0, 8)}` : ""}
                </td>
                <td className="max-w-56 truncate px-4 py-3 text-[12px] text-ink-1/50" dir="ltr">
                  {Object.keys(r.detail ?? {}).length ? JSON.stringify(r.detail) : "—"}
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
