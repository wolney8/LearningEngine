import { useState } from "react";

const XP_KEY = "lle_xp";

function readXP(): number {
  try {
    const raw = localStorage.getItem(XP_KEY);
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

function writeXP(value: number): void {
  try {
    localStorage.setItem(XP_KEY, String(value));
  } catch {
    // Private browsing or storage quota exceeded - silently no-op
  }
}

export function useXP(): { xp: number; addXP: (amount: number) => void } {
  const [xp, setXP] = useState<number>(readXP);

  function addXP(amount: number): void {
    setXP((prev) => {
      const next = prev + amount;
      writeXP(next);
      return next;
    });
  }

  return { xp, addXP };
}
