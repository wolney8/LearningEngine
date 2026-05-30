import { Link, Navigate } from "react-router-dom";

import { useAuth } from "../hooks/useAuth";
import "./AdminGuard.css";

export function AdminGuard() {
  const { status, user } = useAuth();

  if (status === "loading") {
    return (
      <main className="admin-guard">
        <section className="admin-guard__panel" aria-live="polite">
          <p aria-busy="true">Checking your account…</p>
        </section>
      </main>
    );
  }

  if (status === "authenticated" && user?.role === "admin") {
    return <Navigate to="/admin/settings" replace />;
  }

  if (status !== "authenticated") {
    return (
      <main className="admin-guard">
        <section
          className="admin-guard__panel"
          aria-labelledby="admin-guard-title"
        >
          <h1 id="admin-guard-title">Admin Access</h1>
          <p className="admin-guard__lead">
            Sign in with an admin account to access admin settings and package
            controls.
          </p>
          <div className="admin-guard__actions">
            <Link to="/login">Go to login</Link>
            <Link to="/">Return to learner view</Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-guard">
      <section
        className="admin-guard__panel"
        aria-labelledby="admin-guard-title"
      >
        <h1 id="admin-guard-title">Admin Access</h1>
        <p className="admin-guard__lead">
          This account is signed in but does not have admin permissions.
        </p>
        <p className="admin-guard__error" role="alert">
          Ask an administrator to grant your account the admin role.
        </p>
        <div className="admin-guard__actions">
          <Link to="/">Return to learner view</Link>
        </div>
      </section>
    </main>
  );
}
