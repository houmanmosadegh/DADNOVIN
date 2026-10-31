/** درخواست‌ها — یک صندوق واحد: ورودی · مشاوره · تماس · تیکت · بازاریابی ·
 *  برچسب‌ها (spec §2 sidebar #2). */

import { useSearchParams } from "react-router-dom";
import { PageHeader, Tabs } from "../components/ui";
import { ApplicationsTab, useApplications } from "./marketing/parts";
import InboxPage from "./InboxPage";
import LabelsPage from "./LabelsPage";

export default function RequestsHubPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "inbox";
  const apps = useApplications();
  const pendingApps = (apps.data ?? []).filter((a) => a.status === "pending").length;

  return (
    <div>
      <PageHeader
        title="درخواست‌ها"
        subtitle="صندوق واحد — مشاوره، تماس، تیکت و بازاریابی"
      />
      <Tabs
        active={tab}
        onChange={(k) => setParams({ tab: k }, { replace: true })}
        tabs={[
          { key: "inbox", label: "صندوق ورودی" },
          { key: "consultations", label: "مشاوره" },
          { key: "contacts", label: "تماس" },
          { key: "tickets", label: "تیکت‌ها" },
          { key: "marketers", label: "بازاریابی", count: pendingApps || undefined },
          { key: "labels", label: "برچسب‌ها" },
        ]}
      />
      <div className="pt-4">
        {tab === "inbox" && <InboxPage key="inbox" embedded />}
        {tab === "consultations" && (
          <InboxPage key="consultations" fixedType="consultation" embedded />
        )}
        {tab === "contacts" && <InboxPage key="contacts" fixedType="contact" embedded />}
        {tab === "tickets" && <InboxPage key="tickets" fixedType="ticket" embedded />}
        {tab === "marketers" && <ApplicationsTab />}
        {tab === "labels" && <LabelsPage />}
      </div>
    </div>
  );
}
