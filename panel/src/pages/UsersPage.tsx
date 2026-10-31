/** User management — super_admin only. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, UserX, UserCheck } from "lucide-react";
import { useState } from "react";
import { api } from "../services/api";
import type { RoleOut, UserOut } from "../types/api";
import { ConfirmDialog, Field, PageSkeleton, Table, fmtDate, useToast } from "../components/ui";
import { useAuth } from "../stores/auth";

const ROLE_FA: Record<string, string> = {
  super_admin: "مدیر ارشد",
  admin: "مدیر",
  editor: "ویرایشگر محتوا",
  support: "پشتیبان",
};

export default function UsersPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { user: me } = useAuth();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ username: "", email: "", password: "", full_name: "", roles: [] as number[] });
  const [deactivate, setDeactivate] = useState<UserOut | null>(null);

  const { data: users, isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => api.get<UserOut[]>("/admin/users"),
  });
  const { data: roles } = useQuery({
    queryKey: ["admin-roles"],
    queryFn: () => api.get<RoleOut[]>("/admin/users/roles"),
  });

  const create = useMutation({
    mutationFn: () =>
      api.post("/admin/users", {
        username: form.username,
        email: form.email,
        password: form.password,
        full_name: form.full_name,
        role_ids: form.roles,
      }),
    onSuccess: () => {
      setAdding(false);
      setForm({ username: "", email: "", password: "", full_name: "", roles: [] });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast("success", "کاربر ایجاد شد.");
    },
    onError: (e) => toast("error", e instanceof Error ? e.message : "خطا"),
  });

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: object }) => api.patch(`/admin/users/${id}`, body),
    onSuccess: () => {
      setDeactivate(null);
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast("success", "به‌روزرسانی شد.");
    },
    onError: (e) => toast("error", e instanceof Error ? e.message : "خطا"),
  });

  if (isLoading || !users) return <PageSkeleton />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">کاربران و دسترسی‌ها</h1>
          <p className="mt-0.5 text-[13px] text-ink-1/60">فقط مدیر ارشد به این بخش دسترسی دارد</p>
        </div>
        <button className="btn-gold" onClick={() => setAdding((v) => !v)}>
          <Plus size={16} /> کاربر جدید
        </button>
      </div>

      {adding && (
        <div className="card space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Field label="نام کاربری">
              <input
                dir="ltr"
                autoComplete="off"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
              />
            </Field>
            <Field label="ایمیل (اختیاری)">
              <input
                dir="ltr"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </Field>
            <Field label="نام کامل">
              <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </Field>
            <Field label="رمز عبور (حداقل ۱۰ کاراکتر، حرف+عدد)">
              <input
                dir="ltr"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </Field>
          </div>
          <div>
            <label>نقش‌ها</label>
            <div className="flex flex-wrap gap-2">
              {roles?.map((r) => (
                <label
                  key={r.id}
                  className="flex items-center gap-1.5 rounded-lg border border-sand-2 px-3 py-1.5 text-[13px]"
                >
                  <input
                    type="checkbox"
                    className="!w-3.5"
                    checked={form.roles.includes(r.id)}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        roles: e.target.checked ? [...form.roles, r.id] : form.roles.filter((x) => x !== r.id),
                      })
                    }
                  />
                  {ROLE_FA[r.name] ?? r.name}
                </label>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn-ghost btn-sm" onClick={() => setAdding(false)}>
              انصراف
            </button>
            <button
              className="btn-primary btn-sm"
              disabled={
                form.username.length < 3 || form.password.length < 10 || form.roles.length === 0 || create.isPending
              }
              onClick={() => create.mutate()}
            >
              ایجاد کاربر
            </button>
          </div>
        </div>
      )}

      <Table head={["کاربر", "نقش‌ها", "وضعیت", "عضویت", "عملیات"]}>
        {users.map((u) => (
          <tr key={u.id} className="hover:bg-sand-2">
            <td className="px-4 py-3">
              <p className="font-medium">{u.full_name || "—"}</p>
              <p className="text-[12px] text-ink-1/50" dir="ltr">
                @{u.username}
                {u.email ? ` · ${u.email}` : ""}
              </p>
            </td>
            <td className="px-4 py-3">
              <div className="flex flex-wrap gap-1">
                {u.roles.map((r) => (
                  <span key={r.id} className="rounded-full bg-sand-1 px-2 py-0.5 text-[11px] text-ink-1">
                    {ROLE_FA[r.name] ?? r.name}
                  </span>
                ))}
              </div>
            </td>
            <td className="px-4 py-3">
              <span className={`text-[12px] font-medium ${u.is_active ? "text-emerald-400" : "text-red-400"}`}>
                {u.is_active ? "فعال" : "غیرفعال"}
              </span>
            </td>
            <td className="px-4 py-3 text-[12px] text-ink-1/50">{fmtDate(u.created_at)}</td>
            <td className="px-4 py-3">
              {u.id !== me?.id && (
                <button
                  className={`btn-ghost btn-sm ${u.is_active ? "!text-red-400" : ""}`}
                  onClick={() =>
                    u.is_active ? setDeactivate(u) : patch.mutate({ id: u.id, body: { is_active: true } })
                  }
                >
                  {u.is_active ? (
                    <>
                      <UserX size={13} /> غیرفعال
                    </>
                  ) : (
                    <>
                      <UserCheck size={13} /> فعال
                    </>
                  )}
                </button>
              )}
            </td>
          </tr>
        ))}
      </Table>

      <ConfirmDialog
        open={!!deactivate}
        title={`غیرفعال‌سازی «${deactivate?.full_name || deactivate?.username}»؟`}
        body="کاربر دیگر نمی‌تواند وارد شود و نشست‌های فعال‌اش باطل می‌شود."
        danger
        onCancel={() => setDeactivate(null)}
        onConfirm={() => deactivate && patch.mutate({ id: deactivate.id, body: { is_active: false } })}
      />
    </div>
  );
}
