/** Shared primitives — toast, badges, skeletons, empty states, dialogs. */

import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Inbox,
  X,
  XCircle,
} from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

// ---------- toast ----------

type ToastKind = "success" | "error" | "info";
interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
}

const ToastCtx = createContext<(kind: ToastKind, text: string) => void>(() => {});

export function useToast() {
  return useContext(ToastCtx);
}

let toastId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((kind: ToastKind, text: string) => {
    const id = ++toastId;
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  const icons = {
    success: <CheckCircle2 size={17} className="text-emerald-600" />,
    error: <XCircle size={17} className="text-red-600" />,
    info: <Info size={17} className="text-ink-1" />,
  };
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-4 left-4 z-50 flex flex-col gap-2" role="status">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="card flex items-center gap-2 px-3.5 py-2.5 text-sm shadow-lg"
          >
            {icons[t.kind]}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ---------- status / priority badges ----------

export const STATUS_FA: Record<string, string> = {
  // shared / consultations
  new: "جدید",
  reviewing: "در حال بررسی",
  awaiting_call: "در انتظار تماس",
  followed_up: "پیگیری‌شده",
  completed: "تکمیل‌شده",
  cancelled: "لغوشده",
  // tickets
  waiting_reply: "در انتظار پاسخ",
  resolved: "حل‌شده",
  closed: "بسته",
  // contacts
  contacted: "تماس گرفته‌شد",
  // priority
  low: "کم",
  normal: "عادی",
  high: "زیاد",
  urgent: "فوری",
  // request types
  consultation: "مشاوره",
  ticket: "تیکت",
  contact: "تماس",
  // delivery
  queued: "در صف",
  sent: "ارسال‌شده",
  failed: "ناموفق",
  // articles
  draft: "پیش‌نویس",
  published: "منتشرشده",
};

const STATUS_TONE: Record<string, string> = {
  new: "bg-sky-50 text-sky-700 border-sky-200",
  reviewing: "bg-amber-50 text-amber-700 border-amber-200",
  awaiting_call: "bg-violet-50 text-violet-700 border-violet-200",
  followed_up: "bg-indigo-50 text-indigo-700 border-indigo-200",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  cancelled: "bg-sand-0 text-ink-2 border-sand-2",
  waiting_reply: "bg-violet-50 text-violet-700 border-violet-200",
  resolved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  closed: "bg-sand-0 text-ink-2 border-sand-2",
  contacted: "bg-teal-50 text-teal-700 border-teal-200",
  urgent: "bg-red-50 text-red-700 border-red-200",
  high: "bg-orange-50 text-orange-700 border-orange-200",
  normal: "bg-sand-0 text-ink-2 border-sand-2",
  low: "bg-sand-0 text-ink-2 border-sand-2",
  consultation: "bg-indigo-50 text-indigo-700 border-indigo-200",
  ticket: "bg-violet-50 text-violet-700 border-violet-200",
  contact: "bg-teal-50 text-teal-700 border-teal-200",
  queued: "bg-sand-0 text-ink-2 border-sand-2",
  sent: "bg-emerald-50 text-emerald-700 border-emerald-200",
  failed: "bg-red-50 text-red-700 border-red-200",
  draft: "bg-sand-0 text-ink-2 border-sand-2",
  published: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

export function StatusBadge({ value }: { value: string }) {
  return (
    <span
      className={`inline-block rounded-full border px-2.5 py-0.5 text-[12px] font-medium ${STATUS_TONE[value] ?? "bg-sand-0 text-ink-2 border-sand-2"}`}
    >
      {STATUS_FA[value] ?? value}
    </span>
  );
}

// ---------- page header ----------

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-ink-0">{title}</h1>
        {subtitle && <p className="mt-1 text-[13px] text-ink-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

// ---------- table ----------

export function Table({
  head,
  children,
}: {
  head: string[];
  children: ReactNode;
}) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-sand-2 text-right">
            {head.map((h) => (
              <th key={h} className="th">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function EmptyState({
  text,
  hint,
  action,
}: {
  text: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center justify-center gap-1.5 px-6 py-14 text-center">
      <Inbox size={24} className="text-ink-3" />
      <p className="text-sm font-medium text-ink-1">{text}</p>
      {hint && <p className="text-[13px] text-ink-2">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <div className="card flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <AlertTriangle size={22} className="text-red-500" />
      <p className="text-sm font-medium text-ink-1">{text}</p>
      {onRetry && (
        <button className="btn-ghost btn-sm mt-1" onClick={onRetry}>
          تلاش مجدد
        </button>
      )}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-sand-2/70 ${className}`} />;
}

export function PageSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

// ---------- confirm dialog ----------

export function ConfirmDialog({
  open,
  title,
  body,
  danger = false,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  body?: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-0/40 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onCancel}
    >
      <div className="card w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-1.5 text-[15px] font-semibold">{title}</h3>
        {body && <p className="mb-4 text-sm leading-6 text-ink-1">{body}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-ghost btn-sm" onClick={onCancel}>
            انصراف
          </button>
          <button
            className={`${danger ? "btn-danger" : "btn-primary"} btn-sm`}
            onClick={onConfirm}
            autoFocus
          >
            تأیید
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- drawer ----------

export function Drawer({
  open,
  onClose,
  title,
  children,
  width = "max-w-md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-ink-0/40 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className={`absolute inset-y-0 left-0 flex w-full ${width} flex-col border-e border-sand-2 bg-sand-1 shadow-xl`}
      >
        <div className="flex items-center justify-between border-b border-sand-2 px-5 py-4">
          <h3 className="text-[15px] font-semibold">{title}</h3>
          <button className="text-ink-2 hover:text-ink-0" onClick={onClose} aria-label="بستن">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

// ---------- tabs ----------

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: string; label: string; count?: number }[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="flex border-b border-sand-2" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={active === t.key}
          className={`tab ${active === t.key ? "tab-active" : ""}`}
          onClick={() => onChange(t.key)}
        >
          {t.label}
          {t.count !== undefined && (
            <span className="mr-1 text-[11px] text-ink-3">({t.count.toLocaleString("fa-IR")})</span>
          )}
        </button>
      ))}
    </div>
  );
}

// ---------- timeline ----------

export function Timeline({ children }: { children: ReactNode }) {
  return <div className="pt-1">{children}</div>;
}

export function TimelineItem({
  color = "bg-ink-3",
  title,
  time,
  children,
}: {
  color?: string;
  title: ReactNode;
  time?: string;
  children?: ReactNode;
}) {
  return (
    <div className="tl-item">
      <span className={`tl-dot ${color}`} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[13px] font-medium text-ink-0">{title}</p>
          {time && <p className="text-[11px] text-ink-3">{time}</p>}
        </div>
        {children && <div className="mt-1 text-[13px] leading-6 text-ink-1">{children}</div>}
      </div>
    </div>
  );
}

// ---------- description list ----------

export function DescriptionList({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map((it) => (
        <div key={it.label}>
          <dt className="text-[11px] text-ink-2">{it.label}</dt>
          <dd className="mt-0.5 text-[13px] font-medium text-ink-0">
            {it.value || <span className="font-normal text-ink-3">ثبت نشده</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

// ---------- misc ----------

export function fmtDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("fa-IR", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function fmtRelative(iso: string) {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.round(diff / 60000);
    if (mins < 1) return "همین حالا";
    if (mins < 60) return `${mins.toLocaleString("fa-IR")} دقیقه پیش`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours.toLocaleString("fa-IR")} ساعت پیش`;
    const days = Math.round(hours / 24);
    if (days < 30) return `${days.toLocaleString("fa-IR")} روز پیش`;
    return fmtDate(iso);
  } catch {
    return iso;
  }
}

export function Pagination({
  page,
  total,
  pageSize,
  onPage,
}: {
  page: number;
  total: number;
  pageSize: number;
  onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="mt-3 flex items-center justify-center gap-2 text-sm">
      <button className="btn-ghost btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        قبلی
      </button>
      <span className="text-ink-2">
        صفحه {page.toLocaleString("fa-IR")} از {pages.toLocaleString("fa-IR")}
      </span>
      <button
        className="btn-ghost btn-sm"
        disabled={page >= pages}
        onClick={() => onPage(page + 1)}
      >
        بعدی
      </button>
    </div>
  );
}

export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label>{label}</label>
      {children}
      {hint && !error && <p className="mt-1 text-[11px] text-ink-3">{hint}</p>}
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}
