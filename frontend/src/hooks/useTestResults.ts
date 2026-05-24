import { useEffect, useRef, useState } from "react";

import type { UserProgressRecord } from "../schemas/progress";
import { fetchMyProgress, upsertMyProgressForPackage } from "../services/api";
import type { Difficulty } from "../types/difficulty";
import type { DifficultyResult, PackageTestResults } from "../types/testResult";
import { useAuth } from "./useAuth";

let cachedProgressToken: string | null = null;
let cachedProgressByPackage: Map<string, UserProgressRecord> | null = null;
let cachedProgressRequest: Promise<Map<string, UserProgressRecord>> | null = null;

export interface ProgressMetadata {
  attemptCount: number;
  firstCompletedAt: string | null;
}

interface SaveResultOptions {
  attemptCount?: number;
}

function toPackageResultsFromServerRow(row: UserProgressRecord): PackageTestResults {
  return {
    normal: {
      passed: row.completed,
      bestScore: Math.round(row.latest_weighted_score * 100),
      bestXpEarned: 0,
      lastAttemptedAt: row.updated_at,
    },
  };
}

async function loadProgressCache(
  token: string,
): Promise<Map<string, UserProgressRecord>> {
  if (cachedProgressToken !== token) {
    cachedProgressToken = token;
    cachedProgressByPackage = null;
    cachedProgressRequest = null;
  }

  if (cachedProgressByPackage) {
    return cachedProgressByPackage;
  }

  if (cachedProgressRequest) {
    return cachedProgressRequest;
  }

  cachedProgressRequest = fetchMyProgress(token)
    .then((rows) => {
      const map = new Map<string, UserProgressRecord>();
      for (const row of rows) {
        map.set(row.package_id, row);
      }
      cachedProgressByPackage = map;
      return map;
    })
    .catch(() => {
      const map = new Map<string, UserProgressRecord>();
      cachedProgressByPackage = map;
      return map;
    })
    .finally(() => {
      cachedProgressRequest = null;
    });

  return cachedProgressRequest;
}

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
  progressMetadata: ProgressMetadata | null;
  saveResult: (
    difficulty: Difficulty,
    incoming: DifficultyResult,
    options?: SaveResultOptions,
  ) => void;
} {
  const { status, token } = useAuth();
  const [results, setResults] = useState<PackageTestResults>(() =>
    readResults(packageId),
  );
  const [progressMetadata, setProgressMetadata] = useState<ProgressMetadata | null>(
    null,
  );
  const resultsRef = useRef(results);

  useEffect(() => {
    resultsRef.current = results;
  }, [results]);

  useEffect(() => {
    if (status !== "authenticated" || !token) {
      setResults(readResults(packageId));
      setProgressMetadata(null);
      return;
    }

    let cancelled = false;
    void loadProgressCache(token).then((map) => {
      if (cancelled) return;
      const row = map.get(packageId);
      const nextResults = row ? toPackageResultsFromServerRow(row) : {};
      setResults(nextResults);
      resultsRef.current = nextResults;
      setProgressMetadata({
        attemptCount: row?.attempt_count ?? 0,
        firstCompletedAt: row?.first_completed_at ?? null,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [packageId, status, token]);

  function saveResult(
    difficulty: Difficulty,
    incoming: DifficultyResult,
    options?: SaveResultOptions,
  ): void {
    const previous = resultsRef.current;
    const existing = previous[difficulty];
    const merged: DifficultyResult = {
      passed: (existing?.passed ?? false) || incoming.passed,
      bestScore: Math.max(existing?.bestScore ?? 0, incoming.bestScore),
      bestXpEarned: Math.max(existing?.bestXpEarned ?? 0, incoming.bestXpEarned),
      lastAttemptedAt: incoming.lastAttemptedAt,
    };

    const next: PackageTestResults = {
      ...previous,
      [difficulty]: merged,
    };

    resultsRef.current = next;
    setResults(next);

    if (status === "authenticated" && token) {
      const previousRow = cachedProgressByPackage?.get(packageId) ?? null;
      const completed = Object.values(next).some((result) => result.passed);
      const latestWeightedScore = Math.min(1, Math.max(0, incoming.bestScore / 100));

      void upsertMyProgressForPackage(token, packageId, {
        latest_weighted_score: latestWeightedScore,
        completed,
        attempt_count:
          options?.attemptCount ?? (previousRow ? previousRow.attempt_count + 1 : 1),
      }).then((saved) => {
        if (!cachedProgressByPackage) {
          cachedProgressByPackage = new Map<string, UserProgressRecord>();
        }
        cachedProgressByPackage.set(packageId, saved);
        setResults(toPackageResultsFromServerRow(saved));
        resultsRef.current = toPackageResultsFromServerRow(saved);
        setProgressMetadata({
          attemptCount: saved.attempt_count,
          firstCompletedAt: saved.first_completed_at,
        });
      });
      return;
    }

    writeResults(packageId, next);
  }

  return { results, progressMetadata, saveResult };
}
