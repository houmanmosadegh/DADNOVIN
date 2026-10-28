/** Main panel shell — right-side RTL sidebar, topbar, breadcrumbs. */

import {
  Bot,
  ChevronDown,
  FileText,
  FolderKanban,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Menu,
  MessageSquareText,
  Newspaper,
  ScrollText,
  Settings,
  Users,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../stores/auth";

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  roles?: string[]; // undefined = any authenticated admin
}

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "نمای کلی",
    items: [
      { to: "/", label: "داشبورد", icon: <LayoutDashboard size={17} /> },
    ],
  },
  {
    group: "مدیریت صفحات",
    items: [
      { to: "/pages", label: "صفحات سایت", icon: <Newspaper size={17} />, roles: ["super_admin", "admin", "editor"] },
      { to: "/media", label: "تصاویر و رسانه‌ها", icon: <FolderKanban size={17} />, roles: ["super_admin", "admin", "editor"] },
      { to: "/lawyers", label: "مدیریت وکلا", icon: <Users size={17} />, roles: ["super_admin", "admin", "editor"] },
    ],
  },
  {
    group: "درخواست‌ها",
    items: [
      { to: "/consultations", label: "فرم‌های مشاوره", icon: <FileText size={17} />, roles: ["super_admin", "admin", "support"] },
      { to: "/tickets", label: "تیکت‌ها", icon: <LifeBuoy size={17} />, roles: ["super_admin", "admin", "support"] },
      { to: "/ai/conversations", label: "مکالمات مشاور", icon: <MessageSquareText size={17} /> },
    ],
  },
  {
    group: "تنظیمات",
    items: [
      { to: "/settings", label: "تنظیمات سایت", icon: <Settings size={17} />, roles: ["super_admin", "admin", "editor"] },
      { to: "/ai", label: "مشاور هوشمند", icon: <Bot size={17} /> },
    ],
  },
  {
    group: "مدیریت سیستم",
    items: [
      { to: "/users", label: "کاربران و دسترسی", icon: <Users size={17} />, roles: ["super_admin"] },
      { to: "/audit", label: "گزارش فعالیت‌ها", icon: <ScrollText size={17} />, roles: ["super_admin", "admin"] },
    ],
  },
];

const CRUMBS: Record<string, string> = {
  "/": "داشبورد",
  "/pages": "مدیریت صفحات",
  "/media": "تصاویر و رسانه‌ها",
  "/lawyers": "مدیریت وکلا",
  "/consultations": "فرم‌های مشاوره",
  "/tickets": "تیکت‌ها",
  "/settings": "تنظیمات سایت",
  "/ai": "مشاور هوشمند",
  "/ai/conversations": "مکالمات مشاور",
  "/users": "کاربران",
  "/audit": "گزارش فعالیت‌ها",
};

function breadcrumb(path: string): string[] {
  const parts = path.split("/").filter(Boolean);
  const crumbs = [CRUMBS["/"] ?? "داشبورد"];
  let acc = "";
  for (const p of parts) {
    acc += "/" + p;
    if (CRUMBS[acc]) crumbs.push(CRUMBS[acc]);
    else crumbs.push("جزئیات");
  }
  return crumbs;
}

export default function AppLayout() {
  const { user, logout, hasRole } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const location = useLocation();
  const crumbs = breadcrumb(location.pathname);

  const visibleNav = NAV.map((g) => ({
    ...g,
    items: g.items.filter((i) => !i.roles || hasRole(...i.roles)),
  })).filter((g) => g.items.length > 0);

  const sidebar = (
    <aside className="flex h-full w-64 flex-col bg-sand-1 text-ink-1">
      <div className="flex items-center gap-2.5 border-b border-sand-2 px-5 py-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold-1/15 font-bold text-gold-2">
          د
        </span>
        <div>
          <p className="text-sm font-semibold text-white">دادنوین</p>
          <p className="text-[11px] text-ink-1/50">پنل مدیریت</p>
        </div>
        <button
          className="mr-auto text-ink-1/60 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-label="بستن منو"
        >
          <X size={18} />
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {visibleNav.map((g) => (
          <div key={g.group} className="mb-4">
            <p className="mb-1.5 px-2 text-[10px] font-semibold tracking-wide text-ink-1/40">
              {g.group}
            </p>
            {g.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  `mb-0.5 flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition ${
                    isActive
                      ? "bg-gold-1/15 font-medium text-gold-2"
                      : "text-ink-1/60 hover:bg-sand-2 hover:text-ink-0"
                  }`
                }
              >
                {item.icon}
                {item.label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="border-t border-sand-2 px-4 py-3 text-[11px] text-ink-1/40">
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
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="absolute inset-y-0 right-0">{sidebar}</div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* topbar */}
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-sand-2 bg-sand-1 px-4 lg:px-6">
          <button
            className="text-ink-1 lg:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="باز کردن منو"
          >
            <Menu size={20} />
          </button>
          <nav className="flex items-center gap-1.5 text-[12px] text-ink-1/60" aria-label="breadcrumb">
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-ink-3">/</span>}
                <span className={i === crumbs.length - 1 ? "font-medium text-ink-0" : ""}>
                  {c}
                </span>
              </span>
            ))}
          </nav>

          <div className="mr-auto relative">
            <button
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-sand-2"
              onClick={() => setUserMenu((v) => !v)}
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gold-2 text-[11px] font-semibold text-sand-0">
                {(user?.full_name || user?.email || "؟").slice(0, 1)}
              </span>
              <span className="hidden text-[13px] font-medium sm:block">
                {user?.full_name || user?.email}
              </span>
              <ChevronDown size={14} className="text-ink-1/50" />
            </button>
            {userMenu && (
              <div className="card absolute left-0 top-full z-30 mt-1 w-52 p-1.5" onMouseLeave={() => setUserMenu(false)}>
                <div className="border-b border-sand-1 px-3 py-2">
                  <p className="text-[13px] font-medium">{user?.full_name}</p>
                  <p className="text-[11px] text-ink-1/60" dir="ltr">{user?.email}</p>
                  <p className="mt-0.5 text-[11px] text-gold-1">
                    {user?.roles.map((r) => r.name).join("، ")}
                  </p>
                </div>
                <button
                  className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-red-400 hover:bg-red-500/10"
                  onClick={logout}
                >
                  <LogOut size={15} /> خروج از حساب
                </button>
              </div>
            )}
          </div>
        </header>

        <main className="min-w-0 flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
