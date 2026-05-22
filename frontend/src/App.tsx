import { Route, Routes } from "react-router-dom";
import { PackageListPage } from "./pages/PackageListPage";

function App() {
  return (
    <Routes>
      <Route path="/" element={<PackageListPage />} />
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
