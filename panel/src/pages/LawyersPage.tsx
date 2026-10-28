import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../services/api";
import type { LawyerOut } from "../types/api";
import { ConfirmDialog, EmptyState, PageSkeleton, Table, useToast } from "../components/ui";

export default function LawyersPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [confirmDelete, setConfirmDelete] = useState<LawyerOut | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-lawyers"],
    queryFn: () => api.get<LawyerOut[]>("/admin/lawyers"),
  });

  const toggle = useMutation({
    mutationFn: (l: LawyerOut) =>
      api.patch(`/admin/lawyers/${l.id}`, { is_visible: !l.is_visible }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-lawyers"] }),
    onError: (e) => toast("error", e instanceof Error ? e.message : "خطا"),
  });

  const del = useMutation({
    mutationFn: (id: string) => api.del(`/admin/lawyers/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-lawyers"] });
      toast("success", "وکیل حذف شد.");
      setConfirmDelete(null);
    },
    onError: (e) => toast("error", e instanceof Error ? e.message : "خطا در حذف"),
  });

  if (isLoading || !data) return <PageSkeleton />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">مدیریت وکلا</h1>
          <p className="mt-0.5 text-[13px] text-ink-1/60">
            افزودن، ویرایش و مدیریت نمایش وکلای سایت
          </p>
        </div>
        <Link to="/content/lawyers/new" className="btn-gold">
          <Plus size={16} /> وکیل جدید
        </Link>
      </div>

      {data.length === 0 ? (
        <EmptyState text="وکیلی ثبت نشده است" hint="از دکمهٔ «وکیل جدید» شروع کنید." />
      ) : (
        <Table head={["تصویر", "نام", "عنوان", "نمایش", "عملیات"]}>
          {data.map((l) => {
            return (
              <tr key={l.id} className="hover:bg-sand-2">
                <td className="px-4 py-2.5">
                  {l.portrait ? (
                    <img
                      src={`/api/v1/media/file/${l.portrait.stored_name}`}
                      alt={l.name}
                      className="h-10 w-10 rounded-full object-cover"
                    />
                  ) : l.portrait_path ? (
                    <img src={l.portrait_path} alt={l.name} className="h-10 w-10 rounded-full object-cover" />
                  ) : (
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-sand-1 text-[13px] text-ink-1/50">
                      {l.name.slice(0, 1)}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 font-medium">{l.name}</td>
                <td className="px-4 py-3 text-ink-1/70">{l.title}</td>
                <td className="px-4 py-3">
                  <button
                    className={`flex items-center gap-1.5 text-[13px] ${l.is_visible ? "text-emerald-600" : "text-ink-1/50"}`}
                    onClick={() => toggle.mutate(l)}
                  >
                    {l.is_visible ? <Eye size={14} /> : <EyeOff size={14} />}
                    {l.is_visible ? "نمایان" : "پنهان"}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1.5">
                    <Link to={`/content/lawyers/${l.id}`} className="btn-ghost btn-sm">
                      <Pencil size={13} /> ویرایش
                    </Link>
                    <button className="btn-ghost btn-sm !text-red-600" onClick={() => setConfirmDelete(l)}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </Table>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title={`حذف «${confirmDelete?.name}»؟`}
        body="این عمل قابل بازگشت نیست. اگر فقط می‌خواهید در سایت دیده نشود، گزینهٔ «پنهان» را استفاده کنید."
        danger
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && del.mutate(confirmDelete.id)}
      />
    </div>
  );
}
