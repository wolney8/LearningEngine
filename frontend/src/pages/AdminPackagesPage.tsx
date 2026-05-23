import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";

import type { PackageSummary } from "../schemas/package";
import {
  clearAdminToken,
  fetchAdminPackages,
  getAdminToken,
  updateAdminPackage,
} from "../services/api";
import "./AdminSettingsPage.css";

export function AdminPackagesPage() {
  const token = useMemo(() => getAdminToken(), []);
  const [packages, setPackages] = useState<PackageSummary[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    if (!token) {
      return;
    }

    const load = async () => {
      try {
        const data = await fetchAdminPackages(token);
        setPackages(data);
        setStatus("ready");
      } catch {
        setStatus("error");
      }
    };

    void load();
  }, [token]);

  if (!token) {
    return <Navigate to="/admin" replace />;
  }

  async function toggleEnabled(pkg: PackageSummary) {
    try {
      const updated = await updateAdminPackage(token, pkg.id, {
        enabled: !pkg.enabled,
      });
      setPackages((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch {
      setStatus("error");
    }
  }

  async function setThreshold(pkg: PackageSummary, value: string) {
    const parsed = value.trim() === "" ? null : Number.parseInt(value, 10);
    if (parsed !== null && Number.isNaN(parsed)) {
      return;
    }

    try {
      const updated = await updateAdminPackage(token, pkg.id, {
        xp_threshold: parsed,
      });
      setPackages((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch {
      setStatus("error");
    }
  }

  return (
    <main className="admin-page">
      <header className="admin-page__header">
        <h1>Admin Packages</h1>
        <nav aria-label="Admin navigation">
          <Link to="/admin/settings">Settings</Link>
          <Link to="/admin/packages">Packages</Link>
          <button
            type="button"
            onClick={() => {
              clearAdminToken();
              location.assign("/admin");
            }}
          >
            Sign out
          </button>
        </nav>
      </header>

      {status === "loading" && <p aria-busy="true">Loading packages…</p>}
      {status === "error" && <p role="alert">Could not load or update packages.</p>}

      {status === "ready" && (
        <section className="admin-page__panel" aria-label="Package admin controls">
          <ul className="admin-page__list">
            {packages.map((pkg) => (
              <li key={pkg.id} className="admin-page__list-item">
                <div>
                  <h2>{pkg.title}</h2>
                  <p>{pkg.description}</p>
                  <small>ID: {pkg.id}</small>
                </div>
                <div className="admin-page__inline-actions">
                  <button type="button" onClick={() => void toggleEnabled(pkg)}>
                    {pkg.enabled ? "Disable" : "Enable"}
                  </button>
                  <label>
                    XP threshold
                    <input
                      type="number"
                      min="0"
                      defaultValue={pkg.xp_threshold ?? ""}
                      onBlur={(event) => void setThreshold(pkg, event.target.value)}
                    />
                  </label>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
