/** بازاریابی — قواعد کمیسیون · کمیسیون‌ها · برداشت‌ها و پرداخت‌ها ·
 *  گزارش عملکرد · تنظیمات ارجاع (spec §2 sidebar #4). */

import { useSearchParams } from "react-router-dom";
import { PageHeader, Tabs } from "../components/ui";
import {
  CommissionsTab,
  PayoutsTab,
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
        subtitle="قواعد کمیسیون، تسویه، برداشت، گزارش عملکرد و تنظیمات ارجاع"
      />
      <Tabs
        active={tab}
        onChange={(k) => setParams({ tab: k }, { replace: true })}
        tabs={[
          { key: "rules", label: "قواعد کمیسیون" },
          { key: "commissions", label: "کمیسیون‌ها" },
          { key: "payouts", label: "برداشت‌ها و پرداخت‌ها" },
          { key: "report", label: "گزارش عملکرد" },
          { key: "settings", label: "تنظیمات ارجاع" },
        ]}
      />
      <div className="pt-4">
        {tab === "rules" && <RulesTab />}
        {tab === "commissions" && <CommissionsTab />}
        {tab === "payouts" && <PayoutsTab />}
        {tab === "report" && <ReportTab />}
        {tab === "settings" && <SettingsTab />}
      </div>
    </div>
  );
}
