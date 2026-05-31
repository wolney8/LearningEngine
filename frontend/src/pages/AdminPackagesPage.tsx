import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";

import { useAuth } from "../hooks/useAuth";
import type { AdminPackageSummary } from "../schemas/package";
import {
  fetchAdminPackages,
  generateAdminPackage,
  publishAdminPackage,
  refreshAdminPackage,
  updateAdminPackage,
} from "../services/api";
import "./AdminSettingsPage.css";

type Availability = "available" | "unavailable" | "hidden";

export function AdminPackagesPage() {
  const { status: authStatus, token, user, logout } = useAuth();
  const canAccess = authStatus === "authenticated" && user?.role === "admin";
  const [packages, setPackages] = useState<AdminPackageSummary[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [publishYAML, setPublishYAML] = useState("");
  const [publishStatus, setPublishStatus] = useState<
    "idle" | "publishing" | "success" | "error"
  >("idle");
  const [generateTopic, setGenerateTopic] = useState("");
  const [generateAudience, setGenerateAudience] = useState("general learners");
  const [generatePages, setGeneratePages] = useState("3");
  const [generateQuestions, setGenerateQuestions] = useState("4");
  const [generateStatus, setGenerateStatus] = useState<
    "idle" | "generating" | "success" | "error"
  >("idle");
  const [generateMessage, setGenerateMessage] = useState("");
  const [refreshingPackageId, setRefreshingPackageId] = useState<string | null>(
    null,
  );
  const [refreshMessage, setRefreshMessage] = useState<string>("");

  useEffect(() => {
    if (!canAccess || !token) {
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
  }, [canAccess, token]);

  if (authStatus === "loading") {
    return (
      <main className="admin-page">
        <p aria-busy="true">Loading…</p>
      </main>
    );
  }

  if (authStatus !== "authenticated") {
    return <Navigate to="/admin" replace />;
  }

  if (!canAccess || !token) {
    return (
      <main className="admin-page">
        <p role="alert">This account does not have admin access.</p>
      </main>
    );
  }

  const adminToken = token;

  async function setAvailability(
    pkg: AdminPackageSummary,
    availability: Availability,
  ) {
    try {
      const updated = await updateAdminPackage(adminToken, pkg.id, {
        availability,
      });
      setPackages((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch {
      setStatus("error");
    }
  }

  async function setThreshold(pkg: AdminPackageSummary, value: string) {
    const parsed = value.trim() === "" ? null : Number.parseInt(value, 10);
    if (parsed !== null && Number.isNaN(parsed)) {
      return;
    }

    try {
      const updated = await updateAdminPackage(adminToken, pkg.id, {
        xp_threshold: parsed,
      });
      setPackages((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch {
      setStatus("error");
    }
  }

  async function handlePublishPackage() {
    if (!publishYAML.trim()) {
      setPublishStatus("error");
      return;
    }

    setPublishStatus("publishing");
    try {
      const created = await publishAdminPackage(adminToken, publishYAML);
      setPackages((current) => [created, ...current]);
      setPublishYAML("");
      setPublishStatus("success");
    } catch {
      setPublishStatus("error");
    }
  }

  async function handleGeneratePackage() {
    const parsedPages = Number.parseInt(generatePages, 10);
    const parsedQuestions = Number.parseInt(generateQuestions, 10);

    if (
      generateTopic.trim().length < 3 ||
      Number.isNaN(parsedPages) ||
      parsedPages < 1 ||
      parsedPages > 10 ||
      Number.isNaN(parsedQuestions) ||
      parsedQuestions < 2 ||
      parsedQuestions > 20
    ) {
      setGenerateStatus("error");
      setGenerateMessage(
        "Enter a topic (3+ chars), pages between 1-10, and questions between 2-20.",
      );
      return;
    }

    setGenerateStatus("generating");
    setGenerateMessage("");
    try {
      const result = await generateAdminPackage(adminToken, {
        topic: generateTopic.trim(),
        audience: generateAudience.trim() || "general learners",
        num_pages: parsedPages,
        num_questions: parsedQuestions,
      });
      setPublishYAML(result.yaml_content);
      setGenerateStatus("success");
      setGenerateMessage(
        "YAML generated and loaded into the publish field for review.",
      );
    } catch (error) {
      setGenerateStatus("error");
      setGenerateMessage(
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : "Could not generate package YAML. Try again.",
      );
    }
  }

  async function handleRefreshPackage(pkg: AdminPackageSummary) {
    setRefreshingPackageId(pkg.id);
    setRefreshMessage("");
    try {
      const result = await refreshAdminPackage(adminToken, pkg.id);
      const nextPackages = await fetchAdminPackages(adminToken);
      setPackages(nextPackages);
      setRefreshMessage(
        `${pkg.id} refreshed: ${result.previous_version} -> ${result.new_version}`,
      );
    } catch (error) {
      setRefreshMessage(
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : `Could not refresh package '${pkg.id}'. Try again.`,
      );
    } finally {
      setRefreshingPackageId(null);
    }
  }

  function formatDate(value: string | null | undefined): string {
    if (!value) {
      return "-";
    }
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) {
      return "-";
    }
    return new Date(parsed).toLocaleString();
  }

  return (
    <main className="admin-page">
      <header className="admin-page__header">
        <h1>Admin Packages</h1>
        <nav aria-label="Admin navigation">
          <Link to="/admin/settings">Settings</Link>
          <Link to="/admin/packages">Packages</Link>
          <Link to="/admin/users">Users</Link>
          <button
            type="button"
            onClick={() => {
              logout();
            }}
          >
            Sign out
          </button>
        </nav>
      </header>

      <section className="admin-page__panel" aria-label="Publish new package">
        <h2>Add new package</h2>
        <div className="admin-page__grid">
          <label className="admin-page__field" htmlFor="generate-topic">
            <span>Topic</span>
            <input
              id="generate-topic"
              type="text"
              value={generateTopic}
              onChange={(event) => setGenerateTopic(event.target.value)}
              placeholder="e.g. Secure file sharing"
            />
          </label>
          <label className="admin-page__field" htmlFor="generate-audience">
            <span>Audience</span>
            <input
              id="generate-audience"
              type="text"
              value={generateAudience}
              onChange={(event) => setGenerateAudience(event.target.value)}
            />
          </label>
          <label className="admin-page__field" htmlFor="generate-pages">
            <span>Pages</span>
            <input
              id="generate-pages"
              type="number"
              min={1}
              max={10}
              value={generatePages}
              onChange={(event) => setGeneratePages(event.target.value)}
            />
          </label>
          <label className="admin-page__field" htmlFor="generate-questions">
            <span>Questions</span>
            <input
              id="generate-questions"
              type="number"
              min={2}
              max={20}
              value={generateQuestions}
              onChange={(event) => setGenerateQuestions(event.target.value)}
            />
          </label>
        </div>
        <div className="admin-page__actions">
          <button
            type="button"
            onClick={() => void handleGeneratePackage()}
            disabled={generateStatus === "generating"}
          >
            {generateStatus === "generating"
              ? "Generating…"
              : "Generate with AI"}
          </button>
          {generateStatus === "success" && generateMessage && (
            <p aria-live="polite">{generateMessage}</p>
          )}
          {generateStatus === "error" && generateMessage && (
            <p role="alert">{generateMessage}</p>
          )}
        </div>
        <label className="admin-page__field" htmlFor="publish-package-yaml">
          <span>YAML package content</span>
          <textarea
            id="publish-package-yaml"
            value={publishYAML}
            onChange={(event) => setPublishYAML(event.target.value)}
            rows={10}
          />
        </label>
        <div className="admin-page__actions">
          <button
            type="button"
            onClick={() => void handlePublishPackage()}
            disabled={publishStatus === "publishing"}
          >
            {publishStatus === "publishing" ? "Publishing…" : "Publish package"}
          </button>
          {publishStatus === "success" && (
            <p aria-live="polite">Package published.</p>
          )}
          {publishStatus === "error" && (
            <p role="alert">
              Could not publish package. Validate YAML and try again.
            </p>
          )}
        </div>
      </section>

      {status === "loading" && <p aria-busy="true">Loading packages…</p>}
      {status === "error" && (
        <p role="alert">Could not load or update packages.</p>
      )}
      {refreshMessage && <p aria-live="polite">{refreshMessage}</p>}

      {status === "ready" && (
        <section
          className="admin-page__panel"
          aria-label="Package admin controls"
        >
          <ul className="admin-page__list">
            {packages.map((pkg) => (
              <li key={pkg.id} className="admin-page__list-item">
                <div>
                  <h2>{pkg.title}</h2>
                  <p>{pkg.description}</p>
                  <small>ID: {pkg.id}</small>
                  <p>Added: {formatDate(pkg.added_at)}</p>
                  <p>Last refreshed: {formatDate(pkg.last_refreshed_at)}</p>
                </div>
                <div className="admin-page__inline-actions">
                  <label>
                    Availability
                    <select
                      value={pkg.availability}
                      onChange={(event) =>
                        void setAvailability(
                          pkg,
                          event.target.value as Availability,
                        )
                      }
                    >
                      <option value="available">Available</option>
                      <option value="unavailable">Unavailable</option>
                      <option value="hidden">Fully disabled</option>
                    </select>
                  </label>
                  <label>
                    XP threshold
                    <input
                      type="number"
                      min="0"
                      defaultValue={pkg.xp_threshold ?? ""}
                      onBlur={(event) =>
                        void setThreshold(pkg, event.target.value)
                      }
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void handleRefreshPackage(pkg)}
                    disabled={refreshingPackageId === pkg.id}
                  >
                    {refreshingPackageId === pkg.id ? "Refreshing…" : "Refresh"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
