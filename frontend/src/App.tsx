import { Route, Routes } from "react-router-dom";
import { LessonPage } from "./pages/LessonPage";
import { PackageListPage } from "./pages/PackageListPage";
import { TestModePage } from "./pages/TestModePage";

function App() {
  return (
    <Routes>
      <Route path="/" element={<PackageListPage />} />
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
  );
}

export default App;
