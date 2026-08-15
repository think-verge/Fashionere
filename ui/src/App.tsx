import { Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { LoginPage } from "./pages/auth/LoginPage";
import { SignupPage } from "./pages/auth/SignupPage";
import { DashboardPage } from "./pages/dashboard/DashboardPage";
import { LooksPage } from "./pages/looks/LooksPage";
import { LookDetailPage } from "./pages/looks/LookDetailPage";
import { TrendsPage } from "./pages/trends/TrendsPage";
import { TrendGeneratePage } from "./pages/trends/TrendGeneratePage";
import { TrendDetailPage } from "./pages/trends/TrendDetailPage";
import { CostCalculatorPage } from "./pages/cost-calculator/CostCalculatorPage";
import { ProjectsPage } from "./pages/projects/ProjectsPage";
import { SettingsPage } from "./pages/settings/SettingsPage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/looks" element={<LooksPage />} />
        <Route path="/looks/:lookId" element={<LookDetailPage />} />
        <Route path="/trends" element={<TrendsPage />} />
        <Route path="/trends/generate" element={<TrendGeneratePage />} />
        <Route path="/trends/:brandSlug" element={<TrendDetailPage />} />
        <Route path="/cost-calculator" element={<CostCalculatorPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
