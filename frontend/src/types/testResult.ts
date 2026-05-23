import type { Difficulty } from "./difficulty";

export interface DifficultyResult {
  /** True once the user has ever passed this difficulty. Sticky - never reverts to false. */
  passed: boolean;
  /** Best percentage score achieved (0-100 integer). */
  bestScore: number;
  /** XP earned in the best-scoring attempt (not cumulative). */
  bestXpEarned: number;
  /** ISO date string YYYY-MM-DD of the last attempt, regardless of pass/fail. */
  lastAttemptedAt: string;
}

/**
 * Only contains keys for difficulties that have been attempted at least once.
 * Absent key === never attempted.
 */
export type PackageTestResults = Partial<Record<Difficulty, DifficultyResult>>;
