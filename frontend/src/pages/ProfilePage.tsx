import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useXP } from "../hooks/useXP";
import {
  fetchMyProgress,
  fetchMyStreak,
  fetchPackages,
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
  const { xp } = useXP();
  const [isLoadingStats, setLoadingStats] = useState(true);
  const [statsError, setStatsError] = useState("");
  const [streakCount, setStreakCount] = useState(0);
  const [scoreRows, setScoreRows] = useState<ProfileScoreRow[]>([]);
  const [usernameInput, setUsernameInput] = useState("");
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "success" | "error"
  >("idle");
  const [saveMessage, setSaveMessage] = useState("");

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

    void Promise.all([
      fetchMyStreak(token),
      fetchMyProgress(token),
      fetchPackages(),
    ])
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
      const message =
        err instanceof Error ? err.message : "Could not update profile";
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

  return (
    <main className="profile-page">
      <section
        className="profile-page__panel"
        aria-labelledby="profile-page-title"
      >
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
