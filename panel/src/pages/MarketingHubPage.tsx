/** بازاریابی — قواعد کمیسیون · کمیسیون‌ها · گزارش عملکرد ·
 *  تنظیمات ارجاع (spec §2 sidebar #4 — بدون کیف پول). */

import { useSearchParams } from "react-router-dom";
import { PageHeader, Tabs } from "../components/ui";
import {
  CommissionsTab,
  ReportTab,
  RulesTab,
  SettingsTab,
} from "./marketing/parts";

export default function MarketingHubPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "rules";
  return (
    <div>
      <PageHeader
        title="بازاریابی"
        subtitle="قواعد کمیسیون، تسویهٔ دستی، گزارش عملکرد و تنظیمات ارجاع"
      />
      <Tabs
        active={tab}
        onChange={(k) => setParams({ tab: k }, { replace: true })}
        tabs={[
          { key: "rules", label: "قواعد کمیسیون" },
          { key: "commissions", label: "کمیسیون‌ها" },
          { key: "report", label: "گزارش عملکرد" },
          { key: "settings", label: "تنظیمات ارجاع" },
        ]}
      />
      <div className="pt-4">
        {tab === "rules" && <RulesTab />}
        {tab === "commissions" && <CommissionsTab />}
        {tab === "report" && <ReportTab />}
        {tab === "settings" && <SettingsTab />}
      </div>
    </div>
  );
}
