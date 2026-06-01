import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";

import { useAuth } from "../hooks/useAuth";
import {
  type AdminAuditLogEntry,
  type AdminAuditLogFilters,
  fetchAdminAuditLogs,
} from "../services/api";
import "./AdminSettingsPage.css";

function formatDate(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return "-";
  }
  return new Date(parsed).toLocaleString();
}

function formatTarget(entry: AdminAuditLogEntry): string {
  const segments: string[] = [];
  if (entry.target_user_id !== null) {
    segments.push(`user ${entry.target_user_id}`);
  }
  if (entry.package_id !== null) {
    segments.push(`package ${entry.package_id}`);
  }
  return segments.length > 0 ? segments.join(" | ") : "-";
}

function summariseDetails(details: AdminAuditLogEntry["details"]): string {
  const values = Object.entries(details);
  if (values.length === 0) {
    return "-";
  }

  const summary = values
    .slice(0, 3)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(", ");

  return values.length > 3 ? `${summary}, ...` : summary;
}

function toIsoDateBoundary(value: string, isEndOfDay: boolean): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const suffix = isEndOfDay ? "T23:59:59.999Z" : "T00:00:00.000Z";
  return `${value}${suffix}`;
}

export function AdminAuditLogsPage() {
  const { status: authStatus, token, user, logout } = useAuth();
  const canAccess = authStatus === "authenticated" && user?.role === "admin";
  const [entries, setEntries] = useState<AdminAuditLogEntry[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [actionFilterInput, setActionFilterInput] = useState("");
  const [actorFilterInput, setActorFilterInput] = useState("");
  const [fromDateInput, setFromDateInput] = useState("");
  const [untilDateInput, setUntilDateInput] = useState("");
  const [appliedFilters, setAppliedFilters] = useState<AdminAuditLogFilters>({});

  const loadAuditLogs = useCallback(async () => {
    if (!canAccess || !token) {
      return;
    }

    setState("loading");
    try {
      const data = await fetchAdminAuditLogs(token, {
        limit: 50,
        ...appliedFilters,
      });
      setEntries(data);
      setState("ready");
    } catch {
      setState("error");
    }
  }, [appliedFilters, canAccess, token]);

  useEffect(() => {
    void loadAuditLogs();
  }, [loadAuditLogs]);

  const rows = useMemo(() => entries, [entries]);
  const hasActiveFilters = useMemo(
    () =>
      typeof appliedFilters.action === "string" ||
      typeof appliedFilters.actor_user_id === "number" ||
      typeof appliedFilters.from === "string" ||
      typeof appliedFilters.until === "string",
    [appliedFilters],
  );

  if (authStatus === "loading" || authStatus === "idle") {
    return (
      <main className="admin-page">
        <p aria-busy="true">Loading...</p>
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

  return (
    <main className="admin-page">
      <header className="admin-page__header">
        <h1>Admin Audit Logs</h1>
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

      {state === "loading" && <p aria-busy="true">Loading recent audit events...</p>}
      {state === "error" && (
        <p role="alert">Could not load audit logs. Please try again.</p>
      )}

      {state === "ready" && (
        <section className="admin-page__panel" aria-labelledby="audit-log-table-title">
          <h2 id="audit-log-table-title">Recent admin events (latest 50)</h2>
          <form
            className="admin-page__grid"
            aria-label="Audit log filters"
            onSubmit={(event) => {
              event.preventDefault();

              const parsedActor = Number.parseInt(actorFilterInput, 10);
              const actor_user_id =
                Number.isInteger(parsedActor) && parsedActor > 0
                  ? parsedActor
                  : undefined;

              const nextFilters: AdminAuditLogFilters = {
                action: actionFilterInput.trim() || undefined,
                actor_user_id,
                from: toIsoDateBoundary(fromDateInput, false) ?? undefined,
                until: toIsoDateBoundary(untilDateInput, true) ?? undefined,
              };

              setAppliedFilters(nextFilters);
            }}
          >
            <label className="admin-page__field" htmlFor="audit-action-filter">
              Action contains
              <input
                id="audit-action-filter"
                name="action"
                type="text"
                value={actionFilterInput}
                onChange={(event) => {
                  setActionFilterInput(event.target.value);
                }}
                autoComplete="off"
              />
            </label>
            <label className="admin-page__field" htmlFor="audit-actor-filter">
              Actor user ID
              <input
                id="audit-actor-filter"
                name="actor_user_id"
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                value={actorFilterInput}
                onChange={(event) => {
                  setActorFilterInput(event.target.value);
                }}
              />
            </label>
            <label className="admin-page__field" htmlFor="audit-from-date-filter">
              From date
              <input
                id="audit-from-date-filter"
                name="from"
                type="date"
                value={fromDateInput}
                onChange={(event) => {
                  setFromDateInput(event.target.value);
                }}
              />
            </label>
            <label className="admin-page__field" htmlFor="audit-until-date-filter">
              Until date
              <input
                id="audit-until-date-filter"
                name="until"
                type="date"
                value={untilDateInput}
                onChange={(event) => {
                  setUntilDateInput(event.target.value);
                }}
              />
            </label>
            <div className="admin-page__actions">
              <button type="submit">Apply filters</button>
              <button
                type="button"
                onClick={() => {
                  setActionFilterInput("");
                  setActorFilterInput("");
                  setFromDateInput("");
                  setUntilDateInput("");
                  setAppliedFilters({});
                }}
              >
                Reset filters
              </button>
            </div>
          </form>

          <p aria-live="polite">
            {hasActiveFilters
              ? "Showing filtered admin audit events."
              : "Showing latest admin audit events."}
          </p>

          {rows.length === 0 ? (
            <p aria-live="polite">No audit events found.</p>
          ) : (
            <div className="admin-page__table-wrap">
              <table className="admin-page__table">
                <caption className="admin-page__table-caption">
                  Latest actions recorded by the admin audit log.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Timestamp</th>
                    <th scope="col">Action</th>
                    <th scope="col">Actor User</th>
                    <th scope="col">Target</th>
                    <th scope="col">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((entry) => (
                    <tr key={entry.id}>
                      <td>{formatDate(entry.created_at)}</td>
                      <td>{entry.action}</td>
                      <td>{entry.actor_user_id}</td>
                      <td>{formatTarget(entry)}</td>
                      <td>{summariseDetails(entry.details)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
