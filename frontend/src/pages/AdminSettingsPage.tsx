import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";

import type { Settings } from "../schemas/settings";
import {
  clearAdminToken,
  fetchAdminSettings,
  getAdminToken,
  updateAdminSettings,
} from "../services/api";
import "./AdminSettingsPage.css";

type NumberPath =
  | "version"
  | "xp.lesson_base_xp_per_correct"
  | "xp.base_xp_per_level"
  | "xp.first_completion_bonus"
  | "xp.attempt_multipliers.1"
  | "xp.attempt_multipliers.2"
  | "xp.attempt_multipliers.3"
  | "xp.hard_expert_exit_penalty"
  | "xp.hard_expert_low_answer_penalty"
  | "xp.min_correct_for_xp.easy"
  | "xp.min_correct_for_xp.normal"
  | "xp.min_correct_for_xp.hard"
  | "xp.min_correct_for_xp.expert"
  | "difficulty.seconds_per_question.easy"
  | "difficulty.seconds_per_question.normal"
  | "difficulty.seconds_per_question.hard"
  | "difficulty.seconds_per_question.expert"
  | "difficulty.xp_multiplier.easy"
  | "difficulty.xp_multiplier.normal"
  | "difficulty.xp_multiplier.hard"
  | "difficulty.xp_multiplier.expert";

function setNumberValue(settings: Settings, path: NumberPath, value: number): Settings {
  const next = structuredClone(settings);
  switch (path) {
    case "version":
      next.version = value;
      break;
    case "xp.lesson_base_xp_per_correct":
      next.xp.lesson_base_xp_per_correct = value;
      break;
    case "xp.base_xp_per_level":
      next.xp.base_xp_per_level = value;
      break;
    case "xp.first_completion_bonus":
      next.xp.first_completion_bonus = value;
      break;
    case "xp.attempt_multipliers.1":
      next.xp.attempt_multipliers["1"] = value;
      break;
    case "xp.attempt_multipliers.2":
      next.xp.attempt_multipliers["2"] = value;
      break;
    case "xp.attempt_multipliers.3":
      next.xp.attempt_multipliers["3"] = value;
      break;
    case "xp.hard_expert_exit_penalty":
      next.xp.hard_expert_exit_penalty = value;
      break;
    case "xp.hard_expert_low_answer_penalty":
      next.xp.hard_expert_low_answer_penalty = value;
      break;
    case "xp.min_correct_for_xp.easy":
      next.xp.min_correct_for_xp.easy = value;
      break;
    case "xp.min_correct_for_xp.normal":
      next.xp.min_correct_for_xp.normal = value;
      break;
    case "xp.min_correct_for_xp.hard":
      next.xp.min_correct_for_xp.hard = value;
      break;
    case "xp.min_correct_for_xp.expert":
      next.xp.min_correct_for_xp.expert = value;
      break;
    case "difficulty.seconds_per_question.easy":
      next.difficulty.seconds_per_question.easy = value;
      break;
    case "difficulty.seconds_per_question.normal":
      next.difficulty.seconds_per_question.normal = value;
      break;
    case "difficulty.seconds_per_question.hard":
      next.difficulty.seconds_per_question.hard = value;
      break;
    case "difficulty.seconds_per_question.expert":
      next.difficulty.seconds_per_question.expert = value;
      break;
    case "difficulty.xp_multiplier.easy":
      next.difficulty.xp_multiplier.easy = value;
      break;
    case "difficulty.xp_multiplier.normal":
      next.difficulty.xp_multiplier.normal = value;
      break;
    case "difficulty.xp_multiplier.hard":
      next.difficulty.xp_multiplier.hard = value;
      break;
    case "difficulty.xp_multiplier.expert":
      next.difficulty.xp_multiplier.expert = value;
      break;
    default:
      break;
  }
  return next;
}

export function AdminSettingsPage() {
  const token = useMemo(() => getAdminToken(), []);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [status, setStatus] = useState<"loading" | "saving" | "ready" | "error">(
    "loading",
  );
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    if (!token) {
      return;
    }

    const load = async () => {
      try {
        const data = await fetchAdminSettings(token);
        setSettings(data);
        setStatus("ready");
      } catch {
        setStatus("error");
      }
    };

    void load();
  }, [token]);

  if (!token) {
    return <Navigate to="/admin" replace />;
  }
  const adminToken = token;

  async function handleSave() {
    if (!settings) {
      return;
    }

    setStatus("saving");
    setMessage("");
    try {
      const updated = await updateAdminSettings(adminToken, settings);
      setSettings(updated);
      setStatus("ready");
      setMessage("Settings saved.");
    } catch {
      setStatus("error");
      setMessage("Could not save settings.");
    }
  }

  const fields: Array<{ key: NumberPath; label: string; step?: string }> = [
    { key: "version", label: "Version" },
    { key: "xp.lesson_base_xp_per_correct", label: "XP per correct" },
    { key: "xp.base_xp_per_level", label: "Base XP per level" },
    { key: "xp.first_completion_bonus", label: "First completion bonus" },
    {
      key: "xp.attempt_multipliers.1",
      label: "Attempt multiplier #1",
      step: "0.01",
    },
    {
      key: "xp.attempt_multipliers.2",
      label: "Attempt multiplier #2",
      step: "0.01",
    },
    {
      key: "xp.attempt_multipliers.3",
      label: "Attempt multiplier #3",
      step: "0.01",
    },
    { key: "xp.hard_expert_exit_penalty", label: "Hard/expert exit penalty" },
    {
      key: "xp.hard_expert_low_answer_penalty",
      label: "Hard/expert low-answer penalty",
    },
    { key: "xp.min_correct_for_xp.easy", label: "Min correct for XP (easy)" },
    {
      key: "xp.min_correct_for_xp.normal",
      label: "Min correct for XP (normal)",
    },
    { key: "xp.min_correct_for_xp.hard", label: "Min correct for XP (hard)" },
    {
      key: "xp.min_correct_for_xp.expert",
      label: "Min correct for XP (expert)",
    },
    {
      key: "difficulty.seconds_per_question.easy",
      label: "Seconds/question (easy)",
    },
    {
      key: "difficulty.seconds_per_question.normal",
      label: "Seconds/question (normal)",
    },
    {
      key: "difficulty.seconds_per_question.hard",
      label: "Seconds/question (hard)",
    },
    {
      key: "difficulty.seconds_per_question.expert",
      label: "Seconds/question (expert)",
    },
    {
      key: "difficulty.xp_multiplier.easy",
      label: "Difficulty multiplier (easy)",
      step: "0.01",
    },
    {
      key: "difficulty.xp_multiplier.normal",
      label: "Difficulty multiplier (normal)",
      step: "0.01",
    },
    {
      key: "difficulty.xp_multiplier.hard",
      label: "Difficulty multiplier (hard)",
      step: "0.01",
    },
    {
      key: "difficulty.xp_multiplier.expert",
      label: "Difficulty multiplier (expert)",
      step: "0.01",
    },
  ];

  function readValue(s: Settings, path: NumberPath): number {
    switch (path) {
      case "version":
        return s.version;
      case "xp.lesson_base_xp_per_correct":
        return s.xp.lesson_base_xp_per_correct;
      case "xp.base_xp_per_level":
        return s.xp.base_xp_per_level;
      case "xp.first_completion_bonus":
        return s.xp.first_completion_bonus;
      case "xp.attempt_multipliers.1":
        return s.xp.attempt_multipliers["1"];
      case "xp.attempt_multipliers.2":
        return s.xp.attempt_multipliers["2"];
      case "xp.attempt_multipliers.3":
        return s.xp.attempt_multipliers["3"];
      case "xp.hard_expert_exit_penalty":
        return s.xp.hard_expert_exit_penalty;
      case "xp.hard_expert_low_answer_penalty":
        return s.xp.hard_expert_low_answer_penalty;
      case "xp.min_correct_for_xp.easy":
        return s.xp.min_correct_for_xp.easy;
      case "xp.min_correct_for_xp.normal":
        return s.xp.min_correct_for_xp.normal;
      case "xp.min_correct_for_xp.hard":
        return s.xp.min_correct_for_xp.hard;
      case "xp.min_correct_for_xp.expert":
        return s.xp.min_correct_for_xp.expert;
      case "difficulty.seconds_per_question.easy":
        return s.difficulty.seconds_per_question.easy;
      case "difficulty.seconds_per_question.normal":
        return s.difficulty.seconds_per_question.normal;
      case "difficulty.seconds_per_question.hard":
        return s.difficulty.seconds_per_question.hard;
      case "difficulty.seconds_per_question.expert":
        return s.difficulty.seconds_per_question.expert;
      case "difficulty.xp_multiplier.easy":
        return s.difficulty.xp_multiplier.easy;
      case "difficulty.xp_multiplier.normal":
        return s.difficulty.xp_multiplier.normal;
      case "difficulty.xp_multiplier.hard":
        return s.difficulty.xp_multiplier.hard;
      case "difficulty.xp_multiplier.expert":
        return s.difficulty.xp_multiplier.expert;
      default:
        return 0;
    }
  }

  return (
    <main className="admin-page">
      <header className="admin-page__header">
        <h1>Admin Settings</h1>
        <nav aria-label="Admin navigation">
          <Link to="/admin/settings">Settings</Link>
          <Link to="/admin/packages">Packages</Link>
          <button
            type="button"
            onClick={() => {
              clearAdminToken();
              location.assign("/admin");
            }}
          >
            Sign out
          </button>
        </nav>
      </header>

      {status === "loading" && <p aria-busy="true">Loading settings…</p>}
      {status === "error" && <p role="alert">Could not load admin settings.</p>}

      {settings && (
        <section className="admin-page__panel" aria-label="Editable settings">
          <div className="admin-page__grid">
            {fields.map((field) => (
              <label key={field.key} className="admin-page__field">
                <span>{field.label}</span>
                <input
                  type="number"
                  step={field.step ?? "1"}
                  value={readValue(settings, field.key)}
                  onChange={(event) =>
                    setSettings(
                      setNumberValue(settings, field.key, Number(event.target.value)),
                    )
                  }
                />
              </label>
            ))}
          </div>

          <div className="admin-page__actions">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={status === "saving"}
            >
              {status === "saving" ? "Saving…" : "Save Settings"}
            </button>
            {message && <p aria-live="polite">{message}</p>}
          </div>
        </section>
      )}
    </main>
  );
}
