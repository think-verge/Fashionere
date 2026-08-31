import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth-context";
import OnboardingPage from "./pages/onboarding/OnboardingPage";
import LoginPage from "./pages/auth/LoginPage";
import AppShell from "./pages/app/AppShell";
import LooksPage from "./pages/looks/LooksPage";
import LookDetailPage from "./pages/looks/LookDetailPage";
import WorkspacesPage from "./pages/workspaces/WorkspacesPage";
import WorkspaceCanvas from "./pages/workspaces/WorkspaceCanvas";
import { ReactNode } from "react";

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="flex items-center justify-center h-screen text-sm text-raisin/50">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/onboarding" element={<OnboardingPage />} />
      <Route
        path="/app"
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/app/looks" replace />} />
        <Route path="looks" element={<LooksPage />} />
        <Route path="looks/:lookId" element={<LookDetailPage />} />
        <Route path="workspaces" element={<WorkspacesPage />} />
        <Route path="workspace/:id" element={<WorkspaceCanvas />} />
      </Route>
      <Route path="/" element={<Navigate to="/app/looks" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
