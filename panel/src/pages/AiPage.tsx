/** AI assistant admin — coming soon. The public consultant is not wired to a
 *  provider yet, so this tab shows an honest placeholder instead of dead CRUD.
 *  Backend endpoints (/admin/ai/*) stay untouched for when the feature ships. */

import { Bot } from "lucide-react";

export default function AiPage() {
  return (
    <div className="card flex flex-col items-center gap-3 py-16 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-sand-2 text-gold-1">
        <Bot size={26} />
      </span>
      <h1 className="text-lg font-semibold">مشاور هوشمند</h1>
      <p className="max-w-sm text-sm text-ink-2">
        این قابلیت به‌زودی فعال می‌شود. پس از اتصال به سرویس هوش مصنوعی،
        مدیریت دانش و پایش گفتگوها از همین بخش در دسترس خواهد بود.
      </p>
      <span className="rounded-full border border-gold-1/40 px-4 py-1 text-[12px] font-semibold text-gold-1">
        به‌زودی
      </span>
    </div>
  );
}
