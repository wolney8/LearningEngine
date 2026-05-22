import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { PackageCard } from "../components/PackageCard";
import type { PackageSummary } from "../schemas/package";
import { fetchPackages } from "../services/api";
import "./PackageListPage.css";
import { useStreak } from "../hooks/useStreak";

export function PackageListPage() {
  const navigate = useNavigate();
  const { dailyStreak } = useStreak();
  const [packages, setPackages] = useState<PackageSummary[]>([]);
  const [status, setStatus] = useState<"loading" | "error" | "loaded">("loading");

  const loadPackages = useCallback(async () => {
    setStatus("loading");
    try {
      const fetchedPackages = await fetchPackages();
      setPackages(fetchedPackages);
      setStatus("loaded");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void loadPackages();
  }, [loadPackages]);

  return (
    <main className="package-list-page">
      <h1>Local Learning Engine</h1>
      <p className="package-list-page__subtitle">Pick a package to start learning</p>
      {dailyStreak > 0 && (
        <p
          className="package-list-page__streak"
          aria-label={`${dailyStreak} day streak`}
        >
          🔥 {dailyStreak} {dailyStreak === 1 ? "day" : "days"} streak
        </p>
      )}

      {status === "loading" && (
        <p aria-live="polite" aria-busy="true">
          Loading packages…
        </p>
      )}

      {status === "error" && (
        <>
          <p>Could not load packages. Make sure the backend is running.</p>
          <button type="button" onClick={() => void loadPackages()}>
            Retry
          </button>
        </>
      )}

      {status === "loaded" && packages.length === 0 && <p>No packages available.</p>}

      {status === "loaded" && packages.length > 0 && (
        <section className="package-list-page__grid" aria-label="Available packages">
          {packages.map((pkg) => (
            <PackageCard
              key={pkg.id}
              pkg={pkg}
              onClick={() => navigate(`/packages/${pkg.id}`)}
            />
          ))}
        </section>
      )}
    </main>
  );
}
