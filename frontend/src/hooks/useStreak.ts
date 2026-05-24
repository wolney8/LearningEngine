import { useEffect, useRef, useState } from "react";
import {
  ANONYMOUS_LOCAL_STORAGE_KEYS,
  fetchMyStreak,
  markMyStreakPractisedToday,
} from "../services/api";
import { useAuth } from "./useAuth";

const LAST_ACTIVE_KEY = ANONYMOUS_LOCAL_STORAGE_KEYS.lastActive;
const DAILY_STREAK_KEY = ANONYMOUS_LOCAL_STORAGE_KEYS.dailyStreak;

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
  const { token, status } = useAuth();
  const [dailyStreak, setDailyStreak] = useState<number>(readStreak);
  const requestChain = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (status !== "authenticated" || !token) {
      setDailyStreak(readStreak());
      return;
    }

    let cancelled = false;
    void fetchMyStreak(token)
      .then((snapshot) => {
        if (cancelled) return;
        setDailyStreak(snapshot.streak_count);
      })
      .catch(() => {
        if (cancelled) return;
        setDailyStreak(readStreak());
      });

    return () => {
      cancelled = true;
    };
  }, [status, token]);

  function markPractised(): void {
    if (status === "authenticated" && token) {
      requestChain.current = requestChain.current
        .then(async () => {
          const snapshot = await markMyStreakPractisedToday(token);
          setDailyStreak(snapshot.streak_count);
        })
        .catch(() => {
          // Keep UI responsive if the save fails; backend state remains authoritative.
        });
      return;
    }

    const lastActive = readLastActive();
    const today = todayISO();

    if (lastActive === today) {
      // Already practised today - no change
      return;
    }

    const next = lastActive === yesterdayISO() ? readStreak() + 1 : 1;

    writeStreak(next);
    setDailyStreak(next);
  }

  return { dailyStreak, markPractised };
}
