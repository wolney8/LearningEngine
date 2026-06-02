import confetti from "canvas-confetti";
import { useEffect, useMemo, useState } from "react";
import type { Settings } from "../schemas/settings";
import { useSettings } from "./useSettings";

type ConfettiKind = "pass" | "bonus";
type CelebrationSettings = Settings["celebration_effects"];

interface UseCelebrationEffectsOptions {
  celebrationSettingsOverride?: CelebrationSettings;
}

function readReducedMotionPreference(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useCelebrationEffects(options?: UseCelebrationEffectsOptions): {
  effectsEnabled: boolean;
  shouldReduceMotion: boolean;
  lightningEnabled: boolean;
  canTriggerConfetti: (kind: ConfettiKind) => boolean;
  triggerConfetti: (kind: ConfettiKind) => boolean;
} {
  const { settings } = useSettings();
  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean>(
    readReducedMotionPreference,
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const listener = () => setPrefersReducedMotion(mediaQuery.matches);

    mediaQuery.addEventListener("change", listener);
    return () => {
      mediaQuery.removeEventListener("change", listener);
    };
  }, []);

  const celebrationSettings =
    options?.celebrationSettingsOverride ?? settings.celebration_effects;

  const effectsEnabled = celebrationSettings.enabled;

  const shouldReduceMotion =
    celebrationSettings.respect_reduced_motion && prefersReducedMotion;

  const lightningEnabled =
    effectsEnabled &&
    celebrationSettings.lightning_on_streak_milestones &&
    !shouldReduceMotion;

  const canTriggerPassConfetti =
    effectsEnabled && celebrationSettings.confetti_on_pass;
  const canTriggerBonusConfetti =
    effectsEnabled && celebrationSettings.confetti_on_bonus_xp_gain;

  const confettiDefaults = useMemo(
    () => ({
      particleCount: 120,
      spread: 72,
      startVelocity: 36,
      gravity: 0.95,
      ticks: 220,
      origin: { y: 0.32 },
      colors: ["#1d4ed8", "#0ea5e9", "#22c55e", "#f59e0b"],
    }),
    [],
  );

  function canTriggerConfetti(kind: ConfettiKind): boolean {
    if (shouldReduceMotion) {
      return false;
    }

    if (kind === "pass" && !canTriggerPassConfetti) {
      return false;
    }

    if (kind === "bonus" && !canTriggerBonusConfetti) {
      return false;
    }

    return true;
  }

  function triggerConfetti(kind: ConfettiKind): boolean {
    if (!canTriggerConfetti(kind)) {
      return false;
    }

    void confetti(confettiDefaults);
    return true;
  }

  return {
    effectsEnabled,
    shouldReduceMotion,
    lightningEnabled,
    canTriggerConfetti,
    triggerConfetti,
  };
}
