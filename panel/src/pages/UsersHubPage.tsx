/** کاربران — همهٔ کاربران · بازاریاب‌ها · ادمین‌ها (spec §2 sidebar #3). */

import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../services/api";
import {
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
  Table,
  Tabs,
} from "../components/ui";
import type { UserOut } from "../types/api";
import { ProfilesTab } from "./marketing/parts";
import UsersPage from "./UsersPage";

const TABS = [
  { key: "all", label: "همهٔ کاربران" },
  { key: "marketers", label: "بازاریاب‌ها" },
  { key: "admins", label: "ادمین‌ها" },
];

const ROLE_FA: Record<string, string> = {
  super_admin: "مدیر ارشد",
  admin: "مدیر",
  editor: "ویرایشگر",
  support: "پشتیبان",
  user: "کاربر",
  marketer: "بازاریاب",
};

export default function UsersHubPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "all";
  return (
    <div>
      <PageHeader title="کاربران" subtitle="حساب‌های کاربری، بازاریاب‌ها و ادمین‌ها" />
      <Tabs
        active={tab}
        onChange={(k) => setParams({ tab: k }, { replace: true })}
        tabs={TABS}
      />
      <div className="pt-4">
        {tab === "all" && <AllUsersTab />}
        {tab === "marketers" && <ProfilesTab />}
        {tab === "admins" && <UsersPage />}
      </div>
    </div>
  );
}

function AllUsersTab() {
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const list = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => api.get<UserOut[]>("/admin/users"),
  });

  const rows = useMemo(() => {
    let out = list.data ?? [];
    if (role)
      out = out.filter((u) => u.roles.some((r) => r.name === role));
    const needle = q.trim().toLowerCase();
    if (needle)
      out = out.filter(
        (u) =>
          u.full_name?.toLowerCase().includes(needle) ||
          u.username.toLowerCase().includes(needle) ||
          u.phone?.includes(needle),
      );
    return out;
  }, [list.data, q, role]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <input
            className="w-56 !py-1.5 pr-9 text-[13px]"
            placeholder="نام، نام کاربری، موبایل…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select className="w-40" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">همهٔ نقش‌ها</option>
          {Object.entries(ROLE_FA).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <span className="text-[12px] text-ink-2">{rows.length.toLocaleString("fa-IR")} کاربر</span>
      </div>

      {list.isLoading && <Skeleton className="h-56" />}
      {list.isError && <ErrorState text="بارگذاری ناموفق بود." onRetry={() => list.refetch()} />}
      {list.data && rows.length === 0 && <EmptyState text="کاربری یافت نشد" />}

      {rows.length > 0 && (
        <Table head={["نام", "نام کاربری", "موبایل", "نقش‌ها", "وضعیت", "عضویت"]}>
          {rows.map((u) => (
            <tr key={u.id} className="border-b border-sand-2 last:border-0">
              <td className="td font-medium">{u.full_name || "—"}</td>
              <td className="td" dir="ltr"><span className="font-mono text-[12px]">{u.username}</span></td>
              <td className="td" dir="ltr"><span className="font-mono text-[12px]">{u.phone || "—"}</span></td>
              <td className="td text-[12px]">
                {u.roles.map((r) => ROLE_FA[r.name] ?? r.description ?? r.name).join("، ") || "—"}
              </td>
              <td className="td">
                <span className={`rounded-full px-2 py-0.5 text-[11px] ${u.is_active ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
                  {u.is_active ? "فعال" : "غیرفعال"}
                </span>
              </td>
              <td className="td text-[12px] text-ink-2">
                {u.created_at ? new Date(u.created_at).toLocaleDateString("fa-IR") : "—"}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
