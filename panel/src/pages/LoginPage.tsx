import { zodResolver } from "@hookform/resolvers/zod";
import { Scale } from "lucide-react";
import { useForm } from "react-hook-form";
import { Navigate, useNavigate } from "react-router-dom";
import { z } from "zod";
import { ApiError } from "../services/api";
import { useAuth } from "../stores/auth";

const schema = z.object({
  username: z.string().min(3, "نام کاربری را وارد کنید."),
  password: z.string().min(1, "رمز عبور را وارد کنید."),
});
type FormData = z.infer<typeof schema>;

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  if (user) return <Navigate to="/" replace />;

  const onSubmit = async (data: FormData) => {
    try {
      await login(data.username, data.password);
      navigate("/", { replace: true });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "خطا در ورود؛ دوباره تلاش کنید.";
      setError("root", { message: msg });
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-sand-0 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gold-1/15 text-gold-2">
            <Scale size={26} />
          </span>
          <h1 className="text-lg font-semibold text-white">پنل مدیریت دادنوین</h1>
          <p className="mt-1 text-[13px] text-ink-1/50">
            برای ادامه وارد حساب مدیریت شوید
          </p>
        </div>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="card space-y-4 !bg-sand-1 !border-sand-2 p-6"
        >
          <div>
            <label className="!text-ink-1/80">نام کاربری</label>
            <input
              type="text"
              dir="ltr"
              autoComplete="username"
              className="!bg-sand-0 !border-sand-2 !text-ink-0"
              {...register("username")}
            />
            {errors.username && <p className="field-error">{errors.username.message}</p>}
          </div>
          <div>
            <label className="!text-ink-1/80">رمز عبور</label>
            <input
              type="password"
              dir="ltr"
              autoComplete="current-password"
              className="!bg-sand-0 !border-sand-2 !text-ink-0"
              {...register("password")}
            />
            {errors.password && (
              <p className="field-error">{errors.password.message}</p>
            )}
          </div>
          {errors.root && (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-[13px] text-red-400">
              {errors.root.message}
            </p>
          )}
          <button type="submit" className="btn-gold w-full" disabled={isSubmitting}>
            {isSubmitting ? "در حال ورود…" : "ورود به پنل"}
          </button>
        </form>
        <p className="mt-5 text-center text-[11px] text-ink-1/40">
          گروه حقوقی دادنوین — مشهد
        </p>
      </div>
    </div>
  );
}
