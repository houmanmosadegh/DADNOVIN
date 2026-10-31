/** Unified request detail — thread, timeline, reply composer, side actions. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Mail, Phone, RefreshCw, Send, StickyNote } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../services/api";
import {
  DescriptionList,
  ErrorState,
  fmtDate,
  PageSkeleton,
  StatusBadge,
  STATUS_FA,
  Timeline,
  TimelineItem,
  useToast,
} from "../components/ui";
import type { AssigneeOut, LabelOut, RequestDetail } from "../types/api";

const TYPE_FA: Record<string, string> = {
  consultation: "درخواست مشاوره",
  contact: "درخواست تماس",
  ticket: "تیکت",
};

const EVENT_FA: Record<string, string> = {
  created: "ثبت درخواست",
  status_change: "تغییر وضعیت",
  assigned: "ارجاع",
  unassigned: "لغو ارجاع",
  reply_sent: "ارسال پاسخ",
  customer_reply: "پاسخ مشتری",
  call_logged: "تماس تلفنی",
  labels_updated: "به‌روزرسانی برچسب",
  referred: "ارجاع بازاریابی",
  referral_blocked: "ارجاع مسدودشده",
  fee_received: "دریافت حق‌الوکاله",
  commission_reversed: "برگشت کمیسیون",
};

/** events that duplicate an already-rendered thread item — hidden in UI */
const SILENT_EVENTS = new Set(["ai_reply", "reply_sent", "customer_reply"]);

const TEMPLATES: { label: string; body: string }[] = [
  {
    label: "تأیید دریافت",
    body: "سلام، درخواست شما دریافت شد و در حال بررسی است. در اولین فرصت نتیجه را اطلاع می‌دهیم.",
  },
  {
    label: "درخواست مدارک",
    body: "سلام، برای بررسی دقیق‌تر پرونده لطفاً مدارک مرتبط (سند، قرارداد، نامه‌ها) را از طریق همین صفحه ارسال کنید.",
  },
  {
    label: "تعیین جلسه",
    body: "سلام، پرونده شما بررسی شد. برای جلسهٔ مشاوره لطفاً با دفتر تماس بگیرید تا زمان مناسب هماهنگ شود.",
  },
  {
    label: "پاسخ نهایی",
    body: "سلام، بررسی پرونده شما به پایان رسید. خلاصهٔ نظریه: لطفاً برای جزئیات بیشتر با دفتر در تماس باشید.",
  },
];

const CHANNELS = [
  { key: "track", label: "صفحهٔ پیگیری" },
  { key: "email", label: "ایمیل" },
  { key: "sms", label: "پیامک" },
];

export default function RequestDetailPage() {
  const { type = "", id = "" } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();

  const detail = useQuery({
    queryKey: ["request", type, id],
    queryFn: () => api.get<RequestDetail>(`/admin/requests/${type}/${id}`),
    retry: false,
  });

  const labels = useQuery({
    queryKey: ["labels"],
    queryFn: () => api.get<LabelOut[]>("/admin/labels"),
  });

  const assignees = useQuery({
    queryKey: ["assignees"],
    queryFn: () => api.get<AssigneeOut[]>("/admin/assignees"),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["request", type, id] });
    qc.invalidateQueries({ queryKey: ["inbox"] });
    qc.invalidateQueries({ queryKey: ["inbox-new-count"] });
  };

  // ---------- mutations ----------

  const send = useMutation({
    mutationFn: (p: { body: string; is_note: boolean; channels: string[]; attachment_ids: string[] }) =>
      api.post(`/admin/requests/${type}/${id}/messages`, p),
    onSuccess: (_, p) => {
      toast("success", p.is_note ? "یادداشت ثبت شد." : "پاسخ ثبت و ارسال شد.");
      setBody("");
      setAttachments([]);
      invalidate();
    },
    onError: (e) => toast("error", e instanceof ApiError ? e.message : "خطا در ثبت"),
  });

  const setStatus = useMutation({
    mutationFn: (p: { status: string; reason?: string }) => api.post(`/admin/requests/${type}/${id}/status`, p),
    onSuccess: () => {
      toast("success", "وضعیت به‌روز شد.");
      invalidate();
    },
    onError: (e) => toast("error", e instanceof ApiError ? e.message : "انتقال نامعتبر"),
  });

  const patch = useMutation({
    mutationFn: (p: Record<string, unknown>) => api.patch(`/admin/requests/${type}/${id}`, p),
    onSuccess: () => invalidate(),
    onError: (e) => toast("error", e instanceof ApiError ? e.message : "خطا در ویرایش"),
  });

  const receipts = useQuery<{
    fee_amount: number | null;
    receipts: { id: string; amount: number; note: string; created_at: string }[];
    commissions: {
      id: string;
      entry_type: string;
      basis_amount: number;
      rate: number;
      amount: number;
      status: string;
      created_at: string;
    }[];
  }>({
    queryKey: ["fee-receipts", id],
    queryFn: () => api.get(`/admin/requests/consultation/${id}/fee-receipts`),
    enabled: type === "consultation",
  });

  const [feeAmount, setFeeAmount] = useState("");
  const [feeNote, setFeeNote] = useState("");
  const addReceipt = useMutation({
    mutationFn: (p: { amount: number; note: string }) =>
      api.post<{ commission_id: string | null; commission_amount: number }>(
        `/admin/requests/consultation/${id}/fee-receipts`,
        p
      ),
    onSuccess: (r: { commission_id: string | null; commission_amount: number }) => {
      toast(
        "success",
        r.commission_id
          ? `رسید ثبت شد — کمیسیون ${r.commission_amount.toLocaleString("fa-IR")} تومان ایجاد شد.`
          : "رسید ثبت شد (بدون ارجاع — کمیسیونی ساخته نشد)."
      );
      setFeeAmount("");
      setFeeNote("");
      qc.invalidateQueries({ queryKey: ["fee-receipts", id] });
      invalidate();
    },
    onError: (e) => toast("error", e instanceof ApiError ? e.message : "خطا در ثبت رسید"),
  });

  const callLog = useMutation({
    mutationFn: (p: { outcome: string; note: string }) => api.post(`/admin/requests/${type}/${id}/call-log`, p),
    onSuccess: () => {
      toast("success", "تماس ثبت شد.");
      setCallNote("");
      invalidate();
    },
    onError: (e) => toast("error", e instanceof ApiError ? e.message : "خطا در ثبت تماس"),
  });

  const retry = useMutation({
    mutationFn: (deliveryId: string) => api.post(`/admin/deliveries/${deliveryId}/retry`),
    onSuccess: () => {
      toast("info", "تلاش مجدد انجام شد.");
      invalidate();
    },
    onError: (e) => toast("error", e instanceof ApiError ? e.message : "خطا"),
  });

  // ---------- composer state ----------

  const [composerTab, setComposerTab] = useState<"reply" | "note">("reply");
  const [body, setBody] = useState("");
  const [channels, setChannels] = useState<string[]>(["track"]);
  const [attachments, setAttachments] = useState<string[]>([]);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = taRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 220) + "px";
    }
  }, [body]);

  const [callNote, setCallNote] = useState("");

  const uploadAttachment = async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    try {
      const m = await api.upload<{ id: string }>("/admin/media", form);
      setAttachments((a) => [...a, m.id]);
      toast("success", "پیوست بارگذاری شد.");
    } catch (e) {
      toast("error", e instanceof ApiError ? e.message : "بارگذاری ناموفق");
    }
  };

  // ---------- merged timeline ----------

  const timeline = useMemo(() => {
    if (!detail.data) return [];
    const items: { at: string; node: JSX.Element; sortKey: number }[] = [];
    for (const m of detail.data.messages) {
      items.push({
        at: m.created_at,
        sortKey: 1,
        node: (
          <TimelineItem
            key={`m-${m.id}`}
            color={
              m.is_note
                ? "bg-amber-300"
                : m.sender_type === "staff"
                  ? "bg-gold-2"
                  : m.sender_type === "assistant"
                    ? "bg-violet-400"
                    : "bg-sky-400"
            }
            title={
              m.is_note
                ? "یادداشت داخلی"
                : m.sender_type === "staff"
                  ? "پاسخ کارشناس"
                  : m.sender_type === "assistant"
                    ? "پاسخ خودکار سیستم"
                    : "پیام مشتری"
            }
            time={fmtDate(m.created_at)}
          >
            <p className="whitespace-pre-wrap">{m.body}</p>
          </TimelineItem>
        ),
      });
    }
    for (const e of detail.data.events) {
      if (SILENT_EVENTS.has(e.event_type)) continue;
      const label = EVENT_FA[e.event_type] ?? "رویداد";
      const extra =
        e.event_type === "status_change"
          ? `${STATUS_FA[String(e.payload?.from)] ?? e.payload?.from} ← ${STATUS_FA[String(e.payload?.to)] ?? e.payload?.to}${e.payload?.reason ? ` — ${e.payload.reason}` : ""}`
          : e.event_type === "assigned"
            ? `به ${String(e.payload?.to ?? "")}`
            : e.event_type === "call_logged"
              ? `${String(e.payload?.outcome ?? "")}${e.payload?.note ? " — " + e.payload.note : ""}`
              : "";
      items.push({
        at: e.created_at,
        sortKey: 0,
        node: (
          <TimelineItem
            key={`e-${e.id}`}
            color="bg-sand-2"
            title={
              <>
                {label}
                {e.actor_username && (
                  <span className="mr-1 text-[11px] font-normal text-ink-3">({e.actor_username})</span>
                )}
              </>
            }
            time={fmtDate(e.created_at)}
          >
            {extra && <p className="text-ink-2">{extra}</p>}
          </TimelineItem>
        ),
      });
    }
    return items.sort((a, b) => a.at.localeCompare(b.at) || a.sortKey - b.sortKey);
  }, [detail.data]);

  // ---------- render ----------

  if (detail.isLoading) return <PageSkeleton />;
  if (detail.isError) return <ErrorState text="درخواست یافت نشد یا خطایی رخ داد." onRetry={() => navigate("/inbox")} />;
  const d = detail.data!;
  const r = d.requester;

  const isNote = composerTab === "note";
  const canSubmit = body.trim().length > 0 && !send.isPending;

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast("info", `${label} کپی شد.`);
    } catch {
      toast("error", "کپی ناموفق بود.");
    }
  };

  return (
    <div>
      {/* header */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <button className="btn-ghost btn-sm" onClick={() => navigate(-1)}>
          → بازگشت
        </button>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold" dir="ltr">
              {r.code}
            </h1>
            <StatusBadge value={d.type} />
            <StatusBadge value={d.request.status} />
            {d.request.sla_due_at &&
              new Date(d.request.sla_due_at) < new Date() &&
              !["completed", "resolved", "closed", "cancelled"].includes(d.request.status) && (
                <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-medium text-red-400">
                  معوق
                </span>
              )}
          </div>
          <p className="mt-0.5 text-[13px] text-ink-2">{r.subject}</p>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
        {/* ---------- main column ---------- */}
        <div className="min-w-0 space-y-5">
          {/* requester */}
          <div className="card p-5">
            <DescriptionList
              items={[
                { label: "نام", value: r.name },
                { label: "تلفن", value: <span dir="ltr">{r.phone}</span> },
                { label: "ایمیل", value: r.email ? <span dir="ltr">{r.email}</span> : "" },
                { label: "نوع درخواست", value: TYPE_FA[d.type] ?? d.type },
                { label: "منبع", value: r.source_page },
                { label: "زمان ثبت", value: fmtDate(d.request.created_at) },
                ...Object.entries(r.extra || {}).map(([k, v]) => ({ label: k, value: v })),
              ]}
            />
            {r.body && <div className="mt-4 rounded-lg bg-sand-0 p-3.5 text-[13px] leading-6 text-ink-1">{r.body}</div>}
          </div>

          {/* timeline */}
          <div className="card p-5">
            <h2 className="mb-4 text-[14px] font-semibold">رویدادها و گفت‌وگو</h2>
            {timeline.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-ink-3">هنوز رویدادی ثبت نشده است.</p>
            ) : (
              <Timeline>{timeline.map((t) => t.node)}</Timeline>
            )}
          </div>

          {/* deliveries */}
          {d.deliveries.length > 0 && (
            <div className="card p-5">
              <h2 className="mb-3 text-[14px] font-semibold">وضعیت ارسال</h2>
              <div className="space-y-2">
                {d.deliveries.map((dv) => (
                  <div
                    key={dv.id}
                    className="flex items-center justify-between rounded-lg border border-sand-2 px-3 py-2 text-[13px]"
                  >
                    <div className="flex items-center gap-3">
                      <StatusBadge
                        value={dv.channel === "track" ? "consultation" : dv.channel === "email" ? "ticket" : "contact"}
                      />
                      <span className="text-ink-2">
                        {dv.channel === "track" ? "صفحهٔ پیگیری" : dv.channel === "email" ? "ایمیل" : "پیامک"} —{" "}
                        {dv.provider}
                      </span>
                      {dv.recipient && (
                        <span className="text-ink-3" dir="ltr">
                          {dv.recipient}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge value={dv.status} />
                      {dv.status === "failed" && (
                        <button className="btn-ghost btn-sm" onClick={() => retry.mutate(dv.id)} title={dv.last_error}>
                          <RefreshCw size={12} /> تلاش مجدد
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* composer */}
          <div className="card p-5">
            <div className="mb-3 flex gap-1 border-b border-sand-2">
              <button
                className={`tab ${composerTab === "reply" ? "tab-active" : ""}`}
                onClick={() => setComposerTab("reply")}
              >
                <Send size={13} className="ml-1 inline" /> پاسخ به مشتری
              </button>
              <button
                className={`tab ${composerTab === "note" ? "tab-active" : ""}`}
                onClick={() => setComposerTab("note")}
              >
                <StickyNote size={13} className="ml-1 inline" /> یادداشت داخلی
              </button>
            </div>

            {!isNote && (
              <div className="mb-3 flex flex-wrap items-center gap-3">
                {CHANNELS.map((c) => (
                  <label key={c.key} className="!mb-0 flex items-center gap-1.5 text-[13px] text-ink-1">
                    <input
                      type="checkbox"
                      className="!w-4"
                      checked={channels.includes(c.key)}
                      onChange={(e) =>
                        setChannels((ch) => (e.target.checked ? [...ch, c.key] : ch.filter((x) => x !== c.key)))
                      }
                    />
                    {c.label}
                  </label>
                ))}
                <select
                  className="!w-44 !py-1.5 text-[12px] mr-auto"
                  value=""
                  onChange={(e) => {
                    const t = TEMPLATES.find((x) => x.label === e.target.value);
                    if (t) setBody(t.body);
                  }}
                >
                  <option value="">پاسخ‌های آماده…</option>
                  {TEMPLATES.map((t) => (
                    <option key={t.label} value={t.label}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <textarea
              ref={taRef}
              rows={3}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={isNote ? "یادداشت داخلی — مشتری نمی‌بیند…" : "پاسخ به مشتری…"}
              className="resize-none"
            />

            <div className="mt-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadAttachment(f);
                    e.target.value = "";
                  }}
                />
                <button className="btn-ghost btn-sm" onClick={() => fileRef.current?.click()}>
                  + پیوست
                </button>
                {attachments.map((a) => (
                  <span key={a} className="rounded-full bg-sand-0 px-2 py-0.5 text-[11px] text-ink-2">
                    پیوست
                    <button
                      className="mr-1 text-red-400"
                      onClick={() => setAttachments((x) => x.filter((y) => y !== a))}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <button
                className="btn-gold"
                disabled={!canSubmit}
                onClick={() =>
                  send.mutate({
                    body: body.trim(),
                    is_note: isNote,
                    channels: isNote ? [] : channels,
                    attachment_ids: attachments,
                  })
                }
              >
                {send.isPending ? "در حال ثبت…" : isNote ? "ثبت یادداشت" : "ارسال پاسخ"}
              </button>
            </div>
          </div>
        </div>

        {/* ---------- sidebar ---------- */}
        <div className="space-y-4">
          {/* status */}
          <div className="card p-4">
            <p className="mb-2 text-[12px] font-medium text-ink-2">وضعیت</p>
            <StatusBadge value={d.request.status} />
            {d.allowed_transitions.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {d.allowed_transitions.map((s) => (
                  <button
                    key={s}
                    className={`btn-sm w-full ${s === "cancelled" ? "btn-ghost text-red-400" : "btn-ghost"}`}
                    onClick={() => {
                      if (s === "cancelled") {
                        const reason = window.prompt("دلیل لغو را وارد کنید:");
                        if (reason === null) return;
                        setStatus.mutate({ status: s, reason });
                      } else {
                        setStatus.mutate({ status: s });
                      }
                    }}
                    disabled={setStatus.isPending}
                  >
                    → {STATUS_FA[s] ?? s}
                  </button>
                ))}
              </div>
            )}
            {d.request.cancel_reason && (
              <p className="mt-2 rounded-lg bg-red-500/10 p-2 text-[12px] text-red-300">
                دلیل لغو: {d.request.cancel_reason}
              </p>
            )}
          </div>

          {/* attorney-fee receipts → commission accrual */}
          {type === "consultation" && receipts.data && (
            <div className="card p-4">
              <p className="mb-2 text-[12px] font-medium text-ink-2">حق‌الوکالهٔ دریافتی دفتر</p>
              {receipts.data.receipts.length > 0 && (
                <ul className="mb-3 space-y-1.5 text-[12px]">
                  {receipts.data.receipts.map((r) => (
                    <li
                      key={r.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-line px-2.5 py-1.5"
                    >
                      <span className="font-medium">{r.amount.toLocaleString("fa-IR")} تومان</span>
                      <span className="text-ink-3">{fmtDate(r.created_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {receipts.data.commissions.length > 0 && (
                <ul className="mb-3 space-y-1.5 text-[12px]">
                  {receipts.data.commissions.map((c) => (
                    <li
                      key={c.id}
                      className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 ${c.entry_type === "reversal" ? "border-red-500/30 text-red-300" : "border-line"}`}
                    >
                      <span>
                        {c.entry_type === "reversal" ? "برگشت" : `کمیسیون ${c.rate.toLocaleString("fa-IR")}٪`}:{" "}
                        {c.amount.toLocaleString("fa-IR")} تومان
                      </span>
                      <StatusBadge value={c.status} />
                    </li>
                  ))}
                </ul>
              )}
              {!["cancelled", "closed"].includes(d.request.status) && (
                <form
                  className="space-y-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const amount = Number(feeAmount.replace(/[,،\s]/g, ""));
                    if (!amount || amount < 1) return;
                    addReceipt.mutate({ amount, note: feeNote });
                  }}
                >
                  <input
                    className="w-full !py-1.5 text-[13px]"
                    inputMode="numeric"
                    placeholder="مبلغ دریافتی (تومان)"
                    value={feeAmount}
                    onChange={(e) => setFeeAmount(e.target.value)}
                  />
                  <input
                    className="w-full !py-1.5 text-[13px]"
                    placeholder="توضیح (اختیاری — مثلاً قسط اول)"
                    value={feeNote}
                    onChange={(e) => setFeeNote(e.target.value)}
                  />
                  <button className="btn-sm w-full" type="submit" disabled={addReceipt.isPending || !feeAmount.trim()}>
                    {addReceipt.isPending ? "در حال ثبت…" : "ثبت دریافتی"}
                  </button>
                  <p className="text-[11px] leading-4 text-ink-3">
                    با ثبت هر دریافتی، در صورت اتصال به ارجاع، کمیسیون به‌صورت خودکار محاسبه می‌شود.
                  </p>
                </form>
              )}
            </div>
          )}

          {/* assignment + priority */}
          <div className="card space-y-3 p-4">
            <div>
              <p className="mb-1.5 text-[12px] font-medium text-ink-2">مسئول رسیدگی</p>
              <select
                className="!py-1.5 text-[13px]"
                value={d.request.assigned_to ?? ""}
                onChange={(e) => patch.mutate({ assigned_to: e.target.value || null })}
              >
                <option value="">ارجاع نشده</option>
                {(assignees.data ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <p className="mb-1.5 text-[12px] font-medium text-ink-2">اولویت</p>
              <select
                className="!py-1.5 text-[13px]"
                value={d.request.priority}
                onChange={(e) => patch.mutate({ priority: e.target.value })}
              >
                {["low", "normal", "high", "urgent"].map((p) => (
                  <option key={p} value={p}>
                    {STATUS_FA[p]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* labels */}
          <div className="card p-4">
            <p className="mb-2 text-[12px] font-medium text-ink-2">برچسب‌ها</p>
            <div className="flex flex-wrap gap-1.5">
              {(labels.data ?? []).map((l) => {
                const on = d.labels.some((x) => x.id === l.id);
                return (
                  <button
                    key={l.id}
                    className={`chip !px-2.5 !py-1 text-[12px] ${on ? "chip-active" : ""}`}
                    onClick={() =>
                      patch.mutate({
                        label_ids: on
                          ? d.labels.filter((x) => x.id !== l.id).map((x) => x.id)
                          : [...d.labels.map((x) => x.id), l.id],
                      })
                    }
                  >
                    {l.name}
                  </button>
                );
              })}
              {(labels.data ?? []).length === 0 && (
                <p className="text-[12px] text-ink-3">برچسبی تعریف نشده — از صفحهٔ برچسب‌ها بسازید.</p>
              )}
            </div>
          </div>

          {/* quick actions */}
          <div className="card space-y-2 p-4">
            <p className="text-[12px] font-medium text-ink-2">اقدام سریع</p>
            <div className="flex gap-2">
              <a className="btn-ghost btn-sm flex-1" href={`tel:${r.phone}`}>
                <Phone size={13} /> تماس
              </a>
              {r.email && (
                <a className="btn-ghost btn-sm flex-1" href={`mailto:${r.email}`}>
                  <Mail size={13} /> ایمیل
                </a>
              )}
            </div>
            <div className="flex gap-2">
              <button className="btn-ghost btn-sm flex-1" onClick={() => copy(r.phone, "شماره")}>
                <Copy size={13} /> شماره
              </button>
              <button className="btn-ghost btn-sm flex-1" onClick={() => copy(r.code, "کد پیگیری")}>
                <Copy size={13} /> کد
              </button>
            </div>
          </div>

          {/* call log */}
          <div className="card p-4">
            <p className="mb-2 text-[12px] font-medium text-ink-2">ثبت تماس تلفنی</p>
            <input
              value={callNote}
              onChange={(e) => setCallNote(e.target.value)}
              placeholder="نتیجهٔ تماس…"
              className="!py-1.5 text-[13px]"
            />
            <div className="mt-2 flex gap-2">
              {["answered", "no_answer", "scheduled"].map((o) => (
                <button
                  key={o}
                  className="btn-ghost btn-sm flex-1 text-[11px]"
                  onClick={() => callLog.mutate({ outcome: o, note: callNote })}
                  disabled={callLog.isPending}
                >
                  {o === "answered" ? "پاسخ داد" : o === "no_answer" ? "پاسخ نداد" : "جلسه شد"}
                </button>
              ))}
            </div>
          </div>

          {/* meta */}
          <div className="card p-4 text-[12px] text-ink-2">
            <p>اولین پاسخ: {d.request.first_response_at ? fmtDate(d.request.first_response_at) : "—"}</p>
            <p className="mt-1">آخرین پاسخ: {d.request.last_response_at ? fmtDate(d.request.last_response_at) : "—"}</p>
            <p className="mt-1">مهلت پاسخ: {d.request.sla_due_at ? fmtDate(d.request.sla_due_at) : "—"}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
