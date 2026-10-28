import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Pencil } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../services/api";
import type { PageOut } from "../types/api";
import { PageSkeleton, Table } from "../components/ui";

export default function PagesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-pages"],
    queryFn: () => api.get<PageOut[]>("/admin/pages"),
  });

  if (isLoading || !data) return <PageSkeleton />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold">مدیریت صفحات سایت</h1>
        <p className="mt-0.5 text-[13px] text-ink-1/60">
          ویرایش متن‌ها، بخش‌ها و متادیتای سئوی هر صفحه
        </p>
      </div>
      <Table head={["صفحه", "نامک", "بخش‌ها", "وضعیت", "عملیات"]}>
        {data.map((p) => (
          <tr key={p.id} className="hover:bg-sand-2">
            <td className="px-4 py-3 font-medium">{p.title}</td>
            <td className="px-4 py-3 text-ink-1/60" dir="ltr">/{p.slug === "home" ? "" : p.slug}</td>
            <td className="px-4 py-3">{p.sections.length.toLocaleString("fa-IR")}</td>
            <td className="px-4 py-3">
              <span className={`rounded-full px-2.5 py-0.5 text-[12px] ${p.is_published ? "bg-emerald-500/100/10 text-emerald-400" : "bg-sand-1 text-ink-1/60"}`}>
                {p.is_published ? "منتشرشده" : "پیش‌نویس"}
              </span>
            </td>
            <td className="px-4 py-3">
              <div className="flex gap-1.5">
                <Link to={`/content/pages/${p.slug}`} className="btn-ghost btn-sm">
                  <Pencil size={13} /> ویرایش
                </Link>
                <a
                  href={p.slug === "home" ? "/" : `/${p.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-ghost btn-sm"
                >
                  <ExternalLink size={13} />
                </a>
              </div>
            </td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
