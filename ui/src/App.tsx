import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./lib/auth-context";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { LoginPage } from "./pages/auth/LoginPage";
import OnboardingPage from "./pages/onboarding/OnboardingPage";
import AppShell from "./pages/app/AppShell";
import LooksPage from "./pages/looks/LooksPage";
import LookDetailPage from "./pages/looks/LookDetailPage";
import GarmentDetailPage from "./pages/looks/GarmentDetailPage";
import WorkspacesPage from "./pages/workspaces/WorkspacesPage";
import WorkspaceCanvas from "./pages/workspaces/WorkspaceCanvas";
import { TrendsPage } from "./pages/trends/TrendsPage";
import ElementTrendPage from "./pages/trends/ElementTrendPage";
import CategoryTrendPage from "./pages/trends/CategoryTrendPage";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/app" element={<AppShell />}>
              <Route index element={<Navigate to="/app/looks" replace />} />
              <Route path="looks" element={<LooksPage />} />
              <Route path="looks/:lookId" element={<LookDetailPage />} />
              <Route path="looks/:lookId/garment/:garmentId" element={<GarmentDetailPage />} />
              <Route path="workspaces" element={<WorkspacesPage />} />
              <Route path="workspace/:id" element={<WorkspaceCanvas />} />
              <Route path="trends" element={<TrendsPage />} />
              <Route path="trends/retail/element" element={<ElementTrendPage />} />
              <Route path="trends/retail/:garmentType" element={<CategoryTrendPage />} />
            </Route>
          </Route>
          <Route path="/" element={<Navigate to="/app/looks" replace />} />
          <Route path="*" element={<Navigate to="/app/looks" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
