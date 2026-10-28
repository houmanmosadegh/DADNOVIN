/** Operations dashboard — real KPIs, attention queues, trends, activity. */

import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  FileText,
  LifeBuoy,
  Phone,
  Timer,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../services/api";
import type { DashboardOverview, TrendsOut } from "../types/api";
import {
  EmptyState,
  fmtRelative,
  PageSkeleton,
  StatusBadge,
} from "../components/ui";
import { useAuth } from "../stores/auth";

const KPI: {
  key: keyof DashboardOverview["stats"];
  label: string;
  to: string;
  icon: typeof FileText;
  accent?: boolean;
}[] = [
  { key: "consultations_total", label: "کل درخواست‌های مشاوره", to: "/requests/consultations", icon: FileText },
  { key: "consultations_new", label: "مشاورهٔ جدید", to: "/requests/consultations?tab=new", icon: FileText, accent: true },
  { key: "contacts_unanswered", label: "تماس بی‌پاسخ", to: "/requests/contacts?tab=new", icon: Phone, accent: true },
  { key: "tickets_open", label: "تیکت باز", to: "/requests/tickets", icon: LifeBuoy },
  { key: "awaiting_followup", label: "در انتظار پیگیری", to: "/inbox?tab=unanswered", icon: Timer },
  { key: "consultations_completed", label: "مشاورهٔ تکمیل‌شده", to: "/requests/consultations?status=completed", icon: FileText },
];

const EVENT_FA: Record<string, string> = {
  created: "درخواست جدید",
  status_change: "تغییر وضعیت",
  assigned: "ارجاع",
  unassigned: "لغو ارجاع",
  reply_sent: "ارسال پاسخ",
  customer_reply: "پاسخ مشتری",
  call_logged: "تماس تلفنی",
  labels_updated: "برچسب",
};

const TYPE_FA: Record<string, string> = {
  consultation: "مشاوره",
  ticket: "تیکت",
  contact: "تماس",
};

const QUICK = [
  { label: "مشاوره‌های جدید", to: "/requests/consultations?tab=new" },
  { label: "تیکت‌های باز", to: "/requests/tickets" },
  { label: "افزودن وکیل", to: "/content/lawyers/new" },
  { label: "ویرایش اطلاعات تماس", to: "/settings/contact" },
  { label: "ویرایش دربارهٔ ما", to: "/content/pages/about" },
  { label: "مقالهٔ جدید", to: "/content/articles" },
];

export default function DashboardPage() {
  const { user } = useAuth();
  const [days, setDays] = useState(30);

  const overview = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.get<DashboardOverview>("/admin/dashboard/overview"),
  });
  const trends = useQuery({
    queryKey: ["trends", days],
    queryFn: () => api.get<TrendsOut>(`/admin/dashboard/trends?days=${days}`),
  });

  if (overview.isLoading || !overview.data) return <PageSkeleton />;
  const d = overview.data;
  const s = d.stats;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold">
          سلام{user?.full_name ? ` ${user.full_name}` : ""}، خوش آمدید
        </h1>
        <p className="mt-0.5 text-[13px] text-ink-2">
          نمای کلی وضعیت سایت و درخواست‌ها
          {s.avg_first_response_hours != null && (
            <span className="mr-2 text-ink-3">
              · میانگین اولین پاسخ: {s.avg_first_response_hours.toLocaleString("fa-IR")} ساعت
            </span>
          )}
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {KPI.map(({ key, label, to, icon: Icon, accent }) => (
          <Link key={key} to={to} className="card group p-4 transition hover:border-gold-1/50">
            <div className="flex items-center justify-between">
              <Icon size={17} className="text-gold-1" />
              {accent && Number(s[key]) > 0 && (
                <span className="h-2 w-2 rounded-full bg-gold-2" />
              )}
            </div>
            <p className="mt-3 text-2xl font-semibold tabular-nums">
              {Number(s[key]).toLocaleString("fa-IR")}
            </p>
            <p className="mt-1 text-[12px] text-ink-2 group-hover:text-ink-1">{label}</p>
          </Link>
        ))}
      </div>

      {(s.overdue > 0 || s.mine_open > 0) && (
        <div className="card flex flex-wrap items-center gap-3 border-amber-500/30 bg-amber-500/10 px-4 py-3 text-[13px]">
          {s.overdue > 0 && (
            <Link to="/inbox?tab=overdue" className="font-medium text-amber-200 hover:underline">
              {s.overdue.toLocaleString("fa-IR")} درخواست معوق از مهلت پاسخ گذشته ←
            </Link>
          )}
          {s.mine_open > 0 && (
            <Link to="/inbox?tab=mine" className="text-amber-300 hover:underline">
              {s.mine_open.toLocaleString("fa-IR")} پروندهٔ باز به نام شما ←
            </Link>
          )}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-2">
        {/* A. recent consultations */}
        <section className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold">آخرین درخواست‌های مشاوره</h2>
            <Link to="/requests/consultations" className="text-[13px] text-gold-1 hover:underline">
              مشاهده همه
            </Link>
          </div>
          {d.recent_consultations.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-ink-3">هنوز درخواستی ثبت نشده است.</p>
          ) : (
            <ul className="divide-y divide-sand-2">
              {d.recent_consultations.map((r) => (
                <li key={r.id}>
                  <Link to={`/requests/consultation/${r.id}`} className="flex items-center gap-3 py-2.5 text-sm transition hover:bg-sand-0/60">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{r.name}</p>
                      <p className="mt-0.5 truncate text-[11px] text-ink-3" dir="ltr">
                        {r.phone} · {r.tracking_code}
                      </p>
                    </div>
                    <span className="max-w-32 truncate text-[12px] text-ink-2">{r.subject || "—"}</span>
                    <StatusBadge value={r.status} />
                    <span className="text-[11px] text-ink-3">{fmtRelative(r.created_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* B. tickets needing attention */}
        <section className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold">تیکت‌های نیازمند توجه</h2>
            <Link to="/requests/tickets" className="text-[13px] text-gold-1 hover:underline">
              مشاهده همه
            </Link>
          </div>
          {d.attention_tickets.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-ink-3">تیکت بازی نیست.</p>
          ) : (
            <ul className="divide-y divide-sand-2">
              {d.attention_tickets.map((t) => (
                <li key={t.id}>
                  <Link to={`/requests/ticket/${t.id}`} className="flex items-center gap-3 py-2.5 text-sm transition hover:bg-sand-0/60">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{t.subject}</p>
                      <p className="mt-0.5 truncate text-[11px] text-ink-3">
                        {t.client} · <span dir="ltr">{t.ticket_number}</span>
                      </p>
                    </div>
                    <StatusBadge value={t.priority} />
                    <StatusBadge value={t.status} />
                    <span className="text-[11px] text-ink-3">{fmtRelative(t.updated_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* C. recent contacts */}
        <section className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold">آخرین درخواست‌های تماس</h2>
            <Link to="/requests/contacts" className="text-[13px] text-gold-1 hover:underline">
              مشاهده همه
            </Link>
          </div>
          {d.recent_contacts.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-ink-3">درخواست تماسی نیست.</p>
          ) : (
            <ul className="divide-y divide-sand-2">
              {d.recent_contacts.map((c) => (
                <li key={c.id}>
                  <Link to={`/requests/contact/${c.id}`} className="flex items-center gap-3 py-2.5 text-sm transition hover:bg-sand-0/60">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{c.name}</p>
                      <p className="mt-0.5 text-[11px] text-ink-3" dir="ltr">{c.phone}</p>
                    </div>
                    <StatusBadge value={c.status} />
                    <span className="text-[11px] text-ink-3">{fmtRelative(c.created_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* D. trends */}
        <section className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold">روند درخواست‌ها</h2>
            <div className="flex gap-1">
              {[7, 30, 90].map((n) => (
                <button
                  key={n}
                  className={`chip !px-2.5 !py-1 text-[12px] ${days === n ? "chip-active" : ""}`}
                  onClick={() => setDays(n)}
                >
                  {n.toLocaleString("fa-IR")} روز
                </button>
              ))}
            </div>
          </div>
          {trends.data ? <TrendChart data={trends.data} /> : <div className="h-36 animate-pulse rounded-lg bg-sand-0" />}
        </section>

        {/* E. activity */}
        <section className="card p-5">
          <h2 className="mb-4 text-[15px] font-semibold">فعالیت عملیاتی</h2>
          {d.activity.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-ink-3">رویدادی ثبت نشده است.</p>
          ) : (
            <ul className="space-y-2.5">
              {d.activity.slice(0, 10).map((a, i) => (
                <li key={i} className="flex items-center gap-2.5 text-[13px]">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold-2" />
                  <span className="text-ink-2">{EVENT_FA[a.event] ?? a.event}</span>
                  <Link
                    to={`/requests/${a.type}/${a.request_id}`}
                    className="truncate text-ink-1 hover:text-gold-1"
                  >
                    {TYPE_FA[a.type] ?? a.type}
                  </Link>
                  {a.actor && <span className="text-[11px] text-ink-3">({a.actor})</span>}
                  <span className="mr-auto shrink-0 text-[11px] text-ink-3">{fmtRelative(a.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* F. quick actions */}
        <section className="card p-5">
          <h2 className="mb-4 text-[15px] font-semibold">اقدام سریع</h2>
          <div className="grid grid-cols-2 gap-2">
            {QUICK.map((q) => (
              <Link
                key={q.to}
                to={q.to}
                className="flex items-center justify-between rounded-lg border border-sand-2 px-3.5 py-2.5 text-[13px] font-medium text-ink-1 transition hover:border-gold-2 hover:text-ink-0"
              >
                {q.label}
                <ArrowLeft size={14} className="text-ink-3" />
              </Link>
            ))}
          </div>
          <div className="mt-4 border-t border-sand-2 pt-3 text-[12px] text-ink-3">
            <p>وکیل فعال: {s.lawyers_visible.toLocaleString("fa-IR")} · کاربر: {s.users_active.toLocaleString("fa-IR")} · گفت‌وگوی هوش مصنوعی: {s.ai_conversations.toLocaleString("fa-IR")}</p>
          </div>
        </section>
      </div>
    </div>
  );
}

/** Stacked daily bar chart — consultation/contact/ticket volumes. */
function TrendChart({ data }: { data: TrendsOut }) {
  const series = useMemo(() => {
    const out: { date: string; c: number; t: number; k: number }[] = [];
    const end = new Date();
    for (let i = data.days - 1; i >= 0; i--) {
      const d = new Date(end);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      out.push({
        date: key,
        c: data.series.consultation?.[key] ?? 0,
        t: data.series.ticket?.[key] ?? 0,
        k: data.series.contact?.[key] ?? 0,
      });
    }
    return out;
  }, [data]);

  const max = Math.max(1, ...series.map((d) => d.c + d.t + d.k));
  const total = series.reduce((a, d) => a + d.c + d.t + d.k, 0);

  if (total === 0) {
    return <EmptyState text="در این بازه درخواستی نبوده است" />;
  }

  // thin bars: cap displayed buckets so bars stay readable on 90 days
  const step = Math.ceil(series.length / 45);
  const buckets = series.filter((_, i) => i % step === 0 || i === series.length - 1);

  return (
    <div>
      <div className="flex h-36 items-end gap-[3px]" role="img" aria-label="نمودار روند درخواست‌ها">
        {buckets.map((d) => {
          const sum = d.c + d.t + d.k;
          const h = (sum / max) * 100;
          return (
            <div
              key={d.date}
              className="group relative flex-1 rounded-t-sm bg-gold-2/80 transition hover:bg-gold-1"
              style={{ height: `${Math.max(h, 2)}%` }}
              title={`${d.date} — مشاوره ${d.c}، تماس ${d.k}، تیکت ${d.t}`}
            />
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-4 text-[11px] text-ink-2">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-gold-2" /> مجموع: {total.toLocaleString("fa-IR")}</span>
        <span className="mr-auto">
          {buckets[0] && new Intl.DateTimeFormat("fa-IR", { month: "short", day: "numeric" }).format(new Date(buckets[0].date))}
          {" تا "}
          {buckets[buckets.length - 1] && new Intl.DateTimeFormat("fa-IR", { month: "short", day: "numeric" }).format(new Date(buckets[buckets.length - 1].date))}
        </span>
      </div>
    </div>
  );
}
