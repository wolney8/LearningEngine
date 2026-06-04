import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { Link, Navigate, useBlocker } from "react-router-dom";

import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import type { AdminPackageSummary } from "../schemas/package";
import {
  AdminAIPackageError,
  type AdminPackageValidationResult,
  deleteAdminPackage,
  fetchAdminPackages,
  generateAdminPackage,
  publishAdminPackage,
  refreshAdminPackage,
  updateAdminPackage,
  validateAdminPackage,
  validateAdminPackageUpload,
} from "../services/api";
import {
  ADMIN_TASK_NOTICE_EVENT,
  type AdminTaskNotice,
  type AdminTaskNoticeLevel,
  consumeNextAdminTaskNotice,
  enqueueAdminTaskNotice,
} from "../utils/adminTaskNotices";
import "./AdminSettingsPage.css";

type Availability = "available" | "unavailable" | "hidden";

const ADMIN_AI_OVERLOAD_ERROR_CODES = new Set<string>([
  "ai_provider_overloaded",
  "HTTP_429",
]);
const ADMIN_AI_CONFIG_ERROR_CODES = new Set<string>(["ai_missing_api_key"]);

function resolveAdminAIFriendlyMessage(errorCode: string): string {
  if (ADMIN_AI_OVERLOAD_ERROR_CODES.has(errorCode)) {
    return "AI capacity is high right now. In Admin Settings, switch to a lighter model (for example gemini-2.5-flash-lite) and try again.";
  }

  if (ADMIN_AI_CONFIG_ERROR_CODES.has(errorCode)) {
    return "AI is not configured. In Admin Settings, confirm the provider, model, and API key, then retry.";
  }

  return "The AI request could not be completed right now. Please try again shortly.";
}

export function AdminPackagesPage() {
  const { status: authStatus, token, user, logout } = useAuth();
  const { error: toastError } = useToast();
  const canAccess = authStatus === "authenticated" && user?.role === "admin";
  const [packages, setPackages] = useState<AdminPackageSummary[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [publishYAML, setPublishYAML] = useState("");
  const [publishValidationMessage, setPublishValidationMessage] = useState("");
  const [publishValidationErrors, setPublishValidationErrors] = useState<string[]>([]);
  const [publishStatus, setPublishStatus] = useState<
    "idle" | "validating" | "uploading" | "publishing" | "success" | "error"
  >("idle");
  const [generateTopic, setGenerateTopic] = useState("");
  const [generateAudience, setGenerateAudience] = useState("general learners");
  const [generatePages, setGeneratePages] = useState("3");
  const [generateQuestions, setGenerateQuestions] = useState("8");
  const [generateStatus, setGenerateStatus] = useState<
    "idle" | "generating" | "success" | "error"
  >("idle");
  const [generateMessage, setGenerateMessage] = useState("");
  const [refreshingPackageId, setRefreshingPackageId] = useState<string | null>(null);
  const [deletingPackageId, setDeletingPackageId] = useState<string | null>(null);
  const [savingTagsPackageId, setSavingTagsPackageId] = useState<string | null>(null);
  const [tagsInputByPackageId, setTagsInputByPackageId] = useState<
    Record<string, string>
  >({});
  const [refreshMessage, setRefreshMessage] = useState<string>("");
  const [tagsErrorMessage, setTagsErrorMessage] = useState<string>("");
  const [persistedNotice, setPersistedNotice] = useState<AdminTaskNotice | null>(null);
  const shouldPersistCompletionNoticeRef = useRef(false);

  const isActionInFlight =
    generateStatus === "generating" ||
    publishStatus === "publishing" ||
    publishStatus === "validating" ||
    publishStatus === "uploading" ||
    refreshingPackageId !== null ||
    deletingPackageId !== null ||
    savingTagsPackageId !== null;

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isActionInFlight && currentLocation.pathname !== nextLocation.pathname,
  );

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

  useEffect(() => {
    setTagsInputByPackageId((current) => {
      const next: Record<string, string> = {};
      for (const pkg of packages) {
        next[pkg.id] = current[pkg.id] ?? pkg.tags.join(", ");
      }
      return next;
    });
  }, [packages]);

  useEffect(() => {
    if (blocker.state !== "blocked") {
      return;
    }

    const shouldLeave = window.confirm(
      "An admin action is still running. Leave this page anyway? The backend task will continue.",
    );
    if (shouldLeave) {
      shouldPersistCompletionNoticeRef.current = true;
      blocker.proceed();
      return;
    }
    blocker.reset();
  }, [blocker]);

  useEffect(() => {
    const consumeNotice = () => {
      const nextNotice = consumeNextAdminTaskNotice();
      if (nextNotice) {
        setPersistedNotice(nextNotice);
      }
    };

    consumeNotice();
    window.addEventListener(ADMIN_TASK_NOTICE_EVENT, consumeNotice);
    return () => {
      window.removeEventListener(ADMIN_TASK_NOTICE_EVENT, consumeNotice);
    };
  }, []);

  useEffect(() => {
    if (!isActionInFlight) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isActionInFlight]);

  if (authStatus === "loading" || authStatus === "idle") {
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

  function persistCompletionNotice(level: AdminTaskNoticeLevel, message: string) {
    if (!shouldPersistCompletionNoticeRef.current) {
      return;
    }

    enqueueAdminTaskNotice(level, message);
  }

  function applyPackageValidationResult(
    result: AdminPackageValidationResult,
    includeYamlContent: boolean,
  ) {
    if (includeYamlContent && result.yaml_content) {
      setPublishYAML(result.yaml_content);
    }

    if (result.valid && result.preview) {
      setPublishStatus("success");
      setPublishValidationErrors([]);
      setPublishValidationMessage(
        `Validated package '${result.preview.id}' (${result.preview.page_count} pages, ${result.preview.question_count} questions).`,
      );
      return;
    }

    setPublishStatus("error");
    setPublishValidationErrors(result.formatted_errors);
    setPublishValidationMessage("Package YAML validation failed.");
  }

  async function setAvailability(pkg: AdminPackageSummary, availability: Availability) {
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
      setPublishValidationMessage("Paste package YAML or upload a YAML file first.");
      setPublishValidationErrors([]);
      return;
    }

    setPublishStatus("publishing");
    setPublishValidationMessage("");
    setPublishValidationErrors([]);
    try {
      const created = await publishAdminPackage(adminToken, publishYAML);
      setPackages((current) => [created, ...current]);
      setPublishYAML("");
      setPublishStatus("success");
      setPublishValidationMessage("Package published.");
      setPublishValidationErrors([]);
      persistCompletionNotice("success", `Package '${created.id}' published.`);
    } catch (error) {
      setPublishStatus("error");
      setPublishValidationMessage(
        error instanceof Error
          ? error.message
          : "Could not publish package. Validate YAML and try again.",
      );
      setPublishValidationErrors([]);
      persistCompletionNotice(
        "error",
        "Could not publish package. Validate YAML and try again.",
      );
    }
  }

  async function handleValidatePackage() {
    if (!publishYAML.trim()) {
      setPublishStatus("error");
      setPublishValidationMessage("Paste package YAML before validating.");
      setPublishValidationErrors([]);
      return;
    }

    setPublishStatus("validating");
    setPublishValidationMessage("");
    setPublishValidationErrors([]);
    try {
      const result = await validateAdminPackage(adminToken, publishYAML);
      applyPackageValidationResult(result, false);
    } catch (error) {
      setPublishStatus("error");
      setPublishValidationMessage(
        error instanceof Error ? error.message : "Could not validate package YAML.",
      );
      setPublishValidationErrors([]);
    }
  }

  async function handleUploadPackageFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setPublishStatus("uploading");
    setPublishValidationMessage("");
    setPublishValidationErrors([]);
    try {
      const result = await validateAdminPackageUpload(adminToken, file);
      applyPackageValidationResult(result, true);
    } catch (error) {
      setPublishStatus("error");
      setPublishValidationMessage(
        error instanceof Error ? error.message : "Could not validate uploaded YAML.",
      );
      setPublishValidationErrors([]);
    } finally {
      event.target.value = "";
    }
  }

  async function handleGeneratePackage() {
    const parsedPages = Number.parseInt(generatePages, 10);
    const parsedQuestions = Number.parseInt(generateQuestions, 10);

    if (
      generateTopic.trim().length < 3 ||
      Number.isNaN(parsedPages) ||
      parsedPages < 1 ||
      parsedPages > 20 ||
      Number.isNaN(parsedQuestions) ||
      parsedQuestions < 8 ||
      parsedQuestions > 40
    ) {
      setGenerateStatus("error");
      setGenerateMessage(
        "Enter a topic (3+ chars), pages between 1-20, and questions between 8-40.",
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
      persistCompletionNotice(
        "success",
        "Package YAML generated and loaded for review.",
      );
    } catch (error) {
      const errorMessage =
        error instanceof AdminAIPackageError
          ? resolveAdminAIFriendlyMessage(error.errorCode)
          : "Could not generate package YAML. Try again.";
      setGenerateStatus("error");
      setGenerateMessage(errorMessage);
      toastError(errorMessage, { title: "Generate failed" });
      persistCompletionNotice("error", errorMessage);
    }
  }

  async function handleRefreshPackage(pkg: AdminPackageSummary) {
    setRefreshingPackageId(pkg.id);
    setRefreshMessage("");
    try {
      const result = await refreshAdminPackage(adminToken, pkg.id);
      const nextPackages = await fetchAdminPackages(adminToken);
      setPackages(nextPackages);
      const successMessage = `${pkg.id} refreshed: ${result.previous_version} -> ${result.new_version}`;
      setRefreshMessage(successMessage);
      persistCompletionNotice("success", successMessage);
    } catch (error) {
      const errorMessage =
        error instanceof AdminAIPackageError
          ? resolveAdminAIFriendlyMessage(error.errorCode)
          : `Could not refresh package '${pkg.id}'. Try again.`;
      setRefreshMessage(errorMessage);
      toastError(errorMessage, { title: "Refresh failed" });
      persistCompletionNotice("error", errorMessage);
    } finally {
      setRefreshingPackageId(null);
    }
  }

  async function handleArchivePackage(pkg: AdminPackageSummary) {
    setDeletingPackageId(pkg.id);
    setRefreshMessage("");
    try {
      const result = await deleteAdminPackage(adminToken, pkg.id);
      if (result.summary) {
        setPackages((current) =>
          current.map((item) =>
            item.id === result.summary?.id ? result.summary : item,
          ),
        );
      }
      setRefreshMessage(`Package '${pkg.id}' archived. You can restore it later.`);
    } catch (error) {
      setRefreshMessage(
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : `Could not archive package '${pkg.id}'. Try again.`,
      );
    } finally {
      setDeletingPackageId(null);
    }
  }

  async function handleSaveTags(pkg: AdminPackageSummary) {
    const tagsInput = tagsInputByPackageId[pkg.id] ?? "";
    const tags = Array.from(
      new Set(
        tagsInput
          .split(",")
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0),
      ),
    );

    setSavingTagsPackageId(pkg.id);
    setRefreshMessage("");
    setTagsErrorMessage("");
    try {
      const updated = await updateAdminPackage(adminToken, pkg.id, {
        tags,
      });
      setPackages((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setTagsInputByPackageId((current) => ({
        ...current,
        [updated.id]: updated.tags.join(", "),
      }));
      const successMessage = `Tags updated for '${pkg.id}'.`;
      setRefreshMessage(successMessage);
      persistCompletionNotice("success", successMessage);
    } catch (error) {
      const errorMessage =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : `Could not update tags for package '${pkg.id}'. Try again.`;
      setTagsErrorMessage(errorMessage);
      persistCompletionNotice("error", errorMessage);
    } finally {
      setSavingTagsPackageId(null);
    }
  }

  async function handlePermanentDeletePackage(pkg: AdminPackageSummary) {
    const confirmed = window.confirm(
      `Permanently delete '${pkg.id}'? This cannot be undone.`,
    );
    if (!confirmed) {
      return;
    }

    setDeletingPackageId(pkg.id);
    setRefreshMessage("");
    try {
      await deleteAdminPackage(adminToken, pkg.id, {
        permanent: true,
        confirm: true,
      });
      setPackages((current) => current.filter((item) => item.id !== pkg.id));
      setRefreshMessage(`Package '${pkg.id}' permanently deleted.`);
    } catch (error) {
      setRefreshMessage(
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : `Could not permanently delete package '${pkg.id}'. Try again.`,
      );
    } finally {
      setDeletingPackageId(null);
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
          <Link to="/admin/audit-logs">Audit Logs</Link>
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
              max={20}
              value={generatePages}
              onChange={(event) => setGeneratePages(event.target.value)}
            />
          </label>
          <label className="admin-page__field" htmlFor="generate-questions">
            <span>Questions</span>
            <input
              id="generate-questions"
              type="number"
              min={8}
              max={40}
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
            aria-busy={generateStatus === "generating"}
          >
            <span className="admin-page__button-content">
              {generateStatus === "generating" && (
                <span className="admin-page__button-spinner" aria-hidden="true" />
              )}
              <span>Generate with AI</span>
            </span>
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
        <label className="admin-page__field" htmlFor="publish-package-upload">
          <span>Upload YAML file</span>
          <input
            id="publish-package-upload"
            type="file"
            accept=".yaml,.yml"
            onChange={(event) => void handleUploadPackageFile(event)}
          />
        </label>
        <div className="admin-page__actions">
          <button
            type="button"
            onClick={() => void handleValidatePackage()}
            disabled={
              publishStatus === "publishing" ||
              publishStatus === "validating" ||
              publishStatus === "uploading"
            }
            aria-busy={publishStatus === "validating"}
          >
            <span className="admin-page__button-content">
              {publishStatus === "validating" && (
                <span className="admin-page__button-spinner" aria-hidden="true" />
              )}
              <span>Validate YAML</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => void handlePublishPackage()}
            disabled={
              publishStatus === "publishing" ||
              publishStatus === "validating" ||
              publishStatus === "uploading"
            }
            aria-busy={publishStatus === "publishing"}
          >
            <span className="admin-page__button-content">
              {publishStatus === "publishing" && (
                <span className="admin-page__button-spinner" aria-hidden="true" />
              )}
              <span>Publish package</span>
            </span>
          </button>
          {publishValidationMessage && (
            <p
              aria-live={publishStatus === "error" ? "assertive" : "polite"}
              role={publishStatus === "error" ? "alert" : undefined}
            >
              {publishValidationMessage}
            </p>
          )}
        </div>
        {publishValidationErrors.length > 0 && (
          <ul role="alert" className="admin-page__list">
            {publishValidationErrors.map((errorMessage) => (
              <li key={errorMessage}>{errorMessage}</li>
            ))}
          </ul>
        )}
      </section>

      {status === "loading" && <p aria-busy="true">Loading packages…</p>}
      {status === "error" && <p role="alert">Could not load or update packages.</p>}
      {persistedNotice && (
        <div aria-live={persistedNotice.level === "error" ? "assertive" : "polite"}>
          <p
            data-testid="admin-persisted-task-notice"
            role={persistedNotice.level === "error" ? "alert" : undefined}
          >
            {persistedNotice.message}
          </p>
        </div>
      )}
      {refreshMessage && <p aria-live="polite">{refreshMessage}</p>}
      {tagsErrorMessage && <p role="alert">{tagsErrorMessage}</p>}

      {status === "ready" && (
        <section className="admin-page__panel" aria-label="Package admin controls">
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
                        void setAvailability(pkg, event.target.value as Availability)
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
                      onBlur={(event) => void setThreshold(pkg, event.target.value)}
                    />
                  </label>
                  <label>
                    Tags (comma-separated)
                    <input
                      type="text"
                      value={tagsInputByPackageId[pkg.id] ?? ""}
                      onChange={(event) =>
                        setTagsInputByPackageId((current) => ({
                          ...current,
                          [pkg.id]: event.target.value,
                        }))
                      }
                      disabled={savingTagsPackageId === pkg.id}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void handleSaveTags(pkg)}
                    disabled={
                      savingTagsPackageId === pkg.id ||
                      refreshingPackageId === pkg.id ||
                      deletingPackageId === pkg.id
                    }
                    aria-busy={savingTagsPackageId === pkg.id}
                  >
                    <span className="admin-page__button-content">
                      {savingTagsPackageId === pkg.id && (
                        <span
                          className="admin-page__button-spinner"
                          aria-hidden="true"
                        />
                      )}
                      <span>Save tags</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRefreshPackage(pkg)}
                    disabled={
                      refreshingPackageId === pkg.id || deletingPackageId === pkg.id
                    }
                    aria-busy={refreshingPackageId === pkg.id}
                  >
                    <span className="admin-page__button-content">
                      {refreshingPackageId === pkg.id && (
                        <span
                          className="admin-page__button-spinner"
                          aria-hidden="true"
                        />
                      )}
                      <span>Refresh package</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleArchivePackage(pkg)}
                    disabled={
                      refreshingPackageId === pkg.id || deletingPackageId === pkg.id
                    }
                    aria-busy={deletingPackageId === pkg.id}
                  >
                    <span className="admin-page__button-content">
                      {deletingPackageId === pkg.id && (
                        <span
                          className="admin-page__button-spinner"
                          aria-hidden="true"
                        />
                      )}
                      <span>Archive</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handlePermanentDeletePackage(pkg)}
                    disabled={
                      refreshingPackageId === pkg.id || deletingPackageId === pkg.id
                    }
                    aria-busy={deletingPackageId === pkg.id}
                  >
                    <span className="admin-page__button-content">
                      {deletingPackageId === pkg.id && (
                        <span
                          className="admin-page__button-spinner"
                          aria-hidden="true"
                        />
                      )}
                      <span>Delete permanently</span>
                    </span>
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
