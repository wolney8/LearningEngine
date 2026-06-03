import { useEffect, useRef, useState } from "react";
import { Route, Routes } from "react-router-dom";
import { AdminGuard } from "./components/AdminGuard";
import { AppTopBar } from "./components/AppTopBar";
import { LevelUpOverlay } from "./components/LevelUpOverlay";
import { Toast } from "./components/Toast";
import { AuthProvider } from "./context/AuthContext";
import { ToastProvider, useToastContext } from "./context/ToastContext";
import { XPProvider } from "./context/XPContext";
import { useAuth } from "./hooks/useAuth";
import { useInactivityLogout } from "./hooks/useInactivityLogout";
import { useTheme } from "./hooks/useTheme";
import { useXP } from "./hooks/useXP";
import { AdminAuditLogsPage } from "./pages/AdminAuditLogsPage";
import { AdminPackagesPage } from "./pages/AdminPackagesPage";
import { AdminSettingsPage } from "./pages/AdminSettingsPage";
import { AdminUsersPage } from "./pages/AdminUsersPage";
import { LessonPage } from "./pages/LessonPage";
import { LoginPage } from "./pages/LoginPage";
import { PackageListPage } from "./pages/PackageListPage";
import { ProfilePage } from "./pages/ProfilePage";
import { RegisterPage } from "./pages/RegisterPage";
import { TestModePage } from "./pages/TestModePage";
import "./App.css";

function GlobalToastRegion() {
  const { toasts, dismissToast } = useToastContext();

  return <Toast toasts={toasts} onDismiss={dismissToast} />;
}

function AppRoutes() {
  const { status, user, logout } = useAuth();
  const { xp, levelProgress, lastChangeKind } = useXP();
  const { resolvedTheme, setMode: setThemeMode } = useTheme();
  const [levelUpState, setLevelUpState] = useState<{
    level: number;
    totalXP: number;
  } | null>(null);
  const previousLevelRef = useRef<number | null>(null);
  const announcedLevelRef = useRef<number>(0);
  const authBoundaryKey =
    status === "authenticated" && user ? `auth-${user.id}` : "anonymous";

  useInactivityLogout(status === "authenticated", logout);

  useEffect(() => {
    if (previousLevelRef.current == null) {
      previousLevelRef.current = levelProgress.level;
      return;
    }

    if (lastChangeKind !== "add") {
      previousLevelRef.current = levelProgress.level;
      return;
    }

    if (
      levelProgress.level > previousLevelRef.current &&
      announcedLevelRef.current < levelProgress.level
    ) {
      announcedLevelRef.current = levelProgress.level;
      setLevelUpState({ level: levelProgress.level, totalXP: xp });
    }

    previousLevelRef.current = levelProgress.level;
  }, [lastChangeKind, levelProgress.level, xp]);

  return (
    <div className="app-shell" key={authBoundaryKey} data-auth-status={status}>
      <AppTopBar
        xp={xp}
        levelProgress={levelProgress}
        resolvedTheme={resolvedTheme}
        onThemeModeChange={(nextMode) => {
          setThemeMode(nextMode);
        }}
      />
      <LevelUpOverlay
        isOpen={levelUpState != null}
        level={levelUpState?.level ?? levelProgress.level}
        totalXP={levelUpState?.totalXP ?? xp}
        onDismiss={() => setLevelUpState(null)}
      />
      <main className="app-shell__content">
        <Routes>
          <Route path="/" element={<PackageListPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/admin" element={<AdminGuard />} />
          <Route path="/admin/settings" element={<AdminSettingsPage />} />
          <Route path="/admin/packages" element={<AdminPackagesPage />} />
          <Route path="/admin/users" element={<AdminUsersPage />} />
          <Route path="/admin/audit-logs" element={<AdminAuditLogsPage />} />
          <Route path="/packages/:id" element={<LessonPage />} />
          <Route path="/test/exam/:id" element={<TestModePage />} />
          <Route path="/test/practice/:id" element={<TestModePage />} />
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
      </main>
      <GlobalToastRegion />
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <XPProvider>
        <ToastProvider>
          <AppRoutes />
        </ToastProvider>
      </XPProvider>
    </AuthProvider>
  );
}

export default App;
