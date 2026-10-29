import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { ToastProvider } from "../components/ui";
import AppLayout from "../layouts/AppLayout";
import { AuthProvider, useAuth } from "../stores/auth";
import { PageSkeleton } from "../components/ui";
import type { ReactNode } from "react";

import AiPage from "../pages/AiPage";
import ArticlesPage from "../pages/ArticlesPage";
import AuditPage from "../pages/AuditPage";
import ConversationsPage from "../pages/ConversationsPage";
import DashboardPage from "../pages/DashboardPage";
import InboxPage from "../pages/InboxPage";
import LabelsPage from "../pages/LabelsPage";
import LawyerEditPage from "../pages/LawyerEditPage";
import LawyersPage from "../pages/LawyersPage";
import LoginPage from "../pages/LoginPage";
import MarketersPage from "../pages/MarketersPage";
import MediaPage from "../pages/MediaPage";
import PageEditPage from "../pages/PageEditPage";
import PagesPage from "../pages/PagesPage";
import RequestDetailPage from "../pages/RequestDetailPage";
import SettingsPage from "../pages/SettingsPage";
import UsersPage from "../pages/UsersPage";

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

function SettingsTabRoute() {
  const { tab } = useParams();
  return <SettingsPage key={tab} tab={tab} />;
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

                {/* unified request operations */}
                <Route path="inbox" element={<RoleGate roles={REQUEST_ROLES}><InboxPage /></RoleGate>} />
                <Route path="requests/consultations" element={<RoleGate roles={REQUEST_ROLES}><InboxPage fixedType="consultation" title="درخواست‌های مشاوره" subtitle="فرم‌های مشاورهٔ ثبت‌شده از سایت" /></RoleGate>} />
                <Route path="requests/contacts" element={<RoleGate roles={REQUEST_ROLES}><InboxPage fixedType="contact" title="درخواست‌های تماس" subtitle="تماس‌ها و درخواست‌های تماس مجدد" /></RoleGate>} />
                <Route path="requests/tickets" element={<RoleGate roles={REQUEST_ROLES}><InboxPage fixedType="ticket" title="تیکت‌ها" subtitle="تیکت‌های پشتیبانی مشتریان" /></RoleGate>} />
                <Route path="requests/:type/:id" element={<RoleGate roles={REQUEST_ROLES}><RequestDetailPage /></RoleGate>} />

                {/* content management */}
                <Route path="content/pages" element={<RoleGate roles={["super_admin", "admin", "editor"]}><PagesPage /></RoleGate>} />
                <Route path="content/pages/:slug" element={<RoleGate roles={["super_admin", "admin", "editor"]}><PageEditPage /></RoleGate>} />
                <Route path="content/articles" element={<RoleGate roles={["super_admin", "admin", "editor"]}><ArticlesPage /></RoleGate>} />
                <Route path="content/lawyers" element={<RoleGate roles={["super_admin", "admin", "editor"]}><LawyersPage /></RoleGate>} />
                <Route path="content/lawyers/:id" element={<RoleGate roles={["super_admin", "admin", "editor"]}><LawyerEditPage /></RoleGate>} />
                <Route path="content/media" element={<RoleGate roles={["super_admin", "admin", "editor"]}><MediaPage /></RoleGate>} />

                {/* settings */}
                <Route path="settings" element={<RoleGate roles={["super_admin", "admin", "editor"]}><SettingsPage /></RoleGate>} />
                <Route path="settings/:tab" element={<RoleGate roles={["super_admin", "admin", "editor"]}><SettingsTabRoute /></RoleGate>} />

                {/* system */}
                <Route path="labels" element={<RoleGate roles={REQUEST_ROLES}><LabelsPage /></RoleGate>} />
                <Route path="ai" element={<RoleGate roles={["super_admin", "admin"]}><AiPage /></RoleGate>} />
                <Route path="ai/conversations" element={<RoleGate roles={["super_admin", "admin"]}><ConversationsPage /></RoleGate>} />
                <Route path="marketers" element={<RoleGate roles={["super_admin"]}><MarketersPage /></RoleGate>} />
                <Route path="users" element={<RoleGate roles={["super_admin"]}><UsersPage /></RoleGate>} />
                <Route path="audit" element={<RoleGate roles={["super_admin", "admin"]}><AuditPage /></RoleGate>} />

                {/* legacy redirects */}
                <Route path="pages" element={<Navigate to="/content/pages" replace />} />
                <Route path="pages/:slug" element={<Navigate to="/content/pages" replace />} />
                <Route path="media" element={<Navigate to="/content/media" replace />} />
                <Route path="lawyers" element={<Navigate to="/content/lawyers" replace />} />
                <Route path="lawyers/:id" element={<Navigate to="/content/lawyers" replace />} />
                <Route path="consultations" element={<Navigate to="/requests/consultations" replace />} />
                <Route path="tickets" element={<Navigate to="/requests/tickets" replace />} />

                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
