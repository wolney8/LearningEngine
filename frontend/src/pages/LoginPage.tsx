import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import "./AuthPages.css";

export function LoginPage() {
  const navigate = useNavigate();
  const { login, status, error } = useAuth();
  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await login({
        username_or_email: usernameOrEmail,
        password,
      });
      navigate("/");
    } catch {
      // Error text is handled by useAuth state.
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-page__panel" aria-labelledby="login-title">
        <h1 id="login-title" className="auth-page__title">
          Sign in
        </h1>
        <p className="auth-page__lead">
          Optional account login for cross-device progress.
        </p>
        <form
          className="auth-page__form"
          onSubmit={(event) => void handleSubmit(event)}
        >
          <label htmlFor="username-or-email">
            Username or email
            <input
              id="username-or-email"
              type="text"
              autoComplete="username"
              value={usernameOrEmail}
              onChange={(event) => setUsernameOrEmail(event.target.value)}
              required
            />
          </label>
          <label htmlFor="password">
            Password
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          <div className="auth-page__actions">
            <button type="submit" disabled={status === "loading"}>
              {status === "loading" ? "Signing in..." : "Sign in"}
            </button>
          </div>
        </form>

        {error && (
          <p className="auth-page__error" role="alert">
            {error}
          </p>
        )}

        <p className="auth-page__links">
          <Link to="/register">Create account</Link>
          <Link to="/">Continue without account</Link>
        </p>
      </section>
    </main>
  );
}
