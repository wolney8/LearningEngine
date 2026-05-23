import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import "./AuthPages.css";

export function RegisterPage() {
  const navigate = useNavigate();
  const { register, status, error } = useAuth();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await register({
        username,
        email,
        password,
      });
      navigate("/");
    } catch {
      // Error text is handled by useAuth state.
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-page__panel" aria-labelledby="register-title">
        <h1 id="register-title" className="auth-page__title">
          Create account
        </h1>
        <p className="auth-page__lead">
          Optional account for saving progress beyond this browser.
        </p>
        <form
          className="auth-page__form"
          onSubmit={(event) => void handleSubmit(event)}
        >
          <label htmlFor="username">
            Username
            <input
              id="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
              minLength={3}
            />
          </label>
          <label htmlFor="email">
            Email
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label htmlFor="password">
            Password
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={8}
            />
          </label>
          <div className="auth-page__actions">
            <button type="submit" disabled={status === "loading"}>
              {status === "loading" ? "Creating account..." : "Create account"}
            </button>
          </div>
        </form>

        {error && (
          <p className="auth-page__error" role="alert">
            {error}
          </p>
        )}

        <p className="auth-page__links">
          <Link to="/login">Already have an account?</Link>
          <Link to="/">Continue without account</Link>
        </p>
      </section>
    </main>
  );
}
