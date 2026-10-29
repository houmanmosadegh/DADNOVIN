/** Site settings — brand, contact, socials, SEO, footer. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "../services/api";
import type { SettingOut } from "../types/api";
import { Field, PageSkeleton, useToast } from "../components/ui";

const TABS = [
  { key: "brand", label: "اطلاعات مجموعه" },
  { key: "contact", label: "تماس و آدرس" },
  { key: "socials", label: "شبکه‌های اجتماعی" },
  { key: "seo", label: "تنظیمات سئو" },
  { key: "footer", label: "فوتر" },
  { key: "ai", label: "مشاور هوشمند" },
  { key: "commission", label: "بازاریابی و کمیسیون" },
] as const;

function useSetting(key: string) {
  return useQuery({
    queryKey: ["setting", key],
    queryFn: () => api.get<SettingOut>(`/admin/settings/${key}`),
  });
}

const TAB_ALIAS: Record<string, (typeof TABS)[number]["key"]> = {
  contact: "contact",
  address: "contact",
  social: "socials",
  general: "brand",
  seo: "seo",
  footer: "footer",
  ai: "ai",
  commission: "commission",
};

export default function SettingsPage({ tab: initialTab }: { tab?: string }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>(
    (initialTab && TAB_ALIAS[initialTab]) || "brand",
  );
  return (
    <div className="space-y-5">
      <h1 className="text-lg font-semibold">تنظیمات سایت</h1>
      <div className="flex flex-wrap gap-1.5 border-b border-sand-2 pb-px">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-t-lg px-4 py-2 text-[13px] font-medium transition ${
              tab === t.key
                ? "border-b-2 border-gold-1 bg-sand-1 text-ink-0"
                : "text-ink-1/60 hover:text-ink-0"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "brand" && <BrandForm />}
      {tab === "contact" && <ContactForm />}
      {tab === "socials" && <SocialsForm />}
      {tab === "seo" && <SeoForm />}
      {tab === "footer" && <FooterForm />}
      {tab === "ai" && <AiForm />}
      {tab === "commission" && <CommissionForm />}
    </div>
  );
}

function SaveBar({ saving, onSave }: { saving: boolean; onSave: () => void }) {
  return (
    <div className="mt-5 flex justify-end">
      <button className="btn-primary" onClick={onSave} disabled={saving}>
        {saving ? "در حال ذخیره…" : "ذخیره تغییرات"}
      </button>
    </div>
  );
}

function useSave(key: string) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (value: Record<string, unknown>) =>
      api.put<SettingOut>(`/admin/settings/${key}`, { value }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["setting", key] });
      qc.invalidateQueries({ queryKey: ["settings"] });
      toast("success", "تنظیمات ذخیره شد.");
    },
    onError: (e) => toast("error", e instanceof Error ? e.message : "خطا در ذخیره"),
  });
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function arr(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String) : [];
}

function BrandForm() {
  const { data, isLoading } = useSetting("brand");
  const save = useSave("brand");
  const [v, setV] = useState<Record<string, string>>({});
  useEffect(() => {
    if (data) setV(Object.fromEntries(Object.entries(data.value).map(([k, x]) => [k, str(x)])));
  }, [data]);
  if (isLoading) return <PageSkeleton />;
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setV((p) => ({ ...p, [k]: e.target.value }));
  return (
    <div className="card max-w-2xl space-y-4 p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="نام مجموعه"><input value={v.name ?? ""} onChange={set("name")} /></Field>
        <Field label="نام رسمی"><input value={v.legalName ?? ""} onChange={set("legalName")} /></Field>
        <Field label="نام انگلیسی"><input dir="ltr" value={v.nameEn ?? ""} onChange={set("nameEn")} /></Field>
        <Field label="شهر"><input value={v.city ?? ""} onChange={set("city")} /></Field>
        <Field label="شعار"><input value={v.tagline ?? ""} onChange={set("tagline")} /></Field>
        <Field label="نشانی سایت"><input dir="ltr" value={v.siteUrl ?? ""} onChange={set("siteUrl")} /></Field>
      </div>
      <Field label="توضیح کوتاه مجموعه">
        <textarea rows={3} value={v.description ?? ""} onChange={set("description")} />
      </Field>
      <SaveBar saving={save.isPending} onSave={() => save.mutate(v)} />
    </div>
  );
}

function ContactForm() {
  const { data, isLoading } = useSetting("contact");
  const save = useSave("contact");
  const [v, setV] = useState<{ phones: string; email: string; whatsapp: string; address: string; city: string; hours: string }>({ phones: "", email: "", whatsapp: "", address: "", city: "", hours: "" });
  useEffect(() => {
    if (data)
      setV({
        phones: arr(data.value.phones).join("\n"),
        email: str(data.value.email),
        whatsapp: str(data.value.whatsapp),
        address: str(data.value.address),
        city: str(data.value.city),
        hours: str(data.value.hours),
      });
  }, [data]);
  if (isLoading) return <PageSkeleton />;
  return (
    <div className="card max-w-2xl space-y-4 p-5">
      <Field label="شماره‌های تماس (هر خط یک شماره)">
        <textarea dir="ltr" rows={3} value={v.phones} onChange={(e) => setV({ ...v, phones: e.target.value })} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="ایمیل"><input dir="ltr" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} /></Field>
        <Field label="واتس‌اپ"><input dir="ltr" value={v.whatsapp} onChange={(e) => setV({ ...v, whatsapp: e.target.value })} /></Field>
        <Field label="شهر"><input value={v.city} onChange={(e) => setV({ ...v, city: e.target.value })} /></Field>
        <Field label="ساعات کاری"><input value={v.hours} onChange={(e) => setV({ ...v, hours: e.target.value })} /></Field>
      </div>
      <Field label="آدرس دفتر"><textarea rows={2} value={v.address} onChange={(e) => setV({ ...v, address: e.target.value })} /></Field>
      <SaveBar saving={save.isPending} onSave={() =>
        save.mutate({ ...v, phones: v.phones.split("\n").map((s) => s.trim()).filter(Boolean) })
      } />
    </div>
  );
}

function SocialsForm() {
  const { data, isLoading } = useSetting("socials");
  const save = useSave("socials");
  const [items, setItems] = useState<{ label: string; url: string }[]>([]);
  useEffect(() => {
    if (data) {
      const raw = data.value.items;
      setItems(Array.isArray(raw) ? raw.map((i) => ({ label: str((i as {label?:unknown}).label), url: str((i as {url?:unknown}).url) })) : []);
    }
  }, [data]);
  if (isLoading) return <PageSkeleton />;
  return (
    <div className="card max-w-2xl space-y-3 p-5">
      {items.map((it, i) => (
        <div key={i} className="flex items-end gap-2">
          <div className="w-32"><Field label="نام"><input value={it.label} onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} /></Field></div>
          <div className="flex-1"><Field label="لینک"><input dir="ltr" value={it.url} onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, url: e.target.value } : x))} /></Field></div>
          <button className="btn-ghost btn-sm mb-0.5" onClick={() => setItems(items.filter((_, j) => j !== i))}>حذف</button>
        </div>
      ))}
      <button className="btn-ghost btn-sm" onClick={() => setItems([...items, { label: "", url: "" }])}>+ افزودن شبکه</button>
      <SaveBar saving={save.isPending} onSave={() => save.mutate({ items: items.filter((i) => i.label && i.url) })} />
    </div>
  );
}

function SeoForm() {
  const { data, isLoading } = useSetting("seo");
  const save = useSave("seo");
  const [v, setV] = useState<Record<string, { title: string; description: string }>>({});
  useEffect(() => {
    if (data) {
      const out: typeof v = {};
      for (const [k, x] of Object.entries(data.value)) {
        const rec = x as { title?: unknown; description?: unknown };
        out[k] = { title: str(rec.title), description: str(rec.description) };
      }
      setV(out);
    }
  }, [data]);
  if (isLoading) return <PageSkeleton />;
  const LABELS: Record<string, string> = {
    home: "صفحه اصلی", about: "درباره ما", services: "خدمات",
    consultation: "مشاوره", contact: "تماس", notFound: "۴۰۴",
  };
  return (
    <div className="space-y-4">
      {Object.entries(v).map(([key, val]) => (
        <div key={key} className="card space-y-3 p-5">
          <h3 className="text-sm font-semibold">{LABELS[key] ?? key}</h3>
          <Field label="عنوان سئو"><input value={val.title} onChange={(e) => setV({ ...v, [key]: { ...val, title: e.target.value } })} /></Field>
          <Field label="توضیحات سئو"><textarea rows={2} value={val.description} onChange={(e) => setV({ ...v, [key]: { ...val, description: e.target.value } })} /></Field>
        </div>
      ))}
      <SaveBar saving={save.isPending} onSave={() => save.mutate(v)} />
    </div>
  );
}

function FooterForm() {
  const { data, isLoading } = useSetting("footer");
  const save = useSave("footer");
  const [v, setV] = useState<Record<string, string>>({});
  useEffect(() => {
    if (data) setV(Object.fromEntries(Object.entries(data.value).map(([k, x]) => [k, str(x)])));
  }, [data]);
  if (isLoading) return <PageSkeleton />;
  return (
    <div className="card max-w-2xl space-y-4 p-5">
      <Field label="توضیح فوتر"><textarea rows={3} value={v.description ?? ""} onChange={(e) => setV({ ...v, description: e.target.value })} /></Field>
      <Field label="متن کپی‌رایت"><input value={v.copyright ?? ""} onChange={(e) => setV({ ...v, copyright: e.target.value })} /></Field>
      <SaveBar saving={save.isPending} onSave={() => save.mutate(v)} />
    </div>
  );
}

function AiForm() {
  const { data, isLoading } = useSetting("ai");
  const save = useSave("ai");
  const [v, setV] = useState<{ enabled: boolean; welcome: string; placeholder: string }>({ enabled: true, welcome: "", placeholder: "" });
  useEffect(() => {
    if (data)
      setV({
        enabled: data.value.enabled !== false,
        welcome: str(data.value.welcome),
        placeholder: str(data.value.placeholder),
      });
  }, [data]);
  if (isLoading) return <PageSkeleton />;
  return (
    <div className="card max-w-2xl space-y-4 p-5">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="!w-4" checked={v.enabled} onChange={(e) => setV({ ...v, enabled: e.target.checked })} />
        نمایش دستیار هوشمند در سایت
      </label>
      <Field label="پیام خوش‌آمد"><input value={v.welcome} onChange={(e) => setV({ ...v, welcome: e.target.value })} /></Field>
      <Field label="متن راهنمای ورودی"><input value={v.placeholder} onChange={(e) => setV({ ...v, placeholder: e.target.value })} /></Field>
      <SaveBar saving={save.isPending} onSave={() => save.mutate(v)} />
    </div>
  );
}

function CommissionForm() {
  const { data, isLoading } = useSetting("commission");
  const save = useSave("commission");
  const [v, setV] = useState({
    commission_enabled: false,
    cookie_days: "30",
    min_payout: "1000000",
    hold_days: "14",
  });
  useEffect(() => {
    if (data)
      setV({
        commission_enabled: data.value.commission_enabled === true,
        cookie_days: String(data.value.cookie_days ?? 30),
        min_payout: String(data.value.min_payout ?? 1_000_000),
        hold_days: String(data.value.hold_days ?? 14),
      });
  }, [data]);
  if (isLoading) return <PageSkeleton />;
  const num = (s: string) => parseInt(s.replace(/,/g, ""), 10) || 0;
  return (
    <div className="card max-w-2xl space-y-4 p-5">
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5 text-[12.5px] leading-6 text-amber-200/90">
        پرداخت پورسانت بابت جذب موکل ممکن است با مقررات کانون وکلا و اخلاق حرفه‌ای تعارض داشته باشد — قبل از فعال‌سازی با مراجع مربوط هماهنگ شود. کمیسیون بر مبنای پروندهٔ پذیرفته‌شده یا حق‌الوکالهٔ ثبت‌شده است، نه درصدی از نتیجهٔ دعوا.
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="!w-4"
          checked={v.commission_enabled}
          onChange={(e) => setV({ ...v, commission_enabled: e.target.checked })}
        />
        فعال‌سازی ثبت کمیسیون (پیش‌فرض خاموش)
      </label>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="اعتبار کوکی ارجاع (روز)">
          <input dir="ltr" inputMode="numeric" value={v.cookie_days} onChange={(e) => setV({ ...v, cookie_days: e.target.value })} />
        </Field>
        <Field label="حداقل مبلغ برداشت (ریال)">
          <input dir="ltr" inputMode="numeric" value={v.min_payout} onChange={(e) => setV({ ...v, min_payout: e.target.value })} />
        </Field>
        <Field label="دورهٔ نگهداری کمیسیون (روز)">
          <input dir="ltr" inputMode="numeric" value={v.hold_days} onChange={(e) => setV({ ...v, hold_days: e.target.value })} />
        </Field>
      </div>
      <SaveBar
        saving={save.isPending}
        onSave={() =>
          save.mutate({
            commission_enabled: v.commission_enabled,
            cookie_days: num(v.cookie_days),
            min_payout: num(v.min_payout),
            hold_days: num(v.hold_days),
          })
        }
      />
    </div>
  );
}
