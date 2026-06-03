import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";

import { useAuth } from "../hooks/useAuth";
import {
  type AdminManagedUser,
  type AdminManagedUserDelete,
  type AdminManagedUserProgressReset,
  type AdminManagedUserRole,
  type AdminManagedUserXP,
  deleteAdminUser,
  fetchAdminUsers,
  grantAdminUserXPBonus,
  resetAdminUserProgress,
  resetAdminUserXP,
  setAdminUserXP,
  updateAdminUserRole,
} from "../services/api";
import "./AdminSettingsPage.css";

function toAdminErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) {
    return fallback;
  }

  if (error.message.includes("(409)")) {
    if (error.message.toLowerCase().includes("last remaining admin")) {
      return "Cannot remove the last remaining admin.";
    }
    if (error.message.toLowerCase().includes("currently signed-in admin")) {
      return "You cannot delete the admin account currently in use.";
    }
    if (error.message.toLowerCase().includes("last remaining package")) {
      return "Cannot permanently delete the last remaining package.";
    }
    return "Request conflicts with current data. Refresh and try again.";
  }

  if (error.message.includes("(403)")) {
    return "Only admins can change user roles.";
  }

  if (error.message.includes("(404)")) {
    return "User no longer exists.";
  }

  return fallback;
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
  const [xpInputByUserId, setXPInputByUserId] = useState<Record<number, string>>({});
  const [bonusXPInputByUserId, setBonusXPInputByUserId] = useState<
    Record<number, string>
  >({});
  const [bonusReasonByUserId, setBonusReasonByUserId] = useState<
    Record<number, string>
  >({});

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
        setXPInputByUserId(
          Object.fromEntries(
            rows.map((row) => [
              row.id,
              typeof row.xp === "number" ? String(row.xp) : "",
            ]),
          ) as Record<number, string>,
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

  function applyXPUpdate(updatedXP: AdminManagedUserXP) {
    setUsers((current) =>
      current.map((item) =>
        item.id === updatedXP.id
          ? {
              ...item,
              xp: updatedXP.xp,
              pending_bonus_xp: updatedXP.pending_bonus_xp,
              pending_bonus_reason: updatedXP.pending_bonus_reason,
            }
          : item,
      ),
    );
    setXPInputByUserId((current) => ({
      ...current,
      [updatedXP.id]: String(updatedXP.xp),
    }));
  }

  function applyProgressResetUpdate(updated: AdminManagedUserProgressReset) {
    setUsers((current) =>
      current.map((item) =>
        item.id === updated.id
          ? {
              ...item,
              xp: updated.xp,
              pending_bonus_xp: updated.pending_bonus_xp,
              pending_bonus_reason: updated.pending_bonus_reason,
            }
          : item,
      ),
    );
    setXPInputByUserId((current) => ({
      ...current,
      [updated.id]: String(updated.xp),
    }));
    if (updated.reset_xp) {
      setBonusReasonByUserId((current) => ({
        ...current,
        [updated.id]: "",
      }));
      setBonusXPInputByUserId((current) => ({
        ...current,
        [updated.id]: "",
      }));
    }
  }

  function applyUserDeleteUpdate(deletedUser: AdminManagedUserDelete) {
    setUsers((current) => current.filter((item) => item.id !== deletedUser.id));
    setPendingRoles((current) => {
      const next = { ...current };
      delete next[deletedUser.id];
      return next;
    });
    setXPInputByUserId((current) => {
      const next = { ...current };
      delete next[deletedUser.id];
      return next;
    });
    setBonusXPInputByUserId((current) => {
      const next = { ...current };
      delete next[deletedUser.id];
      return next;
    });
    setBonusReasonByUserId((current) => {
      const next = { ...current };
      delete next[deletedUser.id];
      return next;
    });
    setErrorByUserId((current) => {
      const next = { ...current };
      delete next[deletedUser.id];
      return next;
    });
  }

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
        [targetUser.id]: toAdminErrorMessage(
          error,
          "Could not update user role. Please try again.",
        ),
      }));
    } finally {
      setUpdatingUserId(null);
    }
  }

  async function handleSetXP(targetUser: AdminManagedUser) {
    const rawValue = xpInputByUserId[targetUser.id] ?? "";
    const parsedXP = Number.parseInt(rawValue, 10);
    if (Number.isNaN(parsedXP) || parsedXP < 0) {
      setErrorByUserId((current) => ({
        ...current,
        [targetUser.id]: "XP must be a whole number greater than or equal to 0.",
      }));
      return;
    }

    setUpdatingUserId(targetUser.id);
    setMessageByUserId((current) => ({ ...current, [targetUser.id]: "" }));
    setErrorByUserId((current) => ({ ...current, [targetUser.id]: "" }));

    try {
      const updated = await setAdminUserXP(adminToken, targetUser.id, parsedXP);
      applyXPUpdate(updated);
      setMessageByUserId((current) => ({
        ...current,
        [targetUser.id]: `XP set to ${updated.xp}.`,
      }));
    } catch (error) {
      setErrorByUserId((current) => ({
        ...current,
        [targetUser.id]: toAdminErrorMessage(
          error,
          "Could not set XP. Please try again.",
        ),
      }));
    } finally {
      setUpdatingUserId(null);
    }
  }

  async function handleResetXP(targetUser: AdminManagedUser) {
    setUpdatingUserId(targetUser.id);
    setMessageByUserId((current) => ({ ...current, [targetUser.id]: "" }));
    setErrorByUserId((current) => ({ ...current, [targetUser.id]: "" }));

    try {
      const updated = await resetAdminUserXP(adminToken, targetUser.id);
      applyXPUpdate(updated);
      setBonusReasonByUserId((current) => ({
        ...current,
        [targetUser.id]: "",
      }));
      setBonusXPInputByUserId((current) => ({
        ...current,
        [targetUser.id]: "",
      }));
      setMessageByUserId((current) => ({
        ...current,
        [targetUser.id]: "XP reset to 0 and pending bonus cleared.",
      }));
    } catch (error) {
      setErrorByUserId((current) => ({
        ...current,
        [targetUser.id]: toAdminErrorMessage(
          error,
          "Could not reset XP. Please try again.",
        ),
      }));
    } finally {
      setUpdatingUserId(null);
    }
  }

  async function handleGrantBonusXP(targetUser: AdminManagedUser) {
    const rawXP = bonusXPInputByUserId[targetUser.id] ?? "";
    const bonusXP = Number.parseInt(rawXP, 10);
    const reason = (bonusReasonByUserId[targetUser.id] ?? "").trim();

    if (Number.isNaN(bonusXP) || bonusXP <= 0) {
      setErrorByUserId((current) => ({
        ...current,
        [targetUser.id]: "Bonus XP must be a whole number greater than 0.",
      }));
      return;
    }

    if (reason.length === 0) {
      setErrorByUserId((current) => ({
        ...current,
        [targetUser.id]: "Enter a short reason for the bonus XP notice.",
      }));
      return;
    }

    setUpdatingUserId(targetUser.id);
    setMessageByUserId((current) => ({ ...current, [targetUser.id]: "" }));
    setErrorByUserId((current) => ({ ...current, [targetUser.id]: "" }));

    try {
      const updated = await grantAdminUserXPBonus(adminToken, targetUser.id, {
        xp: bonusXP,
        reason,
      });
      applyXPUpdate(updated);
      setBonusXPInputByUserId((current) => ({
        ...current,
        [targetUser.id]: "",
      }));
      setMessageByUserId((current) => ({
        ...current,
        [targetUser.id]: `Bonus XP granted: +${bonusXP}. The learner will see this reason on next login.`,
      }));
    } catch (error) {
      setErrorByUserId((current) => ({
        ...current,
        [targetUser.id]: toAdminErrorMessage(
          error,
          "Could not grant bonus XP. Please try again.",
        ),
      }));
    } finally {
      setUpdatingUserId(null);
    }
  }

  async function handleResetProgress(targetUser: AdminManagedUser) {
    const confirmed = window.confirm(
      `This will permanently reset all saved learning progress for ${targetUser.username}. XP will remain at ${targetUser.xp}. This action cannot be undone. Continue?`,
    );
    if (!confirmed) {
      return;
    }

    setUpdatingUserId(targetUser.id);
    setMessageByUserId((current) => ({ ...current, [targetUser.id]: "" }));
    setErrorByUserId((current) => ({ ...current, [targetUser.id]: "" }));

    try {
      const updated = await resetAdminUserProgress(adminToken, targetUser.id);
      applyProgressResetUpdate(updated);
      setMessageByUserId((current) => ({
        ...current,
        [targetUser.id]: `Progress reset. Cleared ${updated.cleared_progress_count} package records.`,
      }));
    } catch (error) {
      setErrorByUserId((current) => ({
        ...current,
        [targetUser.id]: toAdminErrorMessage(
          error,
          "Could not reset progress. Please try again.",
        ),
      }));
    } finally {
      setUpdatingUserId(null);
    }
  }

  async function handleResetProgressAndXP(targetUser: AdminManagedUser) {
    const confirmed = window.confirm(
      `This will permanently reset all saved learning progress and set XP to 0 for ${targetUser.username}. This action cannot be undone. Continue?`,
    );
    if (!confirmed) {
      return;
    }

    setUpdatingUserId(targetUser.id);
    setMessageByUserId((current) => ({ ...current, [targetUser.id]: "" }));
    setErrorByUserId((current) => ({ ...current, [targetUser.id]: "" }));

    try {
      const updated = await resetAdminUserProgress(adminToken, targetUser.id, {
        reset_xp: true,
      });
      applyProgressResetUpdate(updated);
      setMessageByUserId((current) => ({
        ...current,
        [targetUser.id]: `Progress and XP reset. Cleared ${updated.cleared_progress_count} package records.`,
      }));
    } catch (error) {
      setErrorByUserId((current) => ({
        ...current,
        [targetUser.id]: toAdminErrorMessage(
          error,
          "Could not reset progress and XP. Please try again.",
        ),
      }));
    } finally {
      setUpdatingUserId(null);
    }
  }

  async function handleDeleteUser(targetUser: AdminManagedUser) {
    const confirmed = window.confirm(
      `This will permanently delete ${targetUser.username}, remove their saved progress, library entries, XP spend history, and related audit references. This action cannot be undone. Continue?`,
    );
    if (!confirmed) {
      return;
    }

    setUpdatingUserId(targetUser.id);
    setMessageByUserId((current) => ({ ...current, [targetUser.id]: "" }));
    setErrorByUserId((current) => ({ ...current, [targetUser.id]: "" }));

    try {
      const deleted = await deleteAdminUser(adminToken, targetUser.id);
      applyUserDeleteUpdate(deleted);
      setMessageByUserId((current) => ({
        ...current,
        [0]: `Deleted ${deleted.username}. Removed ${deleted.deleted_progress_count} progress records, ${deleted.deleted_library_count} library records, ${deleted.deleted_spend_history_count} spend records, and ${deleted.deleted_audit_log_count} related audit records.`,
      }));
    } catch (error) {
      setErrorByUserId((current) => ({
        ...current,
        [targetUser.id]: toAdminErrorMessage(
          error,
          "Could not delete user. Please try again.",
        ),
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

      {loadingState === "loading" && <p aria-busy="true">Loading users…</p>}
      {loadingState === "error" && (
        <p role="alert">Could not load users. Please try again.</p>
      )}
      {messageByUserId[0] && <p>{messageByUserId[0]}</p>}

      {loadingState === "ready" && (
        <section className="admin-page__panel" aria-label="User role management">
          <ul className="admin-page__list">
            {sortedUsers.map((row) => (
              <li key={row.id} className="admin-page__list-item">
                <div>
                  <h2>{row.username}</h2>
                  <p>{row.email}</p>
                  <p>Current XP: {row.xp}</p>
                  {row.pending_bonus_xp && row.pending_bonus_xp > 0 && (
                    <p>
                      Pending bonus: +{row.pending_bonus_xp}
                      {row.pending_bonus_reason ? ` (${row.pending_bonus_reason})` : ""}
                    </p>
                  )}
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
                  <label htmlFor={`set-xp-${row.id}`}>
                    Set XP
                    <input
                      id={`set-xp-${row.id}`}
                      type="number"
                      min={0}
                      value={xpInputByUserId[row.id] ?? ""}
                      onChange={(event) => {
                        setXPInputByUserId((current) => ({
                          ...current,
                          [row.id]: event.target.value,
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
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void handleSetXP(row)}
                    disabled={updatingUserId === row.id}
                  >
                    {updatingUserId === row.id ? "Saving…" : "Set XP"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleResetXP(row)}
                    disabled={updatingUserId === row.id}
                  >
                    {updatingUserId === row.id ? "Saving…" : "Reset XP"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteUser(row)}
                    disabled={updatingUserId === row.id}
                  >
                    {updatingUserId === row.id ? "Saving…" : "Delete user"}
                  </button>
                  <label htmlFor={`bonus-xp-${row.id}`}>
                    Bonus XP
                    <input
                      id={`bonus-xp-${row.id}`}
                      type="number"
                      min={1}
                      value={bonusXPInputByUserId[row.id] ?? ""}
                      onChange={(event) => {
                        setBonusXPInputByUserId((current) => ({
                          ...current,
                          [row.id]: event.target.value,
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
                    />
                  </label>
                  <label htmlFor={`bonus-reason-${row.id}`}>
                    Bonus reason
                    <input
                      id={`bonus-reason-${row.id}`}
                      type="text"
                      maxLength={500}
                      value={bonusReasonByUserId[row.id] ?? ""}
                      onChange={(event) => {
                        setBonusReasonByUserId((current) => ({
                          ...current,
                          [row.id]: event.target.value,
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
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void handleGrantBonusXP(row)}
                    disabled={updatingUserId === row.id}
                  >
                    {updatingUserId === row.id ? "Saving…" : "Grant bonus XP"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleResetProgress(row)}
                    disabled={updatingUserId === row.id}
                  >
                    {updatingUserId === row.id
                      ? "Saving…"
                      : "Reset all progress (irreversible)"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleResetProgressAndXP(row)}
                    disabled={updatingUserId === row.id}
                  >
                    {updatingUserId === row.id
                      ? "Saving…"
                      : "Reset all progress and XP (irreversible)"}
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
