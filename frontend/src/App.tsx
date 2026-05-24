import { Route, Routes } from "react-router-dom";
import { AdminGuard } from "./components/AdminGuard";
import { AuthProvider } from "./context/AuthContext";
import { useAuth } from "./hooks/useAuth";
import { AdminPackagesPage } from "./pages/AdminPackagesPage";
import { AdminSettingsPage } from "./pages/AdminSettingsPage";
import { LessonPage } from "./pages/LessonPage";
import { LoginPage } from "./pages/LoginPage";
import { PackageListPage } from "./pages/PackageListPage";
import { RegisterPage } from "./pages/RegisterPage";
import { TestModePage } from "./pages/TestModePage";

function AppRoutes() {
  const { status } = useAuth();

  return (
    <div data-auth-status={status}>
      <Routes>
        <Route path="/" element={<PackageListPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/admin" element={<AdminGuard />} />
        <Route path="/admin/settings" element={<AdminSettingsPage />} />
        <Route path="/admin/packages" element={<AdminPackagesPage />} />
        <Route path="/packages/:id" element={<LessonPage />} />
        <Route path="/test/exam/:id" element={<TestModePage />} />
        {/* TODO Phase 6+: /test/practice/:id - Practice Mode */}
        <Route
          path="*"
          element={
            <main style={{ padding: "2rem", textAlign: "center" }}>
              <h1>Page not found</h1>
              <p>The page you are looking for does not exist.</p>
            </main>
          }
        />
      </Routes>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}

export default App;
