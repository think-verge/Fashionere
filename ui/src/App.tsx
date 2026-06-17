import { Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { LoginPage } from "./pages/auth/LoginPage";
import { SignupPage } from "./pages/auth/SignupPage";
import { DashboardPage } from "./pages/dashboard/DashboardPage";
import { StudioPage } from "./pages/studio/StudioPage";
import { MoodboardsPage } from "./pages/moodboards/MoodboardsPage";
import { MoodboardDetailPage } from "./pages/moodboards/MoodboardDetailPage";
import { TrendsPage } from "./pages/trends/TrendsPage";
import { CataloguePage } from "./pages/catalogue/CataloguePage";
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
        <Route path="/studio" element={<StudioPage />} />
        <Route path="/moodboards" element={<MoodboardsPage />} />
        <Route path="/moodboards/:id" element={<MoodboardDetailPage />} />
        <Route path="/trends" element={<TrendsPage />} />
        <Route path="/catalogue" element={<CataloguePage />} />
        <Route path="/cost-calculator" element={<CostCalculatorPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
