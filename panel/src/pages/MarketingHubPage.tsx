/** بازاریابی — یک بخش با تب: درخواست‌های همکاری · بازاریاب‌ها · ارجاع‌ها ·
 *  کمیسیون‌ها (ledger) · قوانین نسخه‌دار · گزارش · تنظیمات (spec §3.2).
 *  درصد کمیسیون: پیش‌فرض در «تنظیمات»، اختصاصی هر بازاریاب در «بازاریاب‌ها». */

import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { PageHeader, Tabs } from "../components/ui";
import { api } from "../services/api";
import {
  ApplicationsTab,
  CommissionsTab,
  ProfilesTab,
  ReferralsTab,
  ReportTab,
  SettingsTab,
  TermsTab,
  useApplications,
} from "./marketing/parts";

export default function MarketingHubPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "applications";

  // pending application count badge on the first tab
  const apps = useApplications();
  const pendingApps = (apps.data ?? []).filter((a) => a.status === "pending").length;

  // marketing switch state — show a hint when the whole feature is off
  const flag = useQuery({
    queryKey: ["setting-commission"],
    queryFn: () => api.get<{ value: Record<string, unknown> }>("/admin/settings/commission"),
    retry: 1,
  });
  const enabled = Boolean(
    flag.data?.value.marketing_enabled ?? flag.data?.value.commission_enabled,
  );

  return (
    <div>
      <PageHeader
        title="بازاریابی"
        subtitle="همکاری، ارجاع‌ها، دفتر کمیسیون و قوانین — بدون کیف پول؛ تسویه دستی"
      />
      {!enabled && (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-[13px] text-amber-300">
          سوئیچ «بازاریابی و ارجاع» خاموش است — همهٔ لینک‌ها و APIهای مربوط ۴۰۴ می‌دهند.
          برای فعال‌سازی به تب «تنظیمات» بروید.
        </div>
      )}
      <Tabs
        active={tab}
        onChange={(k) => setParams({ tab: k }, { replace: true })}
        tabs={[
          { key: "applications", label: "درخواست‌های همکاری", count: pendingApps || undefined },
          { key: "marketers", label: "بازاریاب‌ها" },
          { key: "referrals", label: "ارجاع‌ها" },
          { key: "commissions", label: "کمیسیون‌ها" },
          { key: "terms", label: "قوانین همکاری" },
          { key: "report", label: "گزارش‌ها" },
          { key: "settings", label: "تنظیمات" },
        ]}
      />
      <div className="pt-4">
        {tab === "applications" && <ApplicationsTab />}
        {tab === "marketers" && <ProfilesTab />}
        {tab === "referrals" && <ReferralsTab />}
        {tab === "commissions" && <CommissionsTab />}
        {tab === "terms" && <TermsTab />}
        {tab === "report" && <ReportTab />}
        {tab === "settings" && <SettingsTab />}
      </div>
    </div>
  );
}
