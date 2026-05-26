import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import type { PackageSummary } from "../schemas/package";
import { fetchPackages } from "../services/api";
import "./AuthPages.css";

export function RegisterPage() {
  const navigate = useNavigate();
  const { register, status, error } = useAuth();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [allPackages, setAllPackages] = useState<PackageSummary[]>([]);
  const [packagesStatus, setPackagesStatus] = useState<"loading" | "error" | "loaded">(
    "loading",
  );
  const [selectedPackageIds, setSelectedPackageIds] = useState<string[]>([]);
  const [selectionError, setSelectionError] = useState("");
  const selectionErrorRef = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPackagesStatus("loading");

    void fetchPackages()
      .then((packages) => {
        if (cancelled) {
          return;
        }
        setAllPackages(packages);
        setPackagesStatus("loaded");
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setPackagesStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectionError) {
      return;
    }
    selectionErrorRef.current?.focus();
  }, [selectionError]);

  const selectablePackages = useMemo(
    () => allPackages.filter((pkg) => pkg.availability === "available"),
    [allPackages],
  );

  function handleSelectionChange(packageId: string, selected: boolean): void {
    setSelectionError("");
    setSelectedPackageIds((current) => {
      if (selected) {
        if (current.includes(packageId)) {
          return current;
        }
        return [...current, packageId];
      }
      return current.filter((id) => id !== packageId);
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (selectablePackages.length > 0 && selectedPackageIds.length === 0) {
      setSelectionError("Choose at least one course to continue.");
      return;
    }

    try {
      await register({
        username,
        email,
        password,
        selected_package_ids: selectedPackageIds,
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

          <fieldset
            className="auth-page__courses"
            aria-describedby={selectionError ? "register-selection-error" : undefined}
          >
            <legend>Choose your courses</legend>
            {packagesStatus === "loading" && (
              <p className="auth-page__muted" aria-live="polite">
                Loading courses...
              </p>
            )}
            {packagesStatus === "error" && (
              <p className="auth-page__error" role="alert">
                Could not load courses. Please try again.
              </p>
            )}
            {packagesStatus === "loaded" && selectablePackages.length === 0 && (
              <p className="auth-page__muted">
                No selectable courses available right now.
              </p>
            )}
            {packagesStatus === "loaded" && selectablePackages.length > 0 && (
              <ul className="auth-page__course-list">
                {selectablePackages.map((pkg) => {
                  const checkboxId = `course-${pkg.id}`;
                  return (
                    <li key={pkg.id}>
                      <label htmlFor={checkboxId} className="auth-page__course-option">
                        <input
                          id={checkboxId}
                          type="checkbox"
                          checked={selectedPackageIds.includes(pkg.id)}
                          onChange={(event) =>
                            handleSelectionChange(pkg.id, event.target.checked)
                          }
                        />
                        <span>{pkg.title}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </fieldset>

          {selectionError && (
            <p
              id="register-selection-error"
              className="auth-page__error"
              role="alert"
              tabIndex={-1}
              ref={selectionErrorRef}
            >
              {selectionError}
            </p>
          )}

          <div className="auth-page__actions">
            <button
              type="submit"
              disabled={status === "loading" || packagesStatus === "loading"}
            >
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
