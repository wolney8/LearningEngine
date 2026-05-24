import { useState } from "react";
import { getAnonymousFirstCompletionKey } from "../services/api";

export function useFirstCompletion(packageId: string): {
  isFirstCompletion: boolean;
  markCompleted: () => void;
} {
  const key = getAnonymousFirstCompletionKey(packageId);

  function hasCompleted(): boolean {
    try {
      return localStorage.getItem(key) === "1";
    } catch {
      return false;
    }
  }

  const [completed, setCompleted] = useState<boolean>(hasCompleted);

  function markCompleted(): void {
    if (completed) return;
    try {
      localStorage.setItem(key, "1");
    } catch {
      // private browsing / quota exceeded - no-op
    }
    setCompleted(true);
  }

  return { isFirstCompletion: !completed, markCompleted };
}
