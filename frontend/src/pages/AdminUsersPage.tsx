import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";

import { useAuth } from "../hooks/useAuth";
import {
  type AdminManagedUser,
  type AdminManagedUserRole,
  fetchAdminUsers,
  updateAdminUserRole,
} from "../services/api";
import "./AdminSettingsPage.css";

function toRoleErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Could not update user role. Please try again.";
  }

  if (error.message.includes("(409)")) {
    return "Cannot remove the last remaining admin.";
  }

  if (error.message.includes("(403)")) {
    return "Only admins can change user roles.";
  }

  return "Could not update user role. Please try again.";
}

function formatDate(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return "-";
  }
  return new Date(parsed).toLocaleString();
}

export function AdminUsersPage() {
  const { status: authStatus, token, user, logout } = useAuth();
  const canAccess = authStatus === "authenticated" && user?.role === "admin";
  const [users, setUsers] = useState<AdminManagedUser[]>([]);
  const [pendingRoles, setPendingRoles] = useState<
    Record<number, AdminManagedUserRole>
  >({});
  const [loadingState, setLoadingState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [updatingUserId, setUpdatingUserId] = useState<number | null>(null);
  const [messageByUserId, setMessageByUserId] = useState<Record<number, string>>({});
  const [errorByUserId, setErrorByUserId] = useState<Record<number, string>>({});

  useEffect(() => {
    if (!canAccess || !token) {
      return;
    }

    const load = async () => {
      try {
        const rows = await fetchAdminUsers(token);
        setUsers(rows);
        setPendingRoles(
          Object.fromEntries(rows.map((row) => [row.id, row.role])) as Record<
            number,
            AdminManagedUserRole
          >,
        );
        setLoadingState("ready");
      } catch {
        setLoadingState("error");
      }
    };

    void load();
  }, [canAccess, token]);

  const sortedUsers = useMemo(
    () => [...users].sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [users],
  );

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

  async function handleRoleSave(targetUser: AdminManagedUser) {
    const nextRole = pendingRoles[targetUser.id] ?? targetUser.role;
    if (nextRole === targetUser.role) {
      setMessageByUserId((current) => ({
        ...current,
        [targetUser.id]: "No changes to save.",
      }));
      setErrorByUserId((current) => ({ ...current, [targetUser.id]: "" }));
      return;
    }

    setUpdatingUserId(targetUser.id);
    setMessageByUserId((current) => ({ ...current, [targetUser.id]: "" }));
    setErrorByUserId((current) => ({ ...current, [targetUser.id]: "" }));

    try {
      const updated = await updateAdminUserRole(adminToken, targetUser.id, nextRole);
      setUsers((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setPendingRoles((current) => ({
        ...current,
        [updated.id]: updated.role,
      }));
      setMessageByUserId((current) => ({
        ...current,
        [updated.id]: `Role updated to ${updated.role}.`,
      }));
    } catch (error) {
      setErrorByUserId((current) => ({
        ...current,
        [targetUser.id]: toRoleErrorMessage(error),
      }));
    } finally {
      setUpdatingUserId(null);
    }
  }

  return (
    <main className="admin-page">
      <header className="admin-page__header">
        <h1>Admin Users</h1>
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

      {loadingState === "loading" && <p aria-busy="true">Loading users…</p>}
      {loadingState === "error" && (
        <p role="alert">Could not load users. Please try again.</p>
      )}

      {loadingState === "ready" && (
        <section className="admin-page__panel" aria-label="User role management">
          <ul className="admin-page__list">
            {sortedUsers.map((row) => (
              <li key={row.id} className="admin-page__list-item">
                <div>
                  <h2>{row.username}</h2>
                  <p>{row.email}</p>
                  <p>Created: {formatDate(row.created_at)}</p>
                </div>
                <div className="admin-page__inline-actions">
                  <label htmlFor={`role-${row.id}`}>
                    Role
                    <select
                      id={`role-${row.id}`}
                      value={pendingRoles[row.id] ?? row.role}
                      onChange={(event) => {
                        setPendingRoles((current) => ({
                          ...current,
                          [row.id]: event.target.value as AdminManagedUserRole,
                        }));
                        setMessageByUserId((current) => ({
                          ...current,
                          [row.id]: "",
                        }));
                        setErrorByUserId((current) => ({
                          ...current,
                          [row.id]: "",
                        }));
                      }}
                      disabled={updatingUserId === row.id}
                    >
                      <option value="student">Student</option>
                      <option value="admin">Admin</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => void handleRoleSave(row)}
                    disabled={updatingUserId === row.id}
                  >
                    {updatingUserId === row.id ? "Saving…" : "Save role"}
                  </button>
                </div>
                {messageByUserId[row.id] && (
                  <p aria-live="polite">{messageByUserId[row.id]}</p>
                )}
                {errorByUserId[row.id] && <p role="alert">{errorByUserId[row.id]}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
