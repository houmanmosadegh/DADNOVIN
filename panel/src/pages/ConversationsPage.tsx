import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../services/api";
import type { ConversationOut, ConversationRow, Page } from "../types/api";
import { EmptyState, PageSkeleton, Pagination, fmtDate } from "../components/ui";

export default function ConversationsPage() {
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["ai-conversations", page],
    queryFn: () => api.get<Page<ConversationRow>>(`/admin/ai/conversations?page=${page}&page_size=15`),
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold">مکالمات مشاور هوشمند</h1>
        <p className="mt-0.5 text-[13px] text-ink-1/60">گفتگوهای بازدیدکنندگان با دستیار سایت</p>
      </div>
      {isLoading || !data ? (
        <PageSkeleton />
      ) : data.items.length === 0 ? (
        <EmptyState text="گفتگویی ثبت نشده است" />
      ) : (
        <>
          <div className="space-y-2">
            {data.items.map((c) => (
              <div key={c.id} className="card">
                <button
                  className="flex w-full items-center gap-3 px-4 py-3 text-right text-sm"
                  onClick={() => setOpenId(openId === c.id ? null : c.id)}
                >
                  <span className="font-medium" dir="ltr">
                    {c.session_key}
                  </span>
                  <span className="text-[12px] text-ink-1/50">{c.message_count.toLocaleString("fa-IR")} پیام</span>
                  <span className="mr-auto text-[12px] text-ink-1/50">{fmtDate(c.created_at)}</span>
                </button>
                {openId === c.id && <ConversationDetail id={c.id} />}
              </div>
            ))}
          </div>
          <Pagination page={page} total={data.total} pageSize={data.page_size} onPage={setPage} />
        </>
      )}
    </div>
  );
}

function ConversationDetail({ id }: { id: string }) {
  const { data } = useQuery({
    queryKey: ["ai-conversation", id],
    queryFn: () => api.get<ConversationOut>(`/admin/ai/conversations/${id}`),
  });
  if (!data)
    return (
      <div className="border-t border-sand-1 p-4">
        <PageSkeleton />
      </div>
    );
  return (
    <div className="space-y-2 border-t border-sand-1 p-4">
      {data.messages.map((m, i) => (
        <div
          key={i}
          className={`max-w-[80%] rounded-xl px-3.5 py-2 text-[13px] ${
            m.role === "user" ? "bg-sand-1" : "mr-auto bg-gold-1/25"
          }`}
        >
          <p className="whitespace-pre-wrap">{m.content}</p>
          <p className="mt-0.5 text-[10px] opacity-60">
            {m.role === "user" ? "بازدیدکننده" : "دستیار"} — {fmtDate(m.created_at)}
          </p>
        </div>
      ))}
    </div>
  );
}
