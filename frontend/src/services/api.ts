import { z } from "zod";
import {
  AuthResponseSchema,
  LoginRequestSchema,
  RegisterRequestSchema,
  UserSchema,
} from "../schemas/auth";
import type {
  AuthResponse,
  LoginRequest,
  RegisterRequest,
  User,
} from "../schemas/auth";
import { PackageSchema, PackageSummarySchema } from "../schemas/package";
import type { Package, PackageSummary } from "../schemas/package";
import {
  UserProgressRecordSchema,
  UserProgressUpsertRequestSchema,
} from "../schemas/progress";
import type {
  UserProgressRecord,
  UserProgressUpsertRequest,
} from "../schemas/progress";
import { SettingsSchema } from "../schemas/settings";
import type { Settings } from "../schemas/settings";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
const TIMEOUT_MS = 10_000;
const ADMIN_TOKEN_KEY = "lle_admin_token";
const AUTH_TOKEN_KEY = "lle_auth_token";
const ANONYMOUS_XP_KEY = "lle_xp";
const ANONYMOUS_DAILY_STREAK_KEY = "lle_daily_streak";
const ANONYMOUS_LAST_ACTIVE_KEY = "lle_last_active";
const ANONYMOUS_ATTEMPT_KEY_PREFIX = "lle_attempt_";
const ANONYMOUS_FIRST_COMPLETION_KEY_PREFIX = "lle_completed_";
const ANONYMOUS_TEST_RESULTS_KEY_PREFIX = "lle_test_results_";
const XP_RECONCILIATION_DECISION_KEY_PREFIX = "lle_xp_reconciled_user_";
const ISO_LOCAL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const ANONYMOUS_LOCAL_STORAGE_KEYS = {
  xp: ANONYMOUS_XP_KEY,
  dailyStreak: ANONYMOUS_DAILY_STREAK_KEY,
  lastActive: ANONYMOUS_LAST_ACTIVE_KEY,
  attemptPrefix: ANONYMOUS_ATTEMPT_KEY_PREFIX,
  firstCompletionPrefix: ANONYMOUS_FIRST_COMPLETION_KEY_PREFIX,
  testResultsPrefix: ANONYMOUS_TEST_RESULTS_KEY_PREFIX,
} as const;

export interface AnonymousProgressSeed {
  package_id: string;
  latest_weighted_score: number;
  completed: boolean;
  attempt_count: number;
  first_completed_at: string | null;
}

export interface AnonymousStreakSnapshot {
  streak_count: number;
  last_practised_date: string | null;
}

const UserXPSchema = z.object({
  xp: z.number().int().nonnegative(),
});
const UserStreakSchema = z.object({
  streak_count: z.number().int().nonnegative(),
  last_practised_date: z.string().nullable(),
});
const UserStreakUpdateSchema = z.object({
  streak_count: z.number().int().nonnegative(),
  last_practised_date: z.string().regex(ISO_LOCAL_DATE_RE).nullable(),
});

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

export async function fetchPackages(): Promise<PackageSummary[]> {
  const response = await fetchWithTimeout(`${BASE_URL}/packages`);
  if (!response.ok) {
    throw new Error(`Failed to fetch packages: ${response.status}`);
  }
  const data: unknown = await response.json();
  return z.array(PackageSummarySchema).parse(data);
}

export async function fetchPackage(id: string): Promise<Package> {
  const encodedId = encodeURIComponent(id);
  const response = await fetchWithTimeout(`${BASE_URL}/packages/${encodedId}`);
  if (response.status === 404) {
    throw new Error(`Package '${id}' not found`);
  }
  if (!response.ok) {
    throw new Error(`Failed to fetch package '${id}': ${response.status}`);
  }
  const data: unknown = await response.json();
  return PackageSchema.parse(data);
}

export async function fetchSettings(): Promise<Settings> {
  const response = await fetchWithTimeout(`${BASE_URL}/api/settings`);
  if (!response.ok) {
    throw new Error(`Failed to fetch settings: ${response.status}`);
  }
  const data: unknown = await response.json();
  return SettingsSchema.parse(data);
}

function getAdminHeaders(token: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    "X-Admin-Token": token,
  };
}

function getAuthHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
  };
}

export function getAdminToken(): string | null {
  return sessionStorage.getItem(ADMIN_TOKEN_KEY);
}

export function setAdminToken(token: string): void {
  sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
}

export function clearAdminToken(): void {
  sessionStorage.removeItem(ADMIN_TOKEN_KEY);
}

export function getAuthToken(): string | null {
  return sessionStorage.getItem(AUTH_TOKEN_KEY);
}

export function setAuthToken(token: string): void {
  sessionStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function clearAuthToken(): void {
  sessionStorage.removeItem(AUTH_TOKEN_KEY);
}

export function readAnonymousXP(): number | null {
  try {
    const raw = localStorage.getItem(ANONYMOUS_XP_KEY);
    if (raw === null) {
      return null;
    }

    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return 0;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function writeAnonymousXP(xp: number): void {
  try {
    localStorage.setItem(ANONYMOUS_XP_KEY, String(Math.max(0, xp)));
  } catch {
    // Private browsing or storage quota exceeded - silently no-op
  }
}

export function clearAnonymousXP(): void {
  try {
    localStorage.removeItem(ANONYMOUS_XP_KEY);
  } catch {
    // Storage unavailable - silently no-op
  }
}

export function getAnonymousAttemptKey(packageId: string): string {
  return `${ANONYMOUS_ATTEMPT_KEY_PREFIX}${packageId}`;
}

export function getAnonymousFirstCompletionKey(packageId: string): string {
  return `${ANONYMOUS_FIRST_COMPLETION_KEY_PREFIX}${packageId}`;
}

export function getAnonymousTestResultsKey(packageId: string): string {
  return `${ANONYMOUS_TEST_RESULTS_KEY_PREFIX}${packageId}`;
}

function toDateIsoIfValid(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return new Date(parsed).toISOString();
}

function parseAnonymousAttemptCount(raw: string | null): number {
  if (!raw) {
    return 0;
  }

  try {
    const parsed = JSON.parse(raw) as { count?: unknown };
    if (typeof parsed.count !== "number") {
      return 0;
    }
    if (!Number.isFinite(parsed.count) || parsed.count < 0) {
      return 0;
    }
    return Math.floor(parsed.count);
  } catch {
    return 0;
  }
}

function collectAnonymousPackageIds(): string[] {
  const ids = new Set<string>();

  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key) {
      continue;
    }

    if (key.startsWith(ANONYMOUS_ATTEMPT_KEY_PREFIX)) {
      ids.add(key.slice(ANONYMOUS_ATTEMPT_KEY_PREFIX.length));
    } else if (key.startsWith(ANONYMOUS_FIRST_COMPLETION_KEY_PREFIX)) {
      ids.add(key.slice(ANONYMOUS_FIRST_COMPLETION_KEY_PREFIX.length));
    } else if (key.startsWith(ANONYMOUS_TEST_RESULTS_KEY_PREFIX)) {
      ids.add(key.slice(ANONYMOUS_TEST_RESULTS_KEY_PREFIX.length));
    }
  }

  return [...ids].filter((id) => id.length > 0);
}

function readAnonymousResultSnapshot(packageId: string): {
  completed: boolean;
  latestWeightedScore: number;
  firstCompletedAt: string | null;
} {
  const key = getAnonymousTestResultsKey(packageId);
  const raw = localStorage.getItem(key);
  if (!raw) {
    return {
      completed: false,
      latestWeightedScore: 0,
      firstCompletedAt: null,
    };
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") {
      return {
        completed: false,
        latestWeightedScore: 0,
        firstCompletedAt: null,
      };
    }

    let completed = false;
    let highestScore = 0;
    let earliestCompletedAt: string | null = null;

    for (const value of Object.values(parsed)) {
      if (!value || typeof value !== "object") {
        continue;
      }

      const result = value as {
        passed?: unknown;
        bestScore?: unknown;
        lastAttemptedAt?: unknown;
      };

      if (
        typeof result.bestScore === "number" &&
        Number.isFinite(result.bestScore)
      ) {
        highestScore = Math.max(highestScore, result.bestScore);
      }

      if (result.passed === true) {
        completed = true;
        const candidate = toDateIsoIfValid(result.lastAttemptedAt);
        if (!candidate) {
          continue;
        }
        if (!earliestCompletedAt || candidate < earliestCompletedAt) {
          earliestCompletedAt = candidate;
        }
      }
    }

    return {
      completed,
      latestWeightedScore: Math.min(1, Math.max(0, highestScore / 100)),
      firstCompletedAt: earliestCompletedAt,
    };
  } catch {
    return {
      completed: false,
      latestWeightedScore: 0,
      firstCompletedAt: null,
    };
  }
}

export function readAnonymousProgressSeeds(): AnonymousProgressSeed[] {
  try {
    const rows: AnonymousProgressSeed[] = [];

    for (const packageId of collectAnonymousPackageIds()) {
      const attemptCount = parseAnonymousAttemptCount(
        localStorage.getItem(getAnonymousAttemptKey(packageId)),
      );
      const completionFlag =
        localStorage.getItem(getAnonymousFirstCompletionKey(packageId)) === "1";
      const resultsSnapshot = readAnonymousResultSnapshot(packageId);
      const completed = completionFlag || resultsSnapshot.completed;

      if (
        attemptCount <= 0 &&
        !completed &&
        resultsSnapshot.latestWeightedScore <= 0
      ) {
        continue;
      }

      rows.push({
        package_id: packageId,
        latest_weighted_score: resultsSnapshot.latestWeightedScore,
        completed,
        attempt_count: attemptCount,
        first_completed_at: completed ? resultsSnapshot.firstCompletedAt : null,
      });
    }

    return rows;
  } catch {
    return [];
  }
}

export function readAnonymousStreakSnapshot(): AnonymousStreakSnapshot {
  try {
    const rawStreak = localStorage.getItem(ANONYMOUS_DAILY_STREAK_KEY);
    const streakNumber = Number(rawStreak);
    const streakCount =
      Number.isFinite(streakNumber) && streakNumber >= 0
        ? Math.floor(streakNumber)
        : 0;

    const rawLastPractisedDate = localStorage.getItem(
      ANONYMOUS_LAST_ACTIVE_KEY,
    );
    const lastPractisedDate =
      typeof rawLastPractisedDate === "string" &&
      ISO_LOCAL_DATE_RE.test(rawLastPractisedDate)
        ? rawLastPractisedDate
        : null;

    return {
      streak_count: streakCount,
      last_practised_date: lastPractisedDate,
    };
  } catch {
    return {
      streak_count: 0,
      last_practised_date: null,
    };
  }
}

function readAnonymousPrefixedKeys(): string[] {
  const keys: string[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key) {
      continue;
    }

    if (
      key.startsWith(ANONYMOUS_ATTEMPT_KEY_PREFIX) ||
      key.startsWith(ANONYMOUS_FIRST_COMPLETION_KEY_PREFIX) ||
      key.startsWith(ANONYMOUS_TEST_RESULTS_KEY_PREFIX)
    ) {
      keys.push(key);
    }
  }
  return keys;
}

export function resetAnonymousLocalProgress(): void {
  try {
    localStorage.removeItem(ANONYMOUS_XP_KEY);
    localStorage.removeItem(ANONYMOUS_DAILY_STREAK_KEY);
    localStorage.removeItem(ANONYMOUS_LAST_ACTIVE_KEY);

    for (const key of readAnonymousPrefixedKeys()) {
      localStorage.removeItem(key);
    }
  } catch {
    // Storage unavailable - silently no-op
  }
}

function getXPReconciliationDecisionKey(userId: number): string {
  return `${XP_RECONCILIATION_DECISION_KEY_PREFIX}${userId}`;
}

export function hasXPReconciliationDecision(userId: number): boolean {
  try {
    return localStorage.getItem(getXPReconciliationDecisionKey(userId)) === "1";
  } catch {
    return false;
  }
}

export function markXPReconciliationDecision(userId: number): void {
  try {
    localStorage.setItem(getXPReconciliationDecisionKey(userId), "1");
  } catch {
    // Storage unavailable - silently no-op
  }
}

export async function registerUser(
  payload: RegisterRequest,
): Promise<AuthResponse> {
  const parsed = RegisterRequestSchema.parse(payload);
  const response = await fetchWithTimeout(`${BASE_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parsed),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Registration failed (${response.status}): ${detail}`);
  }

  const data: unknown = await response.json();
  return AuthResponseSchema.parse(data);
}

export async function loginUser(payload: LoginRequest): Promise<AuthResponse> {
  const parsed = LoginRequestSchema.parse(payload);
  const response = await fetchWithTimeout(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parsed),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Login failed (${response.status}): ${detail}`);
  }

  const data: unknown = await response.json();
  return AuthResponseSchema.parse(data);
}

export async function fetchCurrentUser(token: string): Promise<User> {
  const response = await fetchWithTimeout(`${BASE_URL}/users/me`, {
    headers: getAuthHeaders(token),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Could not fetch current user (${response.status}): ${detail}`,
    );
  }

  const data: unknown = await response.json();
  return UserSchema.parse(data);
}

export async function fetchMyXP(token: string): Promise<number> {
  const response = await fetchWithTimeout(`${BASE_URL}/users/me/xp`, {
    headers: getAuthHeaders(token),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Could not fetch user XP (${response.status}): ${detail}`);
  }

  const data: unknown = await response.json();
  return UserXPSchema.parse(data).xp;
}

export async function updateMyXP(token: string, xp: number): Promise<number> {
  const response = await fetchWithTimeout(`${BASE_URL}/users/me/xp`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(token),
    },
    body: JSON.stringify(UserXPSchema.parse({ xp })),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Could not update user XP (${response.status}): ${detail}`);
  }

  const data: unknown = await response.json();
  return UserXPSchema.parse(data).xp;
}

export async function fetchMyStreak(token: string): Promise<{
  streak_count: number;
  last_practised_date: string | null;
}> {
  const response = await fetchWithTimeout(`${BASE_URL}/users/me/streak`, {
    headers: getAuthHeaders(token),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Could not fetch user streak (${response.status}): ${detail}`,
    );
  }

  const data: unknown = await response.json();
  return UserStreakSchema.parse(data);
}

export async function markMyStreakPractisedToday(token: string): Promise<{
  streak_count: number;
  last_practised_date: string | null;
}> {
  const response = await fetchWithTimeout(
    `${BASE_URL}/users/me/streak/mark-practised`,
    {
      method: "POST",
      headers: getAuthHeaders(token),
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Could not update user streak (${response.status}): ${detail}`,
    );
  }

  const data: unknown = await response.json();
  return UserStreakSchema.parse(data);
}

export async function updateMyStreakSnapshot(
  token: string,
  payload: {
    streak_count: number;
    last_practised_date: string | null;
  },
): Promise<{
  streak_count: number;
  last_practised_date: string | null;
}> {
  const response = await fetchWithTimeout(`${BASE_URL}/users/me/streak`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(token),
    },
    body: JSON.stringify(UserStreakUpdateSchema.parse(payload)),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Could not update user streak (${response.status}): ${detail}`,
    );
  }

  const data: unknown = await response.json();
  return UserStreakSchema.parse(data);
}

export async function fetchMyProgress(
  token: string,
): Promise<UserProgressRecord[]> {
  const response = await fetchWithTimeout(`${BASE_URL}/users/me/progress`, {
    headers: getAuthHeaders(token),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Could not fetch user progress (${response.status}): ${detail}`,
    );
  }

  const data: unknown = await response.json();
  return z.array(UserProgressRecordSchema).parse(data);
}

export async function upsertMyProgressForPackage(
  token: string,
  packageId: string,
  payload: UserProgressUpsertRequest,
): Promise<UserProgressRecord> {
  const encodedId = encodeURIComponent(packageId);
  const parsed = UserProgressUpsertRequestSchema.parse(payload);
  const response = await fetchWithTimeout(
    `${BASE_URL}/users/me/progress/${encodedId}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(token),
      },
      body: JSON.stringify(parsed),
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Could not persist user progress for package '${packageId}' (${response.status}): ${detail}`,
    );
  }

  const data: unknown = await response.json();
  return UserProgressRecordSchema.parse(data);
}

export async function validateAdminToken(token: string): Promise<boolean> {
  const response = await fetchWithTimeout(`${BASE_URL}/admin/settings`, {
    headers: getAdminHeaders(token),
  });

  return response.ok;
}

export async function fetchAdminSettings(token: string): Promise<Settings> {
  const response = await fetchWithTimeout(`${BASE_URL}/admin/settings`, {
    headers: getAdminHeaders(token),
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch admin settings: ${response.status}`);
  }
  const data: unknown = await response.json();
  return SettingsSchema.parse(data);
}

export async function updateAdminSettings(
  token: string,
  settings: Settings,
): Promise<Settings> {
  const response = await fetchWithTimeout(`${BASE_URL}/admin/settings`, {
    method: "PUT",
    headers: getAdminHeaders(token),
    body: JSON.stringify(settings),
  });

  if (!response.ok) {
    throw new Error(`Failed to update admin settings: ${response.status}`);
  }

  const data: unknown = await response.json();
  return SettingsSchema.parse(data);
}

export async function fetchAdminPackages(
  token: string,
): Promise<PackageSummary[]> {
  const response = await fetchWithTimeout(`${BASE_URL}/admin/packages`, {
    headers: getAdminHeaders(token),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch admin packages: ${response.status}`);
  }

  const data: unknown = await response.json();
  return z.array(PackageSummarySchema).parse(data);
}

export async function updateAdminPackage(
  token: string,
  packageId: string,
  patch: {
    availability?: "available" | "unavailable" | "hidden";
    enabled?: boolean;
    xp_threshold?: number | null;
  },
): Promise<PackageSummary> {
  const encodedId = encodeURIComponent(packageId);
  const response = await fetchWithTimeout(
    `${BASE_URL}/admin/packages/${encodedId}`,
    {
      method: "PATCH",
      headers: getAdminHeaders(token),
      body: JSON.stringify(patch),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Failed to update package '${packageId}': ${response.status}`,
    );
  }

  const data: unknown = await response.json();
  return PackageSummarySchema.parse(data);
}
