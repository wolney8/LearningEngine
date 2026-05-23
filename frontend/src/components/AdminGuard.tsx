import { type FormEvent, useState } from "react";
import { Link, Navigate } from "react-router-dom";

import { getAdminToken, setAdminToken, validateAdminToken } from "../services/api";
import "./AdminGuard.css";

export function AdminGuard() {
  const [tokenInput, setTokenInput] = useState("");
  const [storedToken, setStoredToken] = useState(() => getAdminToken());
  const [status, setStatus] = useState<"idle" | "verifying" | "error">("idle");

  if (storedToken) {
    return <Navigate to="/admin/settings" replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("verifying");

    const isValid = await validateAdminToken(tokenInput.trim());
    if (!isValid) {
      setStatus("error");
      return;
    }

    setAdminToken(tokenInput.trim());
    setStoredToken(tokenInput.trim());
  }

  return (
    <main className="admin-guard">
      <section className="admin-guard__panel" aria-labelledby="admin-guard-title">
        <h1 id="admin-guard-title">Admin Access</h1>
        <p className="admin-guard__lead">
          Enter your admin token to manage settings and package availability.
        </p>

        <form
          className="admin-guard__form"
          onSubmit={(event) => void handleSubmit(event)}
        >
          <label htmlFor="admin-token">Admin token</label>
          <input
            id="admin-token"
            type="password"
            value={tokenInput}
            onChange={(event) => {
              setTokenInput(event.target.value);
              if (status === "error") {
                setStatus("idle");
              }
            }}
            autoComplete="off"
            required
          />
          <button
            type="submit"
            disabled={status === "verifying" || tokenInput.trim().length === 0}
          >
            {status === "verifying" ? "Checking…" : "Enter Admin"}
          </button>
        </form>

        {status === "error" && (
          <p className="admin-guard__error" role="alert">
            Token rejected. Check your value and try again.
          </p>
        )}

        <p className="admin-guard__back-link">
          <Link to="/">Return to learner view</Link>
        </p>
      </section>
    </main>
  );
}
