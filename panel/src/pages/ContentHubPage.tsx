/** محتوای سایت — صفحات · مقالات · وکلا · رسانه · تنظیمات سایت
 *  (spec §2 sidebar #5 + §3 site settings). */

import { useSearchParams } from "react-router-dom";
import { PageHeader, Tabs } from "../components/ui";
import ArticlesPage from "./ArticlesPage";
import LawyersPage from "./LawyersPage";
import MediaPage from "./MediaPage";
import PagesPage from "./PagesPage";
import SettingsPage from "./SettingsPage";

export default function ContentHubPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "pages";
  return (
    <div>
      <PageHeader
        title="محتوای سایت"
        subtitle="صفحات، مقالات، وکلا، رسانه و تنظیمات نمایشی سایت عمومی"
      />
      <Tabs
        active={tab}
        onChange={(k) => setParams({ tab: k }, { replace: true })}
        tabs={[
          { key: "pages", label: "صفحات سایت" },
          { key: "articles", label: "مقالات" },
          { key: "lawyers", label: "وکلا و رزومه‌ها" },
          { key: "media", label: "تصاویر و رسانه‌ها" },
          { key: "site", label: "تنظیمات سایت" },
        ]}
      />
      <div className="pt-4">
        {tab === "pages" && <PagesPage />}
        {tab === "articles" && <ArticlesPage />}
        {tab === "lawyers" && <LawyersPage />}
        {tab === "media" && <MediaPage />}
        {tab === "site" && <SettingsPage />}
      </div>
    </div>
  );
}
