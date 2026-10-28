/** Shared primitives — toast, badges, skeletons, empty states, confirm dialog. */

import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
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
    success: <CheckCircle2 size={17} className="text-emerald-400" />,
    error: <XCircle size={17} className="text-red-400" />,
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

// ---------- badges ----------

const STATUS_FA: Record<string, string> = {
  new: "جدید",
  reviewing: "در حال بررسی",
  awaiting_reply: "در انتظار پاسخ",
  done: "تکمیل‌شده",
  cancelled: "لغوشده",
  open: "باز",
  in_progress: "در حال رسیدگی",
  waiting_customer: "در انتظار مشتری",
  resolved: "حل‌شده",
  closed: "بسته",
  low: "کم",
  normal: "عادی",
  high: "زیاد",
  urgent: "فوری",
};

const STATUS_TONE: Record<string, string> = {
  new: "bg-sky-500/10 text-sky-400 border-sky-500/30",
  reviewing: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  awaiting_reply: "bg-violet-50 text-violet-700 border-violet-200",
  done: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  cancelled: "bg-sand-1 text-ink-1 border-sand-2",
  open: "bg-sky-500/10 text-sky-400 border-sky-500/30",
  in_progress: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  waiting_customer: "bg-violet-50 text-violet-700 border-violet-200",
  resolved: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  closed: "bg-sand-1 text-ink-1 border-sand-2",
  urgent: "bg-red-500/10 text-red-400 border-red-500/30",
  high: "bg-orange-50 text-orange-700 border-orange-200",
};

export function StatusBadge({ value }: { value: string }) {
  return (
    <span
      className={`inline-block rounded-full border px-2.5 py-0.5 text-[12px] font-medium ${STATUS_TONE[value] ?? "bg-sand-1 text-ink-1 border-sand-2"}`}
    >
      {STATUS_FA[value] ?? value}
    </span>
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
          <tr className="border-b border-sand-2 text-right text-[12px] font-medium text-ink-1/70">
            {head.map((h) => (
              <th key={h} className="px-4 py-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-sand-2">{children}</tbody>
      </table>
    </div>
  );
}

export function EmptyState({ text, hint }: { text: string; hint?: string }) {
  return (
    <div className="card flex flex-col items-center justify-center gap-1.5 px-6 py-14 text-center">
      <AlertTriangle size={22} className="text-ink-3" />
      <p className="text-sm font-medium text-ink-1">{text}</p>
      {hint && <p className="text-[13px] text-ink-1/60">{hint}</p>}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-lg bg-sand-1 ${className}`} />
  );
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
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="card w-full max-w-sm p-5">
        <h3 className="mb-1.5 text-[15px] font-semibold">{title}</h3>
        {body && <p className="mb-4 text-sm text-ink-1/80">{body}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-ghost btn-sm" onClick={onCancel}>
            انصراف
          </button>
          <button
            className={`${danger ? "btn-danger" : "btn-primary"} btn-sm`}
            onClick={onConfirm}
          >
            تأیید
          </button>
        </div>
      </div>
    </div>
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
      <button
        className="btn-ghost btn-sm"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        قبلی
      </button>
      <span className="text-ink-1/70">
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
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label>{label}</label>
      {children}
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}
