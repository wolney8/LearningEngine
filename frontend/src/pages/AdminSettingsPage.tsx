import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useBlocker } from "react-router-dom";

import { useAuth } from "../hooks/useAuth";
import { useCelebrationEffects } from "../hooks/useCelebrationEffects";
import type { Settings } from "../schemas/settings";
import {
  type AdminAIConfig,
  fetchAdminAIConfig,
  fetchAdminSettings,
  testAdminAIConnection,
  updateAdminAIConfig,
  updateAdminSettings,
} from "../services/api";
import {
  ADMIN_TASK_NOTICE_EVENT,
  type AdminTaskNotice,
  type AdminTaskNoticeLevel,
  consumeNextAdminTaskNotice,
  enqueueAdminTaskNotice,
} from "../utils/adminTaskNotices";
import "./AdminSettingsPage.css";

const LIGHTNING_PREVIEW_DURATION_MS = 640;

const GEMINI_MODEL_PRESETS = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.5-pro",
  "gemini-2.0-flash",
  "gemini-2.0-flash-exp",
] as const;

type GeminiModelPreset = (typeof GEMINI_MODEL_PRESETS)[number];
type GeminiModelSelection = GeminiModelPreset | "custom";

function resolveGeminiModelSelection(model: string): GeminiModelSelection {
  if (GEMINI_MODEL_PRESETS.some((preset) => preset === model)) {
    return model as GeminiModelPreset;
  }

  return "custom";
}

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

type BooleanPath =
  | "celebration_effects.enabled"
  | "celebration_effects.confetti_on_pass"
  | "celebration_effects.confetti_on_bonus_xp_gain"
  | "celebration_effects.lightning_on_streak_milestones"
  | "celebration_effects.respect_reduced_motion";

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

function setBooleanValue(
  settings: Settings,
  path: BooleanPath,
  value: boolean,
): Settings {
  const next = structuredClone(settings);
  switch (path) {
    case "celebration_effects.enabled":
      next.celebration_effects.enabled = value;
      break;
    case "celebration_effects.confetti_on_pass":
      next.celebration_effects.confetti_on_pass = value;
      break;
    case "celebration_effects.confetti_on_bonus_xp_gain":
      next.celebration_effects.confetti_on_bonus_xp_gain = value;
      break;
    case "celebration_effects.lightning_on_streak_milestones":
      next.celebration_effects.lightning_on_streak_milestones = value;
      break;
    case "celebration_effects.respect_reduced_motion":
      next.celebration_effects.respect_reduced_motion = value;
      break;
    default:
      break;
  }
  return next;
}

export function AdminSettingsPage() {
  const { status: authStatus, token, user, logout } = useAuth();
  const canAccess = authStatus === "authenticated" && user?.role === "admin";
  const [settings, setSettings] = useState<Settings | null>(null);
  const [aiConfig, setAIConfig] = useState<AdminAIConfig | null>(null);
  const [status, setStatus] = useState<"loading" | "saving" | "ready" | "error">(
    "loading",
  );
  const [message, setMessage] = useState<string>("");
  const [aiProvider, setAIProvider] = useState<"gemini">("gemini");
  const [aiModel, setAIModel] = useState<string>("");
  const [aiModelSelection, setAIModelSelection] =
    useState<GeminiModelSelection>("gemini-2.5-flash");
  const [aiApiKey, setAIApiKey] = useState<string>("");
  const [aiSaving, setAISaving] = useState<boolean>(false);
  const [aiTesting, setAITesting] = useState<boolean>(false);
  const [aiMessage, setAIMessage] = useState<string>("");
  const [aiTestedModel, setAITestedModel] = useState<string>("");
  const [isLightningPreviewActive, setLightningPreviewActive] =
    useState<boolean>(false);
  const [celebrationPreviewMessage, setCelebrationPreviewMessage] =
    useState<string>("");
  const lightningPreviewTimerRef = useRef<number | null>(null);
  const [persistedNotice, setPersistedNotice] = useState<AdminTaskNotice | null>(null);
  const shouldPersistCompletionNoticeRef = useRef(false);

  const { lightningEnabled, shouldReduceMotion, canTriggerConfetti, triggerConfetti } =
    useCelebrationEffects({
      celebrationSettingsOverride: settings?.celebration_effects,
    });

  const isActionInFlight = status === "saving" || aiSaving || aiTesting;

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isActionInFlight && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (!canAccess || !token) {
      return;
    }

    const load = async () => {
      try {
        const [settingsData, aiData] = await Promise.all([
          fetchAdminSettings(token),
          fetchAdminAIConfig(token),
        ]);
        setSettings(settingsData);
        setAIConfig(aiData);
        setAIProvider(aiData.provider);
        setAIModel(aiData.model);
        setAIModelSelection(resolveGeminiModelSelection(aiData.model));
        setAIApiKey("");
        setAIMessage("");
        setStatus("ready");
      } catch {
        setStatus("error");
      }
    };

    void load();
  }, [canAccess, token]);

  useEffect(() => {
    return () => {
      if (lightningPreviewTimerRef.current !== null) {
        window.clearTimeout(lightningPreviewTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (blocker.state !== "blocked") {
      return;
    }

    const shouldLeave = window.confirm(
      "An admin action is still running. Leave this page anyway? The backend task will continue.",
    );
    if (shouldLeave) {
      shouldPersistCompletionNoticeRef.current = true;
      blocker.proceed();
      return;
    }
    blocker.reset();
  }, [blocker]);

  useEffect(() => {
    const consumeNotice = () => {
      const nextNotice = consumeNextAdminTaskNotice();
      if (nextNotice) {
        setPersistedNotice(nextNotice);
      }
    };

    consumeNotice();
    window.addEventListener(ADMIN_TASK_NOTICE_EVENT, consumeNotice);
    return () => {
      window.removeEventListener(ADMIN_TASK_NOTICE_EVENT, consumeNotice);
    };
  }, []);

  useEffect(() => {
    if (!isActionInFlight) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isActionInFlight]);

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

  function persistCompletionNotice(level: AdminTaskNoticeLevel, message: string) {
    if (!shouldPersistCompletionNoticeRef.current) {
      return;
    }

    enqueueAdminTaskNotice(level, message);
  }

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
      persistCompletionNotice("success", "Settings saved.");
    } catch {
      setStatus("error");
      setMessage("Could not save settings.");
      persistCompletionNotice("error", "Could not save settings.");
    }
  }

  async function handleSaveAIConfig() {
    if (!aiModel.trim()) {
      setAIMessage("Model is required.");
      return;
    }

    setAISaving(true);
    setAIMessage("");
    try {
      const updated = await updateAdminAIConfig(adminToken, {
        provider: aiProvider,
        model: aiModel.trim(),
      });
      setAIConfig(updated);
      setAIProvider(updated.provider);
      setAIModel(updated.model);
      setAIModelSelection(resolveGeminiModelSelection(updated.model));
      setAIMessage("AI config saved.");
      persistCompletionNotice("success", "AI config saved.");
    } catch {
      setAIMessage("Could not save AI config.");
      persistCompletionNotice("error", "Could not save AI config.");
    } finally {
      setAISaving(false);
    }
  }

  async function handleTestAIConnection() {
    if (!aiApiKey.trim()) {
      setAIMessage("API key is required for connection test.");
      setAITestedModel("");
      return;
    }

    setAITesting(true);
    setAIMessage("");
    setAITestedModel("");
    try {
      const result = await testAdminAIConnection(adminToken, {
        api_key: aiApiKey,
        provider: aiProvider,
        model: aiModel.trim() || undefined,
      });
      setAIMessage(result.message);
      setAITestedModel(result.model_used);
      persistCompletionNotice("success", result.message);
    } catch {
      const safeErrorMessage =
        "Could not run AI connection test. Check provider, model, and API key.";
      setAIMessage(safeErrorMessage);
      persistCompletionNotice("error", safeErrorMessage);
    } finally {
      setAIApiKey("");
      setAITesting(false);
    }
  }

  function handleModelSelectionChange(selection: GeminiModelSelection) {
    setAIModelSelection(selection);
    if (selection !== "custom") {
      setAIModel(selection);
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

  const celebrationFields: Array<{ key: BooleanPath; label: string }> = [
    { key: "celebration_effects.enabled", label: "Enabled" },
    {
      key: "celebration_effects.confetti_on_pass",
      label: "Confetti on pass",
    },
    {
      key: "celebration_effects.confetti_on_bonus_xp_gain",
      label: "Confetti on bonus XP gain",
    },
    {
      key: "celebration_effects.lightning_on_streak_milestones",
      label: "Lightning on streak milestones",
    },
    {
      key: "celebration_effects.respect_reduced_motion",
      label: "Respect reduced motion",
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

  function readBooleanValue(s: Settings, path: BooleanPath): boolean {
    switch (path) {
      case "celebration_effects.enabled":
        return s.celebration_effects.enabled;
      case "celebration_effects.confetti_on_pass":
        return s.celebration_effects.confetti_on_pass;
      case "celebration_effects.confetti_on_bonus_xp_gain":
        return s.celebration_effects.confetti_on_bonus_xp_gain;
      case "celebration_effects.lightning_on_streak_milestones":
        return s.celebration_effects.lightning_on_streak_milestones;
      case "celebration_effects.respect_reduced_motion":
        return s.celebration_effects.respect_reduced_motion;
      default:
        return false;
    }
  }

  function handlePreviewConfetti() {
    if (!canTriggerConfetti("pass")) {
      setCelebrationPreviewMessage(
        shouldReduceMotion
          ? "Confetti preview skipped because reduced motion is active."
          : "Confetti preview blocked by current celebration settings.",
      );
      return;
    }

    triggerConfetti("pass");
    setCelebrationPreviewMessage("Confetti preview requested.");
  }

  function handlePreviewLightning() {
    if (!lightningEnabled) {
      setLightningPreviewActive(false);
      setCelebrationPreviewMessage(
        shouldReduceMotion
          ? "Lightning preview skipped because reduced motion is active."
          : "Lightning preview blocked by current celebration settings.",
      );
      return;
    }

    if (lightningPreviewTimerRef.current !== null) {
      window.clearTimeout(lightningPreviewTimerRef.current);
    }

    setLightningPreviewActive(true);
    setCelebrationPreviewMessage("Lightning preview active.");
    lightningPreviewTimerRef.current = window.setTimeout(() => {
      setLightningPreviewActive(false);
      lightningPreviewTimerRef.current = null;
    }, LIGHTNING_PREVIEW_DURATION_MS);
  }

  return (
    <main className="admin-page">
      <header className="admin-page__header">
        <h1>Admin Settings</h1>
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

      {status === "loading" && <p aria-busy="true">Loading settings…</p>}
      {status === "error" && <p role="alert">Could not load admin settings.</p>}
      {persistedNotice && (
        <div aria-live={persistedNotice.level === "error" ? "assertive" : "polite"}>
          <p
            data-testid="admin-persisted-task-notice"
            role={persistedNotice.level === "error" ? "alert" : undefined}
          >
            {persistedNotice.message}
          </p>
        </div>
      )}

      {settings && (
        <>
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

            <fieldset className="admin-page__fieldset">
              <legend>Celebration effects</legend>
              <div className="admin-page__toggle-grid">
                {celebrationFields.map((field) => (
                  <label key={field.key} className="admin-page__toggle">
                    <input
                      type="checkbox"
                      checked={readBooleanValue(settings, field.key)}
                      onChange={(event) =>
                        setSettings(
                          setBooleanValue(settings, field.key, event.target.checked),
                        )
                      }
                    />
                    <span>{field.label}</span>
                  </label>
                ))}
              </div>

              <section className="admin-page__preview" aria-label="Celebration preview">
                <h3 className="admin-page__preview-title">Celebration preview</h3>
                <p className="admin-page__preview-hint">
                  Trigger preview effects using the current form values before saving.
                </p>
                <div className="admin-page__preview-actions">
                  <button
                    type="button"
                    onClick={handlePreviewConfetti}
                    aria-label="Preview confetti"
                  >
                    Preview confetti
                  </button>
                  <button
                    type="button"
                    onClick={handlePreviewLightning}
                    aria-label="Preview lightning"
                  >
                    Preview lightning
                  </button>
                </div>
                <div
                  className={`admin-page__lightning-preview ${
                    isLightningPreviewActive
                      ? "admin-page__lightning-preview--active"
                      : ""
                  }`}
                  data-testid="celebration-lightning-preview"
                  data-state={isLightningPreviewActive ? "active" : "idle"}
                  aria-hidden="true"
                />
                <p
                  className="admin-page__preview-status"
                  data-testid="celebration-preview-status"
                  aria-live="polite"
                >
                  {celebrationPreviewMessage}
                </p>
              </section>
            </fieldset>

            <div className="admin-page__actions">
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={status === "saving"}
                aria-busy={status === "saving"}
              >
                <span className="admin-page__button-content">
                  {status === "saving" && (
                    <span className="admin-page__button-spinner" aria-hidden="true" />
                  )}
                  <span>Save Settings</span>
                </span>
              </button>
              {message && <p aria-live="polite">{message}</p>}
            </div>
          </section>

          <section className="admin-page__panel" aria-label="AI configuration">
            <h2>AI configuration</h2>
            <div className="admin-page__grid admin-page__grid--ai">
              <label className="admin-page__field">
                <span>Provider</span>
                <select
                  value={aiProvider}
                  onChange={(event) => setAIProvider(event.target.value as "gemini")}
                >
                  <option value="gemini">gemini</option>
                </select>
              </label>

              <label className="admin-page__field">
                <span>Model preset</span>
                <select
                  value={aiModelSelection}
                  onChange={(event) =>
                    handleModelSelectionChange(
                      event.target.value as GeminiModelSelection,
                    )
                  }
                >
                  {GEMINI_MODEL_PRESETS.map((preset) => (
                    <option key={preset} value={preset}>
                      {preset}
                    </option>
                  ))}
                  <option value="custom">Custom model…</option>
                </select>
              </label>

              {aiModelSelection === "custom" && (
                <label className="admin-page__field admin-page__field--wide">
                  <span>Custom model</span>
                  <input
                    type="text"
                    value={aiModel}
                    onChange={(event) => setAIModel(event.target.value)}
                    placeholder="Enter full model name"
                  />
                </label>
              )}

              <label className="admin-page__field">
                <span>Connection test API key (write-only)</span>
                <input
                  type="password"
                  value={aiApiKey}
                  onChange={(event) => setAIApiKey(event.target.value)}
                  autoComplete="off"
                />
              </label>
            </div>

            <div className="admin-page__actions">
              <button
                type="button"
                onClick={() => void handleSaveAIConfig()}
                disabled={aiSaving}
                aria-busy={aiSaving}
              >
                <span className="admin-page__button-content">
                  {aiSaving && (
                    <span className="admin-page__button-spinner" aria-hidden="true" />
                  )}
                  <span>Save AI Config</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => void handleTestAIConnection()}
                disabled={aiTesting}
                aria-busy={aiTesting}
              >
                <span className="admin-page__button-content">
                  {aiTesting && (
                    <span className="admin-page__button-spinner" aria-hidden="true" />
                  )}
                  <span>Test AI Connection</span>
                </span>
              </button>
              {aiConfig && (
                <p aria-live="polite">
                  Key present in runtime env: {aiConfig.key_present ? "Yes" : "No"}
                </p>
              )}
              {aiMessage && (
                <p aria-live="polite">
                  {aiMessage}
                  {aiTestedModel ? ` Model tested: ${aiTestedModel}.` : ""}
                </p>
              )}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
