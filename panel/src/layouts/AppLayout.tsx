/** Main panel shell — right-side grouped collapsible RTL sidebar + sticky header. */

import { useQuery } from "@tanstack/react-query";
import {
  Bot,
  ChevronDown,
  FileText,
  Inbox as InboxIcon,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  MapPin,
  Menu,
  MessageSquareText,
  Newspaper,
  Phone,
  ScrollText,
  Search,
  Settings,
  Share2,
  Shield,
  Tag,
  Users,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api } from "../services/api";
import { useAuth } from "../stores/auth";
import type { InboxRow, Page } from "../types/api";
import { fmtRelative } from "../components/ui";

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  roles?: string[]; // undefined = any authenticated admin
  badge?: "new";
}

const CONTENT_ROLES = ["super_admin", "admin", "editor"];
const REQUEST_ROLES = ["super_admin", "admin", "support"];

const NAV: { group: string; collapsible?: boolean; items: NavItem[] }[] = [
  { group: "", items: [{ to: "/", label: "داشبورد", icon: <LayoutDashboard size={17} /> }] },
  {
    group: "مدیریت درخواست‌ها",
    collapsible: true,
    items: [
      { to: "/inbox", label: "صندوق ورودی", icon: <InboxIcon size={17} />, roles: REQUEST_ROLES, badge: "new" },
      { to: "/requests/consultations", label: "درخواست‌های مشاوره", icon: <FileText size={17} />, roles: REQUEST_ROLES },
      { to: "/requests/contacts", label: "تماس‌ها", icon: <Phone size={17} />, roles: REQUEST_ROLES },
      { to: "/requests/tickets", label: "تیکت‌ها", icon: <LifeBuoy size={17} />, roles: REQUEST_ROLES },
      { to: "/labels", label: "برچسب‌ها", icon: <Tag size={17} />, roles: REQUEST_ROLES },
      { to: "/ai/conversations", label: "مکالمات مشاور", icon: <MessageSquareText size={17} />, roles: ["super_admin", "admin"] },
    ],
  },
  {
    group: "مدیریت محتوای سایت",
    collapsible: true,
    items: [
      { to: "/content/pages", label: "صفحات سایت", icon: <Newspaper size={17} />, roles: CONTENT_ROLES },
      { to: "/content/articles", label: "مقالات", icon: <ScrollText size={17} />, roles: CONTENT_ROLES },
      { to: "/content/lawyers", label: "وکلا و رزومه‌ها", icon: <Users size={17} />, roles: CONTENT_ROLES },
      { to: "/content/media", label: "تصاویر و رسانه‌ها", icon: <FileText size={17} />, roles: CONTENT_ROLES },
    ],
  },
  {
    group: "تنظیمات سایت",
    collapsible: true,
    items: [
      { to: "/settings/contact", label: "اطلاعات تماس", icon: <Phone size={17} />, roles: CONTENT_ROLES },
      { to: "/settings/address", label: "آدرس و محل فعالیت", icon: <MapPin size={17} />, roles: CONTENT_ROLES },
      { to: "/settings/social", label: "ایمیل و شبکه‌ها", icon: <Share2 size={17} />, roles: CONTENT_ROLES },
      { to: "/settings/general", label: "تنظیمات عمومی", icon: <Settings size={17} />, roles: CONTENT_ROLES },
      { to: "/ai", label: "مشاور هوشمند", icon: <Bot size={17} />, roles: ["super_admin", "admin"] },
    ],
  },
  {
    group: "مدیریت سیستم",
    collapsible: true,
    items: [
      { to: "/users", label: "کاربران و دسترسی‌ها", icon: <Shield size={17} />, roles: ["super_admin"] },
      { to: "/audit", label: "گزارش فعالیت‌ها", icon: <ScrollText size={17} />, roles: ["super_admin", "admin"] },
    ],
  },
];

const CRUMBS: Record<string, string> = {
  "/": "داشبورد",
  "/inbox": "صندوق ورودی",
  "/requests": "درخواست‌ها",
  "/requests/consultation": "مشاوره",
  "/requests/contact": "تماس",
  "/requests/ticket": "تیکت",
  "/requests/consultations": "درخواست‌های مشاوره",
  "/requests/contacts": "تماس‌ها",
  "/requests/tickets": "تیکت‌ها",
  "/labels": "برچسب‌ها",
  "/content": "محتوا",
  "/content/pages": "صفحات سایت",
  "/content/articles": "مقالات",
  "/content/media": "تصاویر و رسانه‌ها",
  "/content/lawyers": "وکلا و رزومه‌ها",
  "/settings": "تنظیمات سایت",
  "/settings/contact": "اطلاعات تماس",
  "/settings/address": "آدرس و محل فعالیت",
  "/settings/social": "ایمیل و شبکه‌ها",
  "/settings/general": "تنظیمات عمومی",
  "/ai": "مشاور هوشمند",
  "/ai/conversations": "مکالمات مشاور",
  "/users": "کاربران و دسترسی‌ها",
  "/audit": "گزارش فعالیت‌ها",
};

function crumbsFor(path: string): { label: string; to: string }[] {
  const parts = path.split("/").filter(Boolean);
  const crumbs = [{ label: "داشبورد", to: "/" }];
  let acc = "";
  for (const p of parts) {
    acc += "/" + p;
    crumbs.push({ label: CRUMBS[acc] ?? "جزئیات", to: acc });
  }
  return crumbs;
}

function NavBadge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="mr-auto rounded-full bg-gold-2 px-1.5 py-px text-[10px] font-semibold text-ink-0">
      {count.toLocaleString("fa-IR")}
    </span>
  );
}

export default function AppLayout() {
  const { user, logout, hasRole } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");
  const location = useLocation();
  const navigate = useNavigate();
  const crumbs = crumbsFor(location.pathname);

  // unread count for the inbox badge — cheap: page 1 of tab=new
  const newCount = useQuery({
    queryKey: ["inbox-new-count"],
    queryFn: () => api.get<Page<InboxRow>>("/admin/inbox?tab=new&page_size=1"),
    refetchInterval: 60_000,
    retry: false,
  });

  const visibleNav = NAV.map((g) => ({
    ...g,
    items: g.items.filter((i) => !i.roles || hasRole(...i.roles)),
  })).filter((g) => g.items.length > 0);

  const sidebar = (
    <aside className="flex h-full w-64 flex-col border-l border-sand-2 bg-sand-1 text-ink-1">
      <div className="flex h-14 items-center gap-2.5 border-b border-sand-2 px-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold-3 font-bold text-gold-1">
          د
        </span>
        <div>
          <p className="text-sm font-semibold text-ink-0">دادنوین</p>
          <p className="text-[11px] text-ink-3">پنل مدیریت</p>
        </div>
        <button
          className="mr-auto text-ink-3 hover:text-ink-0 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-label="بستن منو"
        >
          <X size={18} />
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {visibleNav.map((g) => {
          const isCollapsed = g.collapsible && collapsed[g.group];
          return (
            <div key={g.group || "root"} className="mb-4">
              {g.group ? (
                <button
                  className="nav-group-label w-full"
                  onClick={() => setCollapsed((c) => ({ ...c, [g.group]: !c[g.group] }))}
                  aria-expanded={!isCollapsed}
                >
                  {g.group}
                  <ChevronDown
                    size={13}
                    className={`transition ${isCollapsed ? "-rotate-90" : ""}`}
                  />
                </button>
              ) : null}
              {!isCollapsed &&
                g.items.map((item) => {
                  const to = item.to.split("?")[0];
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={to === "/"}
                      onClick={() => setSidebarOpen(false)}
                      className={({ isActive }) =>
                        `nav-item ${isActive && location.pathname === to ? "nav-item-active" : ""}`
                      }
                    >
                      {item.icon}
                      {item.label}
                      {item.badge === "new" && <NavBadge count={newCount.data?.total ?? 0} />}
                    </NavLink>
                  );
                })}
            </div>
          );
        })}
      </nav>
      <div className="border-t border-sand-2 px-4 py-3 text-[11px] text-ink-3">
        گروه حقوقی دادنوین
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen overflow-hidden">
      {/* desktop sidebar — right side in RTL is first flex child */}
      <div className="hidden shrink-0 lg:block">{sidebar}</div>

      {/* mobile drawer */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink-0/40 backdrop-blur-[2px]" onClick={() => setSidebarOpen(false)} />
          <div className="absolute inset-y-0 right-0">{sidebar}</div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* sticky topbar */}
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-sand-2 bg-sand-1/95 px-4 backdrop-blur lg:px-6">
          <button
            className="text-ink-1 lg:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="باز کردن منو"
          >
            <Menu size={20} />
          </button>

          <nav className="hidden items-center gap-1.5 text-[12px] text-ink-2 sm:flex" aria-label="breadcrumb">
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-ink-3">/</span>}
                {i === crumbs.length - 1 ? (
                  <span className="font-medium text-ink-0">{c.label}</span>
                ) : (
                  <NavLink to={c.to} className="transition hover:text-ink-0">
                    {c.label}
                  </NavLink>
                )}
              </span>
            ))}
          </nav>

          {/* global search → unified inbox */}
          <form
            className="relative mx-2 hidden max-w-xs flex-1 md:block"
            onSubmit={(e) => {
              e.preventDefault();
              if (query.trim()) navigate(`/inbox?q=${encodeURIComponent(query.trim())}`);
            }}
          >
            <Search size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-3" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="جستجوی درخواست، نام، تلفن، کد…"
              className="!py-1.5 pr-9 text-[13px]"
              aria-label="جستجوی سراسری"
            />
          </form>

          <div className="mr-auto flex items-center gap-1">
            {/* notifications */}
            <div className="relative">
              <button
                className="relative rounded-lg p-2 text-ink-1 transition hover:bg-sand-0"
                onClick={() => setNotifOpen((v) => !v)}
                aria-label="اعلان‌ها"
              >
                <InboxIcon size={18} />
                {(newCount.data?.total ?? 0) > 0 && (
                  <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-gold-2" />
                )}
              </button>
              {notifOpen && (
                <div
                  className="card absolute left-0 top-full z-30 mt-1 w-64 p-1.5"
                  onMouseLeave={() => setNotifOpen(false)}
                >
                  <p className="border-b border-sand-2 px-3 py-2 text-[12px] font-medium text-ink-2">
                    درخواست‌های جدید
                  </p>
                  <div className="max-h-64 overflow-y-auto">
                    {(newCount.data?.items ?? []).length === 0 && (
                      <p className="px-3 py-4 text-center text-[12px] text-ink-3">
                        درخواست جدیدی نیست
                      </p>
                    )}
                    {(newCount.data?.items ?? []).map((r) => (
                      <NavLink
                        key={r.id}
                        to={`/requests/${r.type}/${r.id}`}
                        className="block rounded-lg px-3 py-2 hover:bg-sand-0"
                        onClick={() => setNotifOpen(false)}
                      >
                        <p className="text-[13px] font-medium text-ink-0">{r.name}</p>
                        <p className="mt-0.5 flex items-center justify-between text-[11px] text-ink-2">
                          <span>{r.subject}</span>
                          <span>{fmtRelative(r.created_at)}</span>
                        </p>
                      </NavLink>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* user menu */}
            <div className="relative">
              <button
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition hover:bg-sand-0"
                onClick={() => setUserMenu((v) => !v)}
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gold-2 text-[11px] font-semibold text-ink-0">
                  {(user?.full_name || user?.username || "؟").slice(0, 1)}
                </span>
                <span className="hidden text-[13px] font-medium sm:block">
                  {user?.full_name || user?.username}
                </span>
                <ChevronDown size={14} className="text-ink-3" />
              </button>
              {userMenu && (
                <div
                  className="card absolute left-0 top-full z-30 mt-1 w-52 p-1.5"
                  onMouseLeave={() => setUserMenu(false)}
                >
                  <div className="border-b border-sand-2 px-3 py-2">
                    <p className="text-[13px] font-medium">{user?.full_name}</p>
                    <p className="text-[11px] text-ink-2" dir="ltr">{user?.email}</p>
                    <p className="mt-0.5 text-[11px] text-gold-1">
                      {user?.roles.map((r) => r.description || r.name).join("، ")}
                    </p>
                  </div>
                  <button
                    className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-red-600 hover:bg-red-50"
                    onClick={logout}
                  >
                    <LogOut size={15} /> خروج از حساب
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="min-w-0 flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
