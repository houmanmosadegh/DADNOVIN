import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ToastProvider } from "../components/ui";
import AppLayout from "../layouts/AppLayout";
import { AuthProvider, useAuth } from "../stores/auth";
import { PageSkeleton } from "../components/ui";
import type { ReactNode } from "react";

import AiPage from "../pages/AiPage";
import AuditPage from "../pages/AuditPage";
import ConsultationDetailPage from "../pages/ConsultationDetailPage";
import ConsultationsPage from "../pages/ConsultationsPage";
import ConversationsPage from "../pages/ConversationsPage";
import DashboardPage from "../pages/DashboardPage";
import LawyerEditPage from "../pages/LawyerEditPage";
import LawyersPage from "../pages/LawyersPage";
import LoginPage from "../pages/LoginPage";
import MediaPage from "../pages/MediaPage";
import PageEditPage from "../pages/PageEditPage";
import PagesPage from "../pages/PagesPage";
import SettingsPage from "../pages/SettingsPage";
import TicketDetailPage from "../pages/TicketDetailPage";
import TicketsPage from "../pages/TicketsPage";
import UsersPage from "../pages/UsersPage";

const qc = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 15_000 },
  },
});

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8"><PageSkeleton /></div>;
  if (!user) return <Navigate to="/login" replace />;
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

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <ToastProvider>
          <BrowserRouter basename="/panel">
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
                <Route path="pages" element={<RoleGate roles={["super_admin", "admin", "editor"]}><PagesPage /></RoleGate>} />
                <Route path="pages/:slug" element={<RoleGate roles={["super_admin", "admin", "editor"]}><PageEditPage /></RoleGate>} />
                <Route path="media" element={<RoleGate roles={["super_admin", "admin", "editor"]}><MediaPage /></RoleGate>} />
                <Route path="lawyers" element={<RoleGate roles={["super_admin", "admin", "editor"]}><LawyersPage /></RoleGate>} />
                <Route path="lawyers/:id" element={<RoleGate roles={["super_admin", "admin", "editor"]}><LawyerEditPage /></RoleGate>} />
                <Route path="consultations" element={<RoleGate roles={["super_admin", "admin", "support"]}><ConsultationsPage /></RoleGate>} />
                <Route path="consultations/:id" element={<RoleGate roles={["super_admin", "admin", "support"]}><ConsultationDetailPage /></RoleGate>} />
                <Route path="tickets" element={<RoleGate roles={["super_admin", "admin", "support"]}><TicketsPage /></RoleGate>} />
                <Route path="tickets/:id" element={<RoleGate roles={["super_admin", "admin", "support"]}><TicketDetailPage /></RoleGate>} />
                <Route path="settings" element={<RoleGate roles={["super_admin", "admin", "editor"]}><SettingsPage /></RoleGate>} />
                <Route path="ai" element={<AiPage />} />
                <Route path="ai/conversations" element={<ConversationsPage />} />
                <Route path="users" element={<RoleGate roles={["super_admin"]}><UsersPage /></RoleGate>} />
                <Route path="audit" element={<RoleGate roles={["super_admin", "admin"]}><AuditPage /></RoleGate>} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
