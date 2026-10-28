import { useQuery } from "@tanstack/react-query";
import {
  Bot,
  FileText,
  LifeBuoy,
  Scale,
  Users,
} from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../services/api";
import type { DashboardOverview } from "../types/api";
import { PageSkeleton, StatusBadge, fmtDate } from "../components/ui";
import { useAuth } from "../stores/auth";

const CARDS = [
  { key: "consultations_new", label: "درخواست مشاورهٔ جدید", icon: FileText, to: "/consultations?status=new" },
  { key: "consultations_total", label: "کل درخواست‌های مشاوره", icon: FileText, to: "/consultations" },
  { key: "tickets_open", label: "تیکت‌های باز", icon: LifeBuoy, to: "/tickets?status=open" },
  { key: "lawyers_visible", label: "وکیل فعال", icon: Scale, to: "/lawyers" },
  { key: "users_active", label: "کاربر فعال", icon: Users, to: "/users" },
  { key: "ai_conversations", label: "گفتگوی هوش مصنوعی", icon: Bot, to: "/ai/conversations" },
] as const;

export default function DashboardPage() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.get<DashboardOverview>("/admin/dashboard/overview"),
  });

  if (isLoading || !data) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">
          سلام{user?.full_name ? ` ${user.full_name}` : ""}، خوش آمدید
        </h1>
        <p className="mt-0.5 text-[13px] text-ink-1/60">
          نمای کلی وضعیت سایت و درخواست‌ها
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {CARDS.map(({ key, label, icon: Icon, to }) => (
          <Link
            key={key}
            to={to}
            className="card group p-4 transition hover:border-gold-1/50"
          >
            <Icon size={18} className="text-gold-1" />
            <p className="mt-3 text-2xl font-semibold tabular-nums">
              {data.stats[key].toLocaleString("fa-IR")}
            </p>
            <p className="mt-1 text-[12px] text-ink-1/60 group-hover:text-ink-1">
              {label}
            </p>
          </Link>
        ))}
      </div>

      <div className="card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold">آخرین درخواست‌های مشاوره</h2>
          <Link to="/requests/consultations" className="text-[13px] text-gold-1 hover:underline">
            مشاهده همه
          </Link>
        </div>
        {data.recent_consultations.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-ink-1/50">
            هنوز درخواستی ثبت نشده است.
          </p>
        ) : (
          <ul className="divide-y divide-sand-2">
            {data.recent_consultations.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-2.5 text-sm">
                <span className="font-medium">{r.name}</span>
                <span className="text-[12px] text-ink-1/50" dir="ltr">
                  {r.subject || "—"}
                </span>
                <span className="mr-auto"><StatusBadge value={r.status} /></span>
                <span className="text-[12px] text-ink-1/50">{fmtDate(r.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
