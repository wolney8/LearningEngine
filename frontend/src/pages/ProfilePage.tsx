import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import { useXP } from "../hooks/useXP";
import {
  fetchMyProgress,
  fetchMyStreak,
  fetchPackages,
  updateMyPassword,
  updateMyProfile,
} from "../services/api";
import "./ProfilePage.css";

type ProfileScoreRow = {
  packageId: string;
  packageTitle: string;
  bestScorePercent: number;
  completed: boolean;
};

export function ProfilePage() {
  const { status, token, user, setCurrentUser } = useAuth();
  const { success: showSuccessToast } = useToast();
  const { xp } = useXP();
  const [isLoadingStats, setLoadingStats] = useState(true);
  const [statsError, setStatsError] = useState("");
  const [streakCount, setStreakCount] = useState(0);
  const [scoreRows, setScoreRows] = useState<ProfileScoreRow[]>([]);
  const [usernameInput, setUsernameInput] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "success" | "error">(
    "idle",
  );
  const [saveMessage, setSaveMessage] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordStatus, setPasswordStatus] = useState<
    "idle" | "saving" | "success" | "error"
  >("idle");
  const [passwordMessage, setPasswordMessage] = useState("");

  useEffect(() => {
    if (!user) {
      return;
    }

    setUsernameInput(user.username);
  }, [user]);

  useEffect(() => {
    if (status !== "authenticated" || !token) {
      return;
    }

    let cancelled = false;
    setLoadingStats(true);
    setStatsError("");

    void Promise.all([fetchMyStreak(token), fetchMyProgress(token), fetchPackages()])
      .then(([streak, progressRows, packages]) => {
        if (cancelled) {
          return;
        }

        const titleById = new Map(packages.map((pkg) => [pkg.id, pkg.title]));
        const nextRows = progressRows
          .map((row) => ({
            packageId: row.package_id,
            packageTitle: titleById.get(row.package_id) ?? row.package_id,
            bestScorePercent: Math.round(row.latest_weighted_score * 100),
            completed: row.completed,
          }))
          .sort((a, b) => b.bestScorePercent - a.bestScorePercent);

        setStreakCount(streak.streak_count);
        setScoreRows(nextRows);
        setLoadingStats(false);
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return;
        }

        setStatsError(
          err instanceof Error ? err.message : "Failed to load profile stats",
        );
        setLoadingStats(false);
      });

    return () => {
      cancelled = true;
    };
  }, [status, token]);

  const completedCount = useMemo(
    () => scoreRows.filter((row) => row.completed).length,
    [scoreRows],
  );

  if (token && (status === "idle" || status === "loading")) {
    return (
      <main className="profile-page" aria-busy="true">
        <section className="profile-page__panel">
          <p>Loading profile...</p>
        </section>
      </main>
    );
  }

  if (status !== "authenticated" || !token || !user) {
    return <Navigate to="/login" replace />;
  }

  async function handleUsernameSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!token) {
      return;
    }

    setSaveStatus("saving");
    setSaveMessage("");

    try {
      const updatedUser = await updateMyProfile(token, {
        username: usernameInput,
      });
      setCurrentUser(updatedUser);
      setUsernameInput(updatedUser.username);
      setSaveStatus("success");
      setSaveMessage("Username updated successfully.");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Could not update profile";
      const statusMatch = message.match(/\((\d+)\)/);
      const statusCode = statusMatch ? Number(statusMatch[1]) : null;

      if (statusCode === 409) {
        setSaveMessage("That username is already in use.");
      } else if (statusCode === 422) {
        setSaveMessage("Username must be between 3 and 50 characters.");
      } else {
        setSaveMessage("Could not update username. Please try again.");
      }

      setSaveStatus("error");
    }
  }

  async function handlePasswordSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!token) {
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordStatus("error");
      setPasswordMessage("New password and confirmation must match.");
      return;
    }

    setPasswordStatus("saving");
    setPasswordMessage("");

    try {
      const response = await updateMyPassword(token, {
        current_password: currentPassword,
        new_password: newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordStatus("success");
      setPasswordMessage(response.message);
      showSuccessToast(response.message, { title: "Password updated" });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Could not update password";
      const statusMatch = message.match(/\((\d+)\)/);
      const statusCode = statusMatch ? Number(statusMatch[1]) : null;

      if (statusCode === 401) {
        setPasswordMessage("Current password is incorrect.");
      } else if (message.includes("must be different")) {
        setPasswordMessage("New password must be different from the current password.");
      } else if (statusCode === 422) {
        setPasswordMessage("New password must be at least 8 characters.");
      } else {
        setPasswordMessage("Could not update password. Please try again.");
      }

      setPasswordStatus("error");
    }
  }

  return (
    <main className="profile-page">
      <section className="profile-page__panel" aria-labelledby="profile-page-title">
        <h1 id="profile-page-title" className="profile-page__title">
          Your Profile
        </h1>

        <ul className="profile-page__stats" aria-label="Profile stats overview">
          <li className="profile-page__stat">
            <h2>Username</h2>
            <p>{user.username}</p>
          </li>
          <li className="profile-page__stat">
            <h2>Total XP</h2>
            <p>{xp}</p>
          </li>
          <li className="profile-page__stat">
            <h2>Current streak</h2>
            <p>{streakCount}</p>
          </li>
          <li className="profile-page__stat">
            <h2>Completed packages</h2>
            <p>{completedCount}</p>
          </li>
        </ul>

        <form
          className="profile-page__form"
          onSubmit={(event) => void handleUsernameSave(event)}
        >
          <label htmlFor="profile-username">
            Change username
            <input
              id="profile-username"
              type="text"
              minLength={3}
              maxLength={50}
              value={usernameInput}
              onChange={(event) => {
                setUsernameInput(event.target.value);
                if (saveStatus !== "idle") {
                  setSaveStatus("idle");
                  setSaveMessage("");
                }
              }}
              required
            />
          </label>
          <button type="submit" disabled={saveStatus === "saving"}>
            {saveStatus === "saving" ? "Saving..." : "Save username"}
          </button>
          {saveStatus === "success" && (
            <output className="profile-page__message profile-page__message--success">
              {saveMessage}
            </output>
          )}
          {saveStatus === "error" && (
            <p
              className="profile-page__message profile-page__message--error"
              role="alert"
            >
              {saveMessage}
            </p>
          )}
        </form>

        <form
          className="profile-page__form"
          onSubmit={(event) => void handlePasswordSave(event)}
        >
          <label htmlFor="profile-current-password">
            Current password
            <input
              id="profile-current-password"
              type="password"
              autoComplete="current-password"
              minLength={8}
              maxLength={128}
              value={currentPassword}
              onChange={(event) => {
                setCurrentPassword(event.target.value);
                if (passwordStatus !== "idle") {
                  setPasswordStatus("idle");
                  setPasswordMessage("");
                }
              }}
              required
            />
          </label>
          <label htmlFor="profile-new-password">
            New password
            <input
              id="profile-new-password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              value={newPassword}
              onChange={(event) => {
                setNewPassword(event.target.value);
                if (passwordStatus !== "idle") {
                  setPasswordStatus("idle");
                  setPasswordMessage("");
                }
              }}
              required
            />
          </label>
          <label htmlFor="profile-confirm-password">
            Confirm new password
            <input
              id="profile-confirm-password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              value={confirmPassword}
              onChange={(event) => {
                setConfirmPassword(event.target.value);
                if (passwordStatus !== "idle") {
                  setPasswordStatus("idle");
                  setPasswordMessage("");
                }
              }}
              required
            />
          </label>
          <button type="submit" disabled={passwordStatus === "saving"}>
            {passwordStatus === "saving" ? "Saving..." : "Save password"}
          </button>
          {passwordStatus === "success" && (
            <output className="profile-page__message profile-page__message--success">
              {passwordMessage}
            </output>
          )}
          {passwordStatus === "error" && (
            <p
              className="profile-page__message profile-page__message--error"
              role="alert"
            >
              {passwordMessage}
            </p>
          )}
        </form>

        <section
          className="profile-page__scores"
          aria-labelledby="profile-best-scores-title"
        >
          <h2 id="profile-best-scores-title">Per-package best scores</h2>

          {isLoadingStats ? (
            <p>Loading score details...</p>
          ) : statsError ? (
            <p
              className="profile-page__message profile-page__message--error"
              role="alert"
            >
              {statsError}
            </p>
          ) : scoreRows.length === 0 ? (
            <p>No package attempts yet.</p>
          ) : (
            <table>
              <caption className="profile-page__sr-only">
                Best scores by package
              </caption>
              <thead>
                <tr>
                  <th scope="col">Package</th>
                  <th scope="col">Best score</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {scoreRows.map((row) => (
                  <tr key={row.packageId}>
                    <td>{row.packageTitle}</td>
                    <td>{row.bestScorePercent}%</td>
                    <td>{row.completed ? "Completed" : "In progress"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </section>
    </main>
  );
}
