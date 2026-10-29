import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { ToastProvider } from "../components/ui";
import AppLayout from "../layouts/AppLayout";
import { AuthProvider, useAuth } from "../stores/auth";
import { PageSkeleton } from "../components/ui";
import type { ReactNode } from "react";

import ContentHubPage from "../pages/ContentHubPage";
import DashboardPage from "../pages/DashboardPage";
import LawyerEditPage from "../pages/LawyerEditPage";
import LoginPage from "../pages/LoginPage";
import MarketingHubPage from "../pages/MarketingHubPage";
import PageEditPage from "../pages/PageEditPage";
import RequestDetailPage from "../pages/RequestDetailPage";
import RequestsHubPage from "../pages/RequestsHubPage";
import SystemHubPage from "../pages/SystemHubPage";
import UsersHubPage from "../pages/UsersHubPage";

const qc = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 15_000 },
  },
});

const REQUEST_ROLES = ["super_admin", "admin", "support"];

const STAFF_ROLES = ["super_admin", "admin", "editor", "support"];

function Protected({ children }: { children: ReactNode }) {
  const { user, loading, hasRole } = useAuth();
  if (loading) return <div className="p-8"><PageSkeleton /></div>;
  if (!user) return <Navigate to="/login" replace />;
  // کاربر عادی اینجا جایی ندارد — به پنل کاربری برمی‌گردد
  if (!hasRole(...STAFF_ROLES)) {
    window.location.assign("/panel");
    return null;
  }
  return <>{children}</>;
}

function RoleGate({ roles, children }: { roles: string[]; children: ReactNode }) {
  const { hasRole } = useAuth();
  if (!hasRole(...roles)) {
    return (
      <div className="card p-10 text-center text-sm text-ink-1/70">
        دسترسی کافی برای این بخش ندارید.
      </div>
    );
  }
  return <>{children}</>;
}

/** ریدایرکت legacy با حفظ پارامتر روت (/:slug و /:id). */
function ParamRedirect({ to }: { to: string }) {
  const p = useParams();
  const target = to
    .replace(":slug", p.slug ?? "")
    .replace(":id", p.id ?? "")
    .replace(/\/$/, "");
  return <Navigate to={target} replace />;
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <ToastProvider>
          <BrowserRouter basename="/admin">
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route
                element={
                  <Protected>
                    <AppLayout />
                  </Protected>
                }
              >
                <Route index element={<DashboardPage />} />

                {/* ۶ آیتم سایدبار — همهٔ محتوا داخل تب‌های هر هاب */}
                <Route
                  path="requests"
                  element={<RoleGate roles={REQUEST_ROLES}><RequestsHubPage /></RoleGate>}
                />
                <Route
                  path="requests/:type/:id"
                  element={<RoleGate roles={REQUEST_ROLES}><RequestDetailPage /></RoleGate>}
                />
                <Route
                  path="users"
                  element={<RoleGate roles={["super_admin"]}><UsersHubPage /></RoleGate>}
                />
                <Route
                  path="marketing"
                  element={<RoleGate roles={["super_admin"]}><MarketingHubPage /></RoleGate>}
                />
                <Route
                  path="content"
                  element={<RoleGate roles={["super_admin", "admin", "editor"]}><ContentHubPage /></RoleGate>}
                />
                <Route
                  path="content/pages/:slug"
                  element={<RoleGate roles={["super_admin", "admin", "editor"]}><PageEditPage /></RoleGate>}
                />
                <Route
                  path="content/lawyers/:id"
                  element={<RoleGate roles={["super_admin", "admin", "editor"]}><LawyerEditPage /></RoleGate>}
                />
                <Route
                  path="system"
                  element={<RoleGate roles={["super_admin", "admin"]}><SystemHubPage /></RoleGate>}
                />

                {/* legacy redirects → hub tabs */}
                <Route path="inbox" element={<Navigate to="/requests" replace />} />
                <Route path="requests/consultations" element={<Navigate to="/requests?tab=consultations" replace />} />
                <Route path="requests/contacts" element={<Navigate to="/requests?tab=contacts" replace />} />
                <Route path="requests/tickets" element={<Navigate to="/requests?tab=tickets" replace />} />
                <Route path="labels" element={<Navigate to="/requests?tab=labels" replace />} />
                <Route path="marketers" element={<Navigate to="/marketing" replace />} />
                <Route path="settings" element={<Navigate to="/content?tab=site" replace />} />
                <Route path="settings/:tab" element={<Navigate to="/content?tab=site" replace />} />
                <Route path="ai" element={<Navigate to="/system?tab=ai" replace />} />
                <Route path="ai/conversations" element={<Navigate to="/system?tab=conversations" replace />} />
                <Route path="audit" element={<Navigate to="/system?tab=audit" replace />} />
                <Route path="pages" element={<Navigate to="/content?tab=pages" replace />} />
                <Route path="pages/:slug" element={<ParamRedirect to="/content/pages/:slug" />} />
                <Route path="media" element={<Navigate to="/content?tab=media" replace />} />
                <Route path="lawyers" element={<Navigate to="/content?tab=lawyers" replace />} />
                <Route path="lawyers/:id" element={<ParamRedirect to="/content/lawyers/:id" />} />
                <Route path="consultations" element={<Navigate to="/requests?tab=consultations" replace />} />
                <Route path="tickets" element={<Navigate to="/requests?tab=tickets" replace />} />

                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
