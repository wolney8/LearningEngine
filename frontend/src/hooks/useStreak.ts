import { useState } from "react";

const LAST_ACTIVE_KEY = "lle_last_active";
const DAILY_STREAK_KEY = "lle_daily_streak";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function readStreak(): number {
  try {
    const raw = localStorage.getItem(DAILY_STREAK_KEY);
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

function readLastActive(): string | null {
  try {
    return localStorage.getItem(LAST_ACTIVE_KEY);
  } catch {
    return null;
  }
}

function writeStreak(streak: number): void {
  try {
    localStorage.setItem(DAILY_STREAK_KEY, String(streak));
    localStorage.setItem(LAST_ACTIVE_KEY, todayISO());
  } catch {
    // Silent no-op
  }
}

export function useStreak(): {
  dailyStreak: number;
  markPractised: () => void;
} {
  const [dailyStreak, setDailyStreak] = useState<number>(readStreak);

  function markPractised(): void {
    const lastActive = readLastActive();
    const today = todayISO();

    if (lastActive === today) {
      // Already practised today - no change
      return;
    }

    const next =
      lastActive === yesterdayISO()
        ? readStreak() + 1 // Consecutive day
        : 1; // Gap or first ever

    writeStreak(next);
    setDailyStreak(next);
  }

  return { dailyStreak, markPractised };
}
