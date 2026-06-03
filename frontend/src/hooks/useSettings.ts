import { useEffect, useState } from "react";
import type { Settings } from "../schemas/settings";
import { fetchSettings } from "../services/api";

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  xp: {
    lesson_base_xp_per_correct: 10,
    base_xp_per_level: 500,
    first_completion_bonus: 20,
    attempt_multipliers: {
      "1": 1.0,
      "2": 0.5,
      "3": 0.25,
    },
    hard_expert_exit_penalty: 50,
    hard_expert_low_answer_penalty: 50,
    min_correct_for_xp: {
      easy: 2,
      normal: 2,
      hard: 0,
      expert: 0,
    },
  },
  difficulty: {
    seconds_per_question: {
      easy: 90,
      normal: 45,
      hard: 20,
      expert: 10,
    },
    xp_multiplier: {
      easy: 0.5,
      normal: 1.0,
      hard: 1.5,
      expert: 2.0,
    },
  },
  content_refresh: {
    stale_after_days: 90,
  },
  ai: {
    provider: "gemini",
    model: "gemini-2.0-flash-exp",
  },
  spend_economy: {
    enabled: false,
    allow_non_admin_ai_generation_spend: false,
    costs: {
      generate_ai_course: 500,
      refresh_stale_course: 300,
      increase_difficulty_cap: 200,
      unlock_hidden_package: 250,
    },
  },
  celebration_effects: {
    enabled: false,
    confetti_on_pass: true,
    confetti_on_bonus_xp_gain: true,
    lightning_on_streak_milestones: true,
    respect_reduced_motion: true,
  },
};

let cachedSettings: Settings | null = null;
let cachedIsFallback = false;
let settingsPromise: Promise<Settings> | null = null;

async function loadSettings(): Promise<Settings> {
  if (cachedSettings !== null) {
    return cachedSettings;
  }

  if (settingsPromise !== null) {
    return settingsPromise;
  }

  settingsPromise = fetchSettings()
    .then((settings) => {
      cachedSettings = settings;
      cachedIsFallback = false;
      return settings;
    })
    .catch((error: unknown) => {
      console.warn("Falling back to local default settings", error);
      cachedSettings = DEFAULT_SETTINGS;
      cachedIsFallback = true;
      return DEFAULT_SETTINGS;
    })
    .finally(() => {
      settingsPromise = null;
    });

  return settingsPromise;
}

export function useSettings(): {
  settings: Settings;
  isLoading: boolean;
  isFallback: boolean;
} {
  const [settings, setSettings] = useState<Settings>(
    cachedSettings ?? DEFAULT_SETTINGS,
  );
  const [isLoading, setIsLoading] = useState<boolean>(cachedSettings === null);
  const [isFallback, setIsFallback] = useState<boolean>(cachedIsFallback);

  useEffect(() => {
    let cancelled = false;

    if (cachedSettings !== null) {
      setSettings(cachedSettings);
      setIsFallback(cachedIsFallback);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    void loadSettings()
      .then((nextSettings) => {
        if (cancelled) {
          return;
        }
        setSettings(nextSettings);
        setIsFallback(cachedIsFallback);
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { settings, isLoading, isFallback };
}
