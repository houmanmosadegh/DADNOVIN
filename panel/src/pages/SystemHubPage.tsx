/** مدیریت سیستم — گزارش فعالیت‌ها · مشاور هوشمند · مکالمات · سلامت
 *  (spec §2 sidebar #6). */

import { useQuery } from "@tanstack/react-query";
import { Activity } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { ErrorState, PageHeader, Skeleton, Tabs } from "../components/ui";
import AiPage from "./AiPage";
import AuditPage from "./AuditPage";
import ConversationsPage from "./ConversationsPage";

export default function SystemHubPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "audit";
  return (
    <div>
      <PageHeader title="مدیریت سیستم" subtitle="گزارش فعالیت‌ها، مشاور هوشمند و سلامت سیستم" />
      <Tabs
        active={tab}
        onChange={(k) => setParams({ tab: k }, { replace: true })}
        tabs={[
          { key: "audit", label: "گزارش فعالیت‌ها" },
          { key: "ai", label: "مشاور هوشمند" },
          { key: "conversations", label: "مکالمات مشاور" },
          { key: "health", label: "سلامت سیستم" },
        ]}
      />
      <div className="pt-4">
        {tab === "audit" && <AuditPage />}
        {tab === "ai" && <AiPage />}
        {tab === "conversations" && <ConversationsPage />}
        {tab === "health" && <HealthTab />}
      </div>
    </div>
  );
}

function HealthTab() {
  const q = useQuery({
    queryKey: ["sys-health"],
    queryFn: async () => {
      // /api/health lives outside the versioned API root
      const res = await fetch((import.meta.env.VITE_API_URL ?? "") + "/api/health", { credentials: "include" });
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()) as Record<string, unknown>;
    },
    refetchInterval: 30_000,
    retry: false,
  });
  return (
    <div className="max-w-lg space-y-3">
      {q.isLoading && <Skeleton className="h-32" />}
      {q.isError && <ErrorState text="سرویس API پاسخ نمی‌دهد." onRetry={() => q.refetch()} />}
      {q.data && (
        <div className="card p-5">
          <div className="flex items-center gap-2 text-emerald-400">
            <Activity size={17} />
            <span className="font-semibold">سرویس فعال است</span>
          </div>
          <dl className="mt-3 space-y-1.5 text-[13px]">
            {Object.entries(q.data).map(([k, v]) => (
              <div key={k} className="flex justify-between border-b border-sand-2 pb-1.5 last:border-0">
                <dt dir="ltr" className="font-mono text-[12px] text-ink-2">
                  {k}
                </dt>
                <dd className="font-medium">{typeof v === "object" ? JSON.stringify(v) : String(v)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}
