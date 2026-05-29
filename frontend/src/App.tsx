import { useEffect, useRef, useState } from "react";
import { Route, Routes } from "react-router-dom";
import { AdminGuard } from "./components/AdminGuard";
import { AppTopBar } from "./components/AppTopBar";
import { LevelUpOverlay } from "./components/LevelUpOverlay";
import { AuthProvider } from "./context/AuthContext";
import { XPProvider } from "./context/XPContext";
import { useAuth } from "./hooks/useAuth";
import { useXP } from "./hooks/useXP";
import { AdminPackagesPage } from "./pages/AdminPackagesPage";
import { AdminSettingsPage } from "./pages/AdminSettingsPage";
import { LessonPage } from "./pages/LessonPage";
import { LoginPage } from "./pages/LoginPage";
import { PackageListPage } from "./pages/PackageListPage";
import { RegisterPage } from "./pages/RegisterPage";
import { TestModePage } from "./pages/TestModePage";
import "./App.css";

function AppRoutes() {
  const { status, user } = useAuth();
  const { xp, levelProgress, lastChangeKind } = useXP();
  const [levelUpState, setLevelUpState] = useState<{
    level: number;
    totalXP: number;
  } | null>(null);
  const previousLevelRef = useRef<number | null>(null);
  const announcedLevelRef = useRef<number>(0);
  const authBoundaryKey =
    status === "authenticated" && user ? `auth-${user.id}` : "anonymous";

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
      <AppTopBar xp={xp} levelProgress={levelProgress} />
      <LevelUpOverlay
        isOpen={levelUpState != null}
        level={levelUpState?.level ?? levelProgress.level}
        totalXP={levelUpState?.totalXP ?? xp}
        onDismiss={() => setLevelUpState(null)}
      />
      <main className="app-shell__content">
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
      </main>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <XPProvider>
        <AppRoutes />
      </XPProvider>
    </AuthProvider>
  );
}

export default App;
