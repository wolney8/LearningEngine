import { useState } from "react";

import type { Difficulty } from "../types/difficulty";
import type { DifficultyResult, PackageTestResults } from "../types/testResult";

function getStorageKey(packageId: string): string {
  return `lle_test_results_${packageId}`;
}

export function readResults(packageId: string): PackageTestResults {
  try {
    const raw = localStorage.getItem(getStorageKey(packageId));
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as PackageTestResults;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function writeResults(packageId: string, data: PackageTestResults): void {
  try {
    localStorage.setItem(getStorageKey(packageId), JSON.stringify(data));
  } catch {
    // Private browsing or storage quota exceeded - silently no-op
  }
}

export function useTestResults(packageId: string): {
  results: PackageTestResults;
  saveResult: (difficulty: Difficulty, incoming: DifficultyResult) => void;
} {
  const [results, setResults] = useState<PackageTestResults>(() =>
    readResults(packageId),
  );

  function saveResult(difficulty: Difficulty, incoming: DifficultyResult): void {
    setResults((prev) => {
      const existing = prev[difficulty];
      const merged: DifficultyResult = {
        passed: (existing?.passed ?? false) || incoming.passed,
        bestScore: Math.max(existing?.bestScore ?? 0, incoming.bestScore),
        bestXpEarned: Math.max(existing?.bestXpEarned ?? 0, incoming.bestXpEarned),
        lastAttemptedAt: incoming.lastAttemptedAt,
      };

      const next: PackageTestResults = {
        ...prev,
        [difficulty]: merged,
      };

      writeResults(packageId, next);
      return next;
    });
  }

  return { results, saveResult };
}
