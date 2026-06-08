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
import {
  AdminPackageSummarySchema,
  PackageSchema,
  PackageSummarySchema,
} from "../schemas/package";
import type { AdminPackageSummary, Package, PackageSummary } from "../schemas/package";
import {
  UserProgressRecordSchema,
  UserProgressUpsertRequestSchema,
} from "../schemas/progress";
import type {
  UserProgressRecord,
  UserProgressUpsertRequest,
} from "../schemas/progress";
import { AIProviderSchema, SettingsSchema } from "../schemas/settings";
import type { AIProvider, Settings } from "../schemas/settings";
import { UnlockedDifficultiesSchema, XpSpendResponseSchema } from "../schemas/xpSpend";
import type {
  UnlockedDifficulties,
  XpSpendAction,
  XpSpendResponse,
} from "../schemas/xpSpend";

function resolveApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim();
  if (configured) {
    return configured;
  }

  if (typeof window === "undefined") {
    return "/api";
  }

  const { hostname, port } = window.location;
  const isLocalViteDev =
    (hostname === "localhost" || hostname === "127.0.0.1") && port === "5173";

  return isLocalViteDev ? "http://localhost:8000" : "/api";
}

const BASE_URL = resolveApiBaseUrl();
const TIMEOUT_MS = 10_000;
const ADMIN_AI_TIMEOUT_MS = 90_000;
const AUTH_TOKEN_KEY = "lle_auth_token";
const ANONYMOUS_XP_KEY = "lle_xp";
const ANONYMOUS_DAILY_STREAK_KEY = "lle_daily_streak";
const ANONYMOUS_LAST_ACTIVE_KEY = "lle_last_active";
const ANONYMOUS_ATTEMPT_KEY_PREFIX = "lle_attempt_";
const ANONYMOUS_FIRST_COMPLETION_KEY_PREFIX = "lle_completed_";
const ANONYMOUS_TEST_RESULTS_KEY_PREFIX = "lle_test_results_";
const ANONYMOUS_GUEST_ENGAGED_PACKAGES_KEY = "lle_guest_engaged_packages";
const ANONYMOUS_GUEST_TEST_ENGAGED_PACKAGES_KEY = "lle_guest_test_engaged_packages";
const XP_RECONCILIATION_DECISION_KEY_PREFIX = "lle_xp_reconciled_user_";
const ISO_LOCAL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const ANONYMOUS_GUEST_PACKAGE_CAP = 2;
export const ANONYMOUS_LOCAL_STORAGE_KEYS = {
  xp: ANONYMOUS_XP_KEY,
  dailyStreak: ANONYMOUS_DAILY_STREAK_KEY,
  lastActive: ANONYMOUS_LAST_ACTIVE_KEY,
  attemptPrefix: ANONYMOUS_ATTEMPT_KEY_PREFIX,
  firstCompletionPrefix: ANONYMOUS_FIRST_COMPLETION_KEY_PREFIX,
  testResultsPrefix: ANONYMOUS_TEST_RESULTS_KEY_PREFIX,
  guestEngagedPackages: ANONYMOUS_GUEST_ENGAGED_PACKAGES_KEY,
  guestTestEngagedPackages: ANONYMOUS_GUEST_TEST_ENGAGED_PACKAGES_KEY,
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

const XPDecayNoticeSchema = z
  .object({
    deducted_xp: z.number().int().nonnegative(),
    stale_package_count: z.number().int().nonnegative(),
    intervals_applied: z.number().int().nonnegative(),
    floor_reached: z.boolean(),
    stale_window_days: z.number().int().positive(),
  })
  .strict();

const UserXPSchema = z.object({
  xp: z.number().int().nonnegative(),
  decay_notice: XPDecayNoticeSchema.nullable().optional(),
});
const UserStreakSchema = z.object({
  streak_count: z.number().int().nonnegative(),
  last_practised_date: z.string().nullable(),
});
const UserStreakUpdateSchema = z.object({
  streak_count: z.number().int().nonnegative(),
  last_practised_date: z.string().regex(ISO_LOCAL_DATE_RE).nullable(),
});
const UserProfileUpdateRequestSchema = z
  .object({
    username: z.string().trim().min(3).max(50).optional(),
  })
  .strict();
const UserPasswordChangeRequestSchema = z
  .object({
    current_password: z.string().min(8).max(128),
    new_password: z.string().min(8).max(128),
  })
  .strict();
const UserPasswordChangeResponseSchema = z
  .object({
    message: z.string().min(1),
  })
  .strict();
const AdminAIConfigSchema = z
  .object({
    provider: AIProviderSchema,
    model: z.string().min(1),
    configured: z.boolean(),
    key_source: z.enum(["runtime", "env", "none"]),
    key_last_updated_at: z.string().datetime().nullable().optional(),
    key_masked_suffix: z.string().min(1).nullable().optional(),
    supported_providers: z.array(AIProviderSchema),
    provider_options: z.array(
      z
        .object({
          provider: AIProviderSchema,
          recommended_model: z.string().min(1),
        })
        .strict(),
    ),
  })
  .strict();
const AdminAIConnectionTestSchema = z
  .object({
    success: z.boolean(),
    message: z.string(),
    model_used: z.string(),
  })
  .strict();
const AdminAIKeyUpdateResponseSchema = z
  .object({
    success: z.boolean(),
    message: z.string(),
    model_used: z.string(),
    config: AdminAIConfigSchema,
  })
  .strict();
const AdminPackageGenerateResponseSchema = z
  .object({
    yaml_content: z.string().min(1),
  })
  .strict();
const AdminPackageValidationIssueSchema = z
  .object({
    message: z.string().min(1),
    path: z.array(z.string()).default([]),
    line: z.number().int().positive().nullable().optional(),
    column: z.number().int().positive().nullable().optional(),
  })
  .strict();
const AdminPackageValidationPreviewSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    description: z.string().min(1),
    version: z.string().min(1),
    page_count: z.number().int().nonnegative(),
    question_count: z.number().int().nonnegative(),
  })
  .strict();
const AdminPackageValidationResponseSchema = z
  .object({
    valid: z.boolean(),
    preview: AdminPackageValidationPreviewSchema.nullable().optional(),
    errors: z.array(AdminPackageValidationIssueSchema).default([]),
    formatted_errors: z.array(z.string()).default([]),
    yaml_content: z.string().nullable().optional(),
  })
  .strict();
const AdminManagedUserRoleSchema = z.enum(["student", "admin"]);
const AdminManagedUserSchema = z
  .object({
    id: z.number().int().positive(),
    username: z.string().min(1),
    email: z.string().email(),
    role: AdminManagedUserRoleSchema,
    xp: z.number().int().nonnegative(),
    pending_bonus_xp: z.number().int().nonnegative(),
    pending_bonus_reason: z.string().nullable(),
    created_at: z.string().min(1),
  })
  .strict();
const AdminManagedUserXPSchema = z
  .object({
    id: z.number().int().positive(),
    username: z.string().min(1),
    role: AdminManagedUserRoleSchema,
    xp: z.number().int().nonnegative(),
    pending_bonus_xp: z.number().int().nonnegative(),
    pending_bonus_reason: z.string().nullable(),
  })
  .strict();
const AdminManagedUserProgressResetSchema = z
  .object({
    id: z.number().int().positive(),
    username: z.string().min(1),
    role: AdminManagedUserRoleSchema,
    xp: z.number().int().nonnegative(),
    pending_bonus_xp: z.number().int().nonnegative(),
    pending_bonus_reason: z.string().nullable(),
    cleared_progress_count: z.number().int().nonnegative(),
    reset_xp: z.boolean(),
  })
  .strict();
const AdminManagedUserDeleteSchema = z
  .object({
    id: z.number().int().positive(),
    username: z.string().min(1),
    deleted_progress_count: z.number().int().nonnegative(),
    deleted_library_count: z.number().int().nonnegative(),
    deleted_spend_history_count: z.number().int().nonnegative(),
    deleted_audit_log_count: z.number().int().nonnegative(),
  })
  .strict();
const AdminPackageDeleteResponseSchema = z
  .object({
    package_id: z.string().min(1),
    operation: z.enum(["archived", "deleted"]),
    summary: PackageSummarySchema.nullable().optional(),
  })
  .strict();
const AdminAuditLogEntrySchema = z
  .object({
    id: z.number().int().positive(),
    actor_user_id: z.number().int().positive(),
    action: z.string().min(1),
    target_user_id: z.number().int().positive().nullable(),
    package_id: z.string().min(1).nullable(),
    details: z.record(z.string(), z.unknown()),
    created_at: z.string().min(1),
  })
  .strict();

export type AdminAIConfig = z.infer<typeof AdminAIConfigSchema>;
export type AdminAIConnectionTestResult = z.infer<typeof AdminAIConnectionTestSchema>;
export type AdminAIKeyUpdateResult = z.infer<typeof AdminAIKeyUpdateResponseSchema>;
export type AdminPackageValidationResult = z.infer<
  typeof AdminPackageValidationResponseSchema
>;
export type AdminPackageGenerateResponse = z.infer<
  typeof AdminPackageGenerateResponseSchema
>;
export type AdminManagedUserRole = z.infer<typeof AdminManagedUserRoleSchema>;
export type AdminManagedUser = z.infer<typeof AdminManagedUserSchema>;
export type AdminManagedUserXP = z.infer<typeof AdminManagedUserXPSchema>;
export type AdminManagedUserProgressReset = z.infer<
  typeof AdminManagedUserProgressResetSchema
>;
export type AdminManagedUserDelete = z.infer<typeof AdminManagedUserDeleteSchema>;
export type AdminPackageDeleteResponse = z.infer<
  typeof AdminPackageDeleteResponseSchema
>;
export type AdminAuditLogEntry = z.infer<typeof AdminAuditLogEntrySchema>;

export interface AdminAuditLogFilters {
  limit?: number;
  action?: string;
  actor_user_id?: number;
  from?: string;
  until?: string;
}

export type UserXPBalance = z.infer<typeof UserXPSchema>;

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs?: number,
): Promise<Response> {
  const effectiveTimeoutMs = timeoutMs ?? TIMEOUT_MS;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), effectiveTimeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(
        `Request timed out after ${Math.ceil(effectiveTimeoutMs / 1000)}s`,
      );
    }
    throw error;
  } finally {
    clearTimeout(id);
  }
}

function formatFieldLabel(field: string): string {
  const trimmed = field.trim();
  if (trimmed.length === 0) {
    return "This field";
  }
  const withSpaces = trimmed.replace(/_/g, " ");
  return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
}

function formatValidationIssueMessage(issue: z.ZodIssue): string {
  const field = issue.path[0];
  const fieldLabel = typeof field === "string" ? formatFieldLabel(field) : "This field";

  if (
    issue.code === "invalid_type" &&
    "received" in issue &&
    issue.received === "undefined"
  ) {
    return `${fieldLabel} is required.`;
  }

  if (
    issue.code === "too_small" &&
    "type" in issue &&
    issue.type === "string" &&
    "minimum" in issue
  ) {
    return `${fieldLabel} must be at least ${issue.minimum} characters.`;
  }

  if (
    issue.code === "invalid_string" &&
    "validation" in issue &&
    issue.validation === "email"
  ) {
    return "Enter a valid email address.";
  }

  return issue.message;
}

function readUserFacingErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof z.ZodError) {
    const messages = error.issues.map(formatValidationIssueMessage);
    return messages.join(" ");
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}

export async function fetchPackages(): Promise<PackageSummary[]> {
  const response = await fetchWithTimeout(`${BASE_URL}/packages`);
  if (!response.ok) {
    throw new Error(`Failed to fetch packages: ${response.status}`);
  }
  const data: unknown = await response.json();
  return z.array(PackageSummarySchema).parse(data);
}

export async function fetchMyLibrary(token: string): Promise<PackageSummary[]> {
  const response = await fetchWithTimeout(`${BASE_URL}/users/me/library`, {
    headers: getAuthHeaders(token),
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch my library: ${response.status}`);
  }
  const data: unknown = await response.json();
  return z.array(PackageSummarySchema).parse(data);
}

export async function fetchMyCatalogue(token: string): Promise<PackageSummary[]> {
  const response = await fetchWithTimeout(`${BASE_URL}/users/me/catalogue`, {
    headers: getAuthHeaders(token),
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch my catalogue: ${response.status}`);
  }
  const data: unknown = await response.json();
  return z.array(PackageSummarySchema).parse(data);
}

export async function addToLibrary(
  token: string,
  packageId: string,
): Promise<PackageSummary> {
  const encodedId = encodeURIComponent(packageId);
  const response = await fetchWithTimeout(`${BASE_URL}/users/me/library/${encodedId}`, {
    method: "PUT",
    headers: getAuthHeaders(token),
  });
  if (!response.ok) {
    throw new Error(`Failed to add to library: ${response.status}`);
  }
  const data: unknown = await response.json();
  return PackageSummarySchema.parse(data);
}

export async function removeFromLibrary(
  token: string,
  packageId: string,
): Promise<PackageSummary> {
  const encodedId = encodeURIComponent(packageId);
  const response = await fetchWithTimeout(`${BASE_URL}/users/me/library/${encodedId}`, {
    method: "DELETE",
    headers: getAuthHeaders(token),
  });
  if (!response.ok) {
    throw new Error(`Failed to remove from library: ${response.status}`);
  }
  const data: unknown = await response.json();
  return PackageSummarySchema.parse(data);
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
  const response = await fetchWithTimeout(`${BASE_URL}/settings`);
  if (!response.ok) {
    throw new Error(`Failed to fetch settings: ${response.status}`);
  }
  const data: unknown = await response.json();
  return SettingsSchema.parse(data);
}

function getAdminHeaders(token: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    ...getAuthHeaders(token),
  };
}

function getAuthHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
  };
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

export function clearAnonymousPackageProgress(packageId: string): void {
  try {
    localStorage.removeItem(getAnonymousAttemptKey(packageId));
    localStorage.removeItem(getAnonymousFirstCompletionKey(packageId));
    localStorage.removeItem(getAnonymousTestResultsKey(packageId));
  } catch {
    // Storage unavailable - silently no-op
  }
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

      if (typeof result.bestScore === "number" && Number.isFinite(result.bestScore)) {
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

      if (attemptCount <= 0 && !completed && resultsSnapshot.latestWeightedScore <= 0) {
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
      Number.isFinite(streakNumber) && streakNumber >= 0 ? Math.floor(streakNumber) : 0;

    const rawLastPractisedDate = localStorage.getItem(ANONYMOUS_LAST_ACTIVE_KEY);
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

export function readAnonymousGuestEngagedPackages(): string[] {
  try {
    const raw = localStorage.getItem(ANONYMOUS_GUEST_ENGAGED_PACKAGES_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    const unique = new Set<string>();
    for (const value of parsed) {
      if (typeof value !== "string") {
        continue;
      }

      const trimmed = value.trim();
      if (trimmed.length > 0) {
        unique.add(trimmed);
      }
    }

    return [...unique];
  } catch {
    return [];
  }
}

export function readAnonymousGuestTestEngagedPackages(): string[] {
  try {
    const raw = localStorage.getItem(ANONYMOUS_GUEST_TEST_ENGAGED_PACKAGES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? (parsed as string[]).filter((id) => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

export function markAnonymousGuestTestPackageEngaged(packageId: string): void {
  try {
    const current = readAnonymousGuestTestEngagedPackages();
    if (!current.includes(packageId)) {
      localStorage.setItem(
        ANONYMOUS_GUEST_TEST_ENGAGED_PACKAGES_KEY,
        JSON.stringify([...current, packageId]),
      );
    }
  } catch {
    // Private browsing or storage quota exceeded - silently no-op
  }
}

export function getAnonymousGuestTestCapStatus(packageId: string): {
  hasTestEngagement: boolean;
  engagedCount: number;
} {
  const testEngaged = readAnonymousGuestTestEngagedPackages();
  return {
    hasTestEngagement: testEngaged.includes(packageId),
    engagedCount: testEngaged.length,
  };
}

export function markAnonymousGuestPackageEngaged(packageId: string): void {
  const trimmedPackageId = packageId.trim();
  if (!trimmedPackageId) {
    return;
  }

  try {
    const currentIds = readAnonymousGuestEngagedPackages();
    if (currentIds.includes(trimmedPackageId)) {
      return;
    }

    localStorage.setItem(
      ANONYMOUS_GUEST_ENGAGED_PACKAGES_KEY,
      JSON.stringify([...currentIds, trimmedPackageId]),
    );
  } catch {
    // Storage unavailable - silently no-op
  }
}

export function getAnonymousGuestPackageCapStatus(packageId: string): {
  cap: number;
  engagedCount: number;
  hasPackageEngagement: boolean;
} {
  const engagedPackages = readAnonymousGuestEngagedPackages();
  const trimmedPackageId = packageId.trim();
  return {
    cap: ANONYMOUS_GUEST_PACKAGE_CAP,
    engagedCount: engagedPackages.length,
    hasPackageEngagement:
      trimmedPackageId.length > 0 && engagedPackages.includes(trimmedPackageId),
  };
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
    localStorage.removeItem(ANONYMOUS_GUEST_ENGAGED_PACKAGES_KEY);

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

export async function registerUser(payload: RegisterRequest): Promise<AuthResponse> {
  try {
    const parsed = RegisterRequestSchema.parse(payload);
    const response = await fetchWithTimeout(`${BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed),
    });

    if (!response.ok) {
      const detail = await readBackendErrorMessage(response);
      throw new Error(detail || "Registration failed.");
    }

    const data: unknown = await response.json();
    return AuthResponseSchema.parse(data);
  } catch (error) {
    throw new Error(readUserFacingErrorMessage(error, "Registration failed."));
  }
}

export async function loginUser(payload: LoginRequest): Promise<AuthResponse> {
  try {
    const parsed = LoginRequestSchema.parse(payload);
    const response = await fetchWithTimeout(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed),
    });

    if (!response.ok) {
      const detail = await readBackendErrorMessage(response);
      throw new Error(detail || "Login failed.");
    }

    const data: unknown = await response.json();
    return AuthResponseSchema.parse(data);
  } catch (error) {
    throw new Error(readUserFacingErrorMessage(error, "Login failed."));
  }
}

export async function fetchCurrentUser(token: string): Promise<User> {
  const response = await fetchWithTimeout(`${BASE_URL}/users/me`, {
    headers: getAuthHeaders(token),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Could not fetch current user (${response.status}): ${detail}`);
  }

  const data: unknown = await response.json();
  return UserSchema.parse(data);
}

export async function updateMyProfile(
  token: string,
  payload: { username?: string },
): Promise<User> {
  const parsed = UserProfileUpdateRequestSchema.parse(payload);
  const response = await fetchWithTimeout(`${BASE_URL}/users/me/profile`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(token),
    },
    body: JSON.stringify(parsed),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Could not update profile (${response.status}): ${detail}`);
  }

  const data: unknown = await response.json();
  return UserSchema.parse(data);
}

export async function updateMyPassword(
  token: string,
  payload: { current_password: string; new_password: string },
): Promise<{ message: string }> {
  const parsed = UserPasswordChangeRequestSchema.parse(payload);
  const response = await fetchWithTimeout(`${BASE_URL}/users/me/password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(token),
    },
    body: JSON.stringify(parsed),
  });

  if (!response.ok) {
    const detail = await readBackendErrorMessage(response);
    throw new Error(`Could not update password (${response.status}): ${detail}`);
  }

  const data: unknown = await response.json();
  return UserPasswordChangeResponseSchema.parse(data);
}

export async function fetchMyXP(token: string): Promise<UserXPBalance> {
  const response = await fetchWithTimeout(`${BASE_URL}/users/me/xp`, {
    headers: getAuthHeaders(token),
  });

  if (!response.ok) {
    const detail = await readBackendErrorMessage(response);
    throw new Error(`Could not fetch user XP (${response.status}): ${detail}`);
  }

  const data: unknown = await response.json();
  return UserXPSchema.parse(data);
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

export async function spendXP(
  token: string,
  action: XpSpendAction,
  packageId: string,
  difficulty?: "hard" | "expert",
): Promise<XpSpendResponse> {
  const response = await fetchWithTimeout(`${BASE_URL}/users/me/xp/spend`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(token),
    },
    body: JSON.stringify({
      action,
      package_id: packageId,
      difficulty,
    }),
  });

  if (response.status === 401) {
    throw new Error("You must be logged in to spend XP");
  }
  if (response.status === 402) {
    const detail = await readBackendErrorMessage(response);
    throw new Error(detail || "You do not have enough XP for that unlock.");
  }
  if (response.status === 404) {
    const detail = await readBackendErrorMessage(response);
    throw new Error(detail || "That package could not be found.");
  }
  if (response.status === 409) {
    const detail = await readBackendErrorMessage(response);
    throw new Error(
      detail === "Already unlocked"
        ? "This difficulty is already unlocked."
        : detail || "This item is already unlocked.",
    );
  }
  if (response.status === 423) {
    const detail = await readBackendErrorMessage(response);
    throw new Error(detail || "XP spending is currently disabled.");
  }
  if (!response.ok) {
    const detail = await readBackendErrorMessage(response);
    throw new Error(detail || "Failed to spend XP.");
  }

  const data: unknown = await response.json();
  return XpSpendResponseSchema.parse(data);
}

export async function fetchUnlockedDifficulties(
  token: string,
  packageId: string,
): Promise<UnlockedDifficulties> {
  const encodedId = encodeURIComponent(packageId);
  const response = await fetchWithTimeout(
    `${BASE_URL}/users/me/unlocked-difficulties/${encodedId}`,
    {
      headers: getAuthHeaders(token),
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch unlocked difficulties: ${response.status}`);
  }

  const data: unknown = await response.json();
  return UnlockedDifficultiesSchema.parse(data);
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
    throw new Error(`Could not fetch user streak (${response.status}): ${detail}`);
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
    throw new Error(`Could not update user streak (${response.status}): ${detail}`);
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
    throw new Error(`Could not update user streak (${response.status}): ${detail}`);
  }

  const data: unknown = await response.json();
  return UserStreakSchema.parse(data);
}

export async function fetchMyProgress(token: string): Promise<UserProgressRecord[]> {
  const response = await fetchWithTimeout(`${BASE_URL}/users/me/progress`, {
    headers: getAuthHeaders(token),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Could not fetch user progress (${response.status}): ${detail}`);
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

export async function fetchAdminAIConfig(token: string): Promise<AdminAIConfig> {
  const response = await fetchWithTimeout(`${BASE_URL}/admin/ai-config`, {
    headers: getAdminHeaders(token),
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch admin AI config: ${response.status}`);
  }
  const data: unknown = await response.json();
  return AdminAIConfigSchema.parse(data);
}

export async function updateAdminAIConfig(
  token: string,
  config: { provider: AIProvider; model: string },
): Promise<AdminAIConfig> {
  const response = await fetchWithTimeout(`${BASE_URL}/admin/ai-config`, {
    method: "PATCH",
    headers: getAdminHeaders(token),
    body: JSON.stringify(config),
  });
  if (!response.ok) {
    throw new Error(`Failed to update admin AI config: ${response.status}`);
  }
  const data: unknown = await response.json();
  return AdminAIConfigSchema.parse(data);
}

export async function testAdminAIConnection(
  token: string,
  payload: {
    api_key?: string;
    provider?: AIProvider;
    model?: string;
  },
): Promise<AdminAIConnectionTestResult> {
  const response = await fetchWithTimeout(
    `${BASE_URL}/admin/ai-config/test`,
    {
      method: "POST",
      headers: getAdminHeaders(token),
      body: JSON.stringify(payload),
    },
    ADMIN_AI_TIMEOUT_MS,
  );
  if (!response.ok) {
    throw new Error(`Failed to test admin AI connection: ${response.status}`);
  }
  const data: unknown = await response.json();
  return AdminAIConnectionTestSchema.parse(data);
}

export async function saveAdminAIKey(
  token: string,
  payload: {
    api_key: string;
    provider: AIProvider;
    model: string;
  },
): Promise<AdminAIKeyUpdateResult> {
  const response = await fetchWithTimeout(
    `${BASE_URL}/admin/ai-config/key`,
    {
      method: "POST",
      headers: getAdminHeaders(token),
      body: JSON.stringify(payload),
    },
    ADMIN_AI_TIMEOUT_MS,
  );
  if (!response.ok) {
    const detail = await readBackendErrorMessage(response);
    throw new Error(detail || "Failed to save admin AI key.");
  }
  const data: unknown = await response.json();
  return AdminAIKeyUpdateResponseSchema.parse(data);
}

export async function fetchAdminPackages(
  token: string,
): Promise<AdminPackageSummary[]> {
  const response = await fetchWithTimeout(`${BASE_URL}/admin/packages`, {
    headers: getAdminHeaders(token),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch admin packages: ${response.status}`);
  }

  const data: unknown = await response.json();
  return z.array(AdminPackageSummarySchema).parse(data);
}

function extractBackendErrorDetail(payload: unknown): string | null {
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (!payload || typeof payload !== "object") {
    return null;
  }

  const asRecord = payload as Record<string, unknown>;
  if (typeof asRecord.detail === "string") {
    const trimmed = asRecord.detail.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }

  if (
    asRecord.detail &&
    typeof asRecord.detail === "object" &&
    typeof (asRecord.detail as Record<string, unknown>).message === "string"
  ) {
    const detailRecord = asRecord.detail as Record<string, unknown>;
    const formattedErrors = detailRecord.formatted_errors;
    if (Array.isArray(formattedErrors)) {
      const parts = formattedErrors
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter((part) => part.length > 0);
      if (parts.length > 0) {
        return parts.join("; ");
      }
    }
    const trimmed = (
      (asRecord.detail as Record<string, unknown>).message as string
    ).trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }

  if (Array.isArray(asRecord.detail)) {
    const detailParts = asRecord.detail
      .map((entry) => {
        if (typeof entry === "string") {
          return entry.trim();
        }
        if (entry && typeof entry === "object") {
          const message = (entry as Record<string, unknown>).msg;
          return typeof message === "string" ? message.trim() : "";
        }
        return "";
      })
      .filter((part) => part.length > 0);

    if (detailParts.length > 0) {
      return detailParts.join("; ");
    }
  }

  if (typeof asRecord.message === "string") {
    const trimmed = asRecord.message.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }

  return null;
}

async function readBackendErrorMessage(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    try {
      const payload: unknown = await response.json();
      const detail = extractBackendErrorDetail(payload);
      if (detail) {
        return detail;
      }
    } catch {
      // Fall through to plain-text parsing.
    }
  }

  try {
    const text = (await response.text()).trim();
    if (text.length > 0) {
      return text;
    }
  } catch {
    // Ignore parse errors and return fallback.
  }

  return response.statusText || "Request failed";
}

const AdminAIErrorPayloadSchema = z
  .object({
    error_code: z.string().trim().min(1).optional(),
    errorCode: z.string().trim().min(1).optional(),
    detail: z.unknown().optional(),
    message: z.string().trim().min(1).optional(),
  })
  .passthrough();

function extractAdminAIErrorCode(payload: unknown): string | null {
  const parsed = AdminAIErrorPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return null;
  }

  return parsed.data.error_code ?? parsed.data.errorCode ?? null;
}

function extractAdminAIErrorMessage(payload: unknown): string | null {
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (!payload || typeof payload !== "object") {
    return null;
  }

  const parsed = AdminAIErrorPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return extractBackendErrorDetail(payload);
  }

  if (parsed.data.message) {
    return parsed.data.message;
  }

  const detail = extractBackendErrorDetail({ detail: parsed.data.detail });
  if (detail) {
    return detail;
  }

  return extractBackendErrorDetail(payload);
}

async function parseAdminAIErrorResponse(response: Response): Promise<{
  errorCode: string;
  message: string;
}> {
  const fallbackMessage = response.statusText || "AI request failed";
  const fallbackErrorCode = `HTTP_${response.status}`;

  try {
    const raw = await response.text();
    const trimmed = raw.trim();

    if (trimmed.length === 0) {
      return {
        errorCode: fallbackErrorCode,
        message: fallbackMessage,
      };
    }

    try {
      const payload: unknown = JSON.parse(trimmed);
      const message = extractAdminAIErrorMessage(payload) ?? fallbackMessage;
      const errorCode = extractAdminAIErrorCode(payload) ?? fallbackErrorCode;

      return {
        errorCode,
        message,
      };
    } catch {
      return {
        errorCode: fallbackErrorCode,
        message: trimmed,
      };
    }
  } catch {
    return {
      errorCode: fallbackErrorCode,
      message: fallbackMessage,
    };
  }
}

export class AdminAIPackageError extends Error {
  readonly errorCode: string;
  readonly status: number;

  constructor(message: string, errorCode: string, status: number) {
    super(message);
    this.name = "AdminAIPackageError";
    this.errorCode = errorCode;
    this.status = status;
  }
}

export async function updateAdminPackage(
  token: string,
  packageId: string,
  patch: {
    availability?: "available" | "unavailable" | "hidden";
    enabled?: boolean;
    xp_threshold?: number | null;
    tags?: string[];
  },
): Promise<PackageSummary> {
  const encodedId = encodeURIComponent(packageId);
  const response = await fetchWithTimeout(`${BASE_URL}/admin/packages/${encodedId}`, {
    method: "PATCH",
    headers: getAdminHeaders(token),
    body: JSON.stringify(patch),
  });

  if (!response.ok) {
    const detail = await readBackendErrorMessage(response);
    throw new Error(
      `Failed to update package '${packageId}' (${response.status}): ${detail}`,
    );
  }

  const data: unknown = await response.json();
  return PackageSummarySchema.parse(data);
}

export async function publishAdminPackage(
  token: string,
  yamlContent: string,
): Promise<AdminPackageSummary> {
  const response = await fetchWithTimeout(`${BASE_URL}/admin/packages`, {
    method: "POST",
    headers: getAdminHeaders(token),
    body: JSON.stringify({ yaml_content: yamlContent }),
  });

  if (!response.ok) {
    const detail = await readBackendErrorMessage(response);
    throw new Error(`Failed to publish package (${response.status}): ${detail}`);
  }

  const data: unknown = await response.json();
  return AdminPackageSummarySchema.parse(data);
}

export async function validateAdminPackage(
  token: string,
  yamlContent: string,
): Promise<AdminPackageValidationResult> {
  const response = await fetchWithTimeout(`${BASE_URL}/admin/packages/validate`, {
    method: "POST",
    headers: getAdminHeaders(token),
    body: JSON.stringify({ yaml_content: yamlContent }),
  });
  if (!response.ok) {
    const detail = await readBackendErrorMessage(response);
    throw new Error(detail || "Failed to validate package YAML.");
  }
  const data: unknown = await response.json();
  return AdminPackageValidationResponseSchema.parse(data);
}

export async function validateAdminPackageUpload(
  token: string,
  file: File,
): Promise<AdminPackageValidationResult> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetchWithTimeout(
    `${BASE_URL}/admin/packages/validate-upload`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    },
  );
  if (!response.ok) {
    const detail = await readBackendErrorMessage(response);
    throw new Error(detail || "Failed to validate uploaded YAML.");
  }
  const data: unknown = await response.json();
  return AdminPackageValidationResponseSchema.parse(data);
}

export async function generateAdminPackage(
  token: string,
  payload: {
    topic: string;
    audience: string;
    num_pages: number;
    num_questions: number;
  },
): Promise<AdminPackageGenerateResponse> {
  const response = await fetchWithTimeout(
    `${BASE_URL}/admin/packages/generate`,
    {
      method: "POST",
      headers: getAdminHeaders(token),
      body: JSON.stringify(payload),
    },
    ADMIN_AI_TIMEOUT_MS,
  );

  if (!response.ok) {
    const parsedError = await parseAdminAIErrorResponse(response);
    throw new AdminAIPackageError(
      `Failed to generate package (${response.status}): ${parsedError.message}`,
      parsedError.errorCode,
      response.status,
    );
  }

  const data: unknown = await response.json();
  return AdminPackageGenerateResponseSchema.parse(data);
}

const RefreshResultSchema = z
  .object({
    package_id: z.string().min(1),
    previous_version: z.string().min(1),
    new_version: z.string().min(1),
    diff_summary: z.string(),
    dry_run: z.boolean(),
    refreshed_at: z.string().datetime().nullable().optional(),
  })
  .strict();

export type AdminRefreshResult = z.infer<typeof RefreshResultSchema>;

export async function refreshAdminPackage(
  token: string,
  packageId: string,
): Promise<AdminRefreshResult> {
  const encodedId = encodeURIComponent(packageId);
  const response = await fetchWithTimeout(
    `${BASE_URL}/admin/packages/${encodedId}/refresh`,
    {
      method: "POST",
      headers: getAdminHeaders(token),
    },
    ADMIN_AI_TIMEOUT_MS,
  );

  if (!response.ok) {
    const parsedError = await parseAdminAIErrorResponse(response);
    throw new AdminAIPackageError(
      `Failed to refresh package '${packageId}' (${response.status}): ${parsedError.message}`,
      parsedError.errorCode,
      response.status,
    );
  }

  const data: unknown = await response.json();
  return RefreshResultSchema.parse(data);
}

export async function fetchAdminUsers(token: string): Promise<AdminManagedUser[]> {
  const response = await fetchWithTimeout(`${BASE_URL}/admin/users`, {
    headers: getAdminHeaders(token),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Failed to fetch admin users (${response.status}): ${detail}`);
  }

  const data: unknown = await response.json();
  return z.array(AdminManagedUserSchema).parse(data);
}

export async function updateAdminUserRole(
  token: string,
  userId: number,
  role: AdminManagedUserRole,
): Promise<AdminManagedUser> {
  const response = await fetchWithTimeout(`${BASE_URL}/admin/users/${userId}/role`, {
    method: "PATCH",
    headers: getAdminHeaders(token),
    body: JSON.stringify({ role: AdminManagedUserRoleSchema.parse(role) }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Failed to update user role (${response.status}): ${detail}`);
  }

  const data: unknown = await response.json();
  return AdminManagedUserSchema.parse(data);
}

export async function setAdminUserXP(
  token: string,
  userId: number,
  xp: number,
): Promise<AdminManagedUserXP> {
  const response = await fetchWithTimeout(`${BASE_URL}/admin/users/${userId}/xp/set`, {
    method: "PATCH",
    headers: getAdminHeaders(token),
    body: JSON.stringify({ xp }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Failed to set user XP (${response.status}): ${detail}`);
  }

  const data: unknown = await response.json();
  return AdminManagedUserXPSchema.parse(data);
}

export async function resetAdminUserXP(
  token: string,
  userId: number,
): Promise<AdminManagedUserXP> {
  const response = await fetchWithTimeout(
    `${BASE_URL}/admin/users/${userId}/xp/reset`,
    {
      method: "POST",
      headers: getAdminHeaders(token),
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Failed to reset user XP (${response.status}): ${detail}`);
  }

  const data: unknown = await response.json();
  return AdminManagedUserXPSchema.parse(data);
}

export async function grantAdminUserXPBonus(
  token: string,
  userId: number,
  payload: { xp: number; reason: string },
): Promise<AdminManagedUserXP> {
  const response = await fetchWithTimeout(
    `${BASE_URL}/admin/users/${userId}/xp/bonus`,
    {
      method: "POST",
      headers: getAdminHeaders(token),
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Failed to grant user bonus XP (${response.status}): ${detail}`);
  }

  const data: unknown = await response.json();
  return AdminManagedUserXPSchema.parse(data);
}

export async function resetAdminUserProgress(
  token: string,
  userId: number,
  options?: { reset_xp?: boolean },
): Promise<AdminManagedUserProgressReset> {
  const body = options?.reset_xp ? { reset_xp: true } : undefined;
  const response = await fetchWithTimeout(
    `${BASE_URL}/admin/users/${userId}/progress/reset`,
    {
      method: "POST",
      headers: getAdminHeaders(token),
      body: body ? JSON.stringify(body) : undefined,
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Failed to reset user progress (${response.status}): ${detail}`);
  }

  const data: unknown = await response.json();
  return AdminManagedUserProgressResetSchema.parse(data);
}

export async function deleteAdminUser(
  token: string,
  userId: number,
): Promise<AdminManagedUserDelete> {
  const response = await fetchWithTimeout(`${BASE_URL}/admin/users/${userId}`, {
    method: "DELETE",
    headers: getAdminHeaders(token),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Failed to delete user (${response.status}): ${detail}`);
  }

  const data: unknown = await response.json();
  return AdminManagedUserDeleteSchema.parse(data);
}

export async function deleteAdminPackage(
  token: string,
  packageId: string,
  options?: {
    permanent?: boolean;
    confirm?: boolean;
  },
): Promise<AdminPackageDeleteResponse> {
  const encodedId = encodeURIComponent(packageId);
  const params = new URLSearchParams();
  if (options?.permanent) {
    params.set("permanent", "true");
  }
  if (options?.confirm) {
    params.set("confirm", "true");
  }

  const query = params.size > 0 ? `?${params.toString()}` : "";
  const response = await fetchWithTimeout(
    `${BASE_URL}/admin/packages/${encodedId}${query}`,
    {
      method: "DELETE",
      headers: getAdminHeaders(token),
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Failed to delete package '${packageId}' (${response.status}): ${detail}`,
    );
  }

  const data: unknown = await response.json();
  return AdminPackageDeleteResponseSchema.parse(data);
}

export async function fetchAdminAuditLogs(
  token: string,
  filters: AdminAuditLogFilters = {},
): Promise<AdminAuditLogEntry[]> {
  const requestedLimit = filters.limit ?? 50;
  const actionFilter = filters.action?.trim();
  const boundedLimit = Math.min(500, Math.max(1, Math.trunc(requestedLimit)));
  const params = new URLSearchParams({ limit: String(boundedLimit) });
  if (actionFilter) {
    params.set("action", actionFilter);
  }
  if (
    typeof filters.actor_user_id === "number" &&
    Number.isInteger(filters.actor_user_id) &&
    filters.actor_user_id > 0
  ) {
    params.set("actor_user_id", String(filters.actor_user_id));
  }
  if (typeof filters.from === "string" && filters.from.length > 0) {
    params.set("from", filters.from);
  }
  if (typeof filters.until === "string" && filters.until.length > 0) {
    params.set("until", filters.until);
  }

  const response = await fetchWithTimeout(
    `${BASE_URL}/admin/audit-logs?${params.toString()}`,
    {
      headers: getAdminHeaders(token),
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Failed to fetch admin audit logs (${response.status}): ${detail}`);
  }

  const data: unknown = await response.json();
  return z.array(AdminAuditLogEntrySchema).parse(data);
}
