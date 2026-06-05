import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  BonusXPNotice,
  LoginRequest,
  RegisterRequest,
  User,
} from "../schemas/auth";
import {
  clearAuthToken,
  fetchCurrentUser,
  fetchMyProgress,
  fetchMyStreak,
  fetchMyXP,
  getAuthToken,
  hasXPReconciliationDecision,
  loginUser,
  markXPReconciliationDecision,
  readAnonymousProgressSeeds,
  readAnonymousStreakSnapshot,
  readAnonymousXP,
  registerUser,
  resetAnonymousLocalProgress,
  setAuthToken,
  updateMyStreakSnapshot,
  updateMyXP,
  upsertMyProgressForPackage,
} from "../services/api";

export type AuthStatus = "idle" | "loading" | "authenticated" | "error";

export type AuthContextValue = {
  user: User | null;
  token: string | null;
  status: AuthStatus;
  error: string;
  logoutVersion: number;
  bonusXPNotice: BonusXPNotice | null;
  dismissBonusXPNotice: () => void;
  clearError: () => void;
  login: (payload: LoginRequest) => Promise<void>;
  register: (payload: RegisterRequest) => Promise<void>;
  logout: () => void;
  resetAnonymousLocalProgress: () => void;
  setCurrentUser: (nextUser: User) => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function earliestNonNull(a: string | null, b: string | null): string | null {
  if (a && b) {
    return a < b ? a : b;
  }
  return a ?? b;
}

function laterDate(a: string | null, b: string | null): string | null {
  if (a && b) {
    return a > b ? a : b;
  }
  return a ?? b;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => getAuthToken());
  const [status, setStatus] = useState<AuthStatus>("idle");
  const [error, setError] = useState<string>("");
  const [logoutVersion, setLogoutVersion] = useState(0);
  const [bonusXPNotice, setBonusXPNotice] = useState<BonusXPNotice | null>(null);

  useEffect(() => {
    if (!token) {
      return;
    }

    let cancelled = false;
    setStatus("loading");

    void fetchCurrentUser(token)
      .then((nextUser) => {
        if (cancelled) {
          return;
        }
        setUser(nextUser);
        setStatus("authenticated");
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        clearAuthToken();
        setToken(null);
        setUser(null);
        setStatus("idle");
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const reconcileAnonymousLocalState = useCallback(
    async (nextToken: string, userId: number) => {
      if (hasXPReconciliationDecision(userId)) {
        return;
      }

      const anonymousXP = readAnonymousXP();
      const anonymousProgress = readAnonymousProgressSeeds();
      const anonymousStreak = readAnonymousStreakSnapshot();
      const hasAnonymousData =
        anonymousXP !== null ||
        anonymousProgress.length > 0 ||
        anonymousStreak.streak_count > 0 ||
        anonymousStreak.last_practised_date !== null;

      if (!hasAnonymousData) {
        markXPReconciliationDecision(userId);
        return;
      }

      const shouldImportAnonymousData = window.confirm(
        "We found local anonymous data on this device (XP, saved progress, and streak).\n\nPress OK to import this local data into your account.\n\nYour existing account progress is safe and will not be overwritten.",
      );

      if (!shouldImportAnonymousData) {
        resetAnonymousLocalProgress();
        markXPReconciliationDecision(userId);
        return;
      }

      let importSucceeded = true;

      if (anonymousXP !== null) {
        try {
          const serverXP = await fetchMyXP(nextToken);
          const mergedXP = Math.max(anonymousXP, serverXP.xp);
          await updateMyXP(nextToken, mergedXP);
        } catch {
          importSucceeded = false;
        }
      }

      if (anonymousProgress.length > 0) {
        try {
          const serverRows = await fetchMyProgress(nextToken);
          const serverByPackageId = new Map(
            serverRows.map((row) => [row.package_id, row] as const),
          );

          for (const localRow of anonymousProgress) {
            const serverRow = serverByPackageId.get(localRow.package_id);

            const mergedAttemptCount = Math.max(
              localRow.attempt_count,
              serverRow?.attempt_count ?? 0,
            );
            const mergedCompleted =
              localRow.completed || (serverRow?.completed ?? false);
            const mergedLatestWeightedScore = Math.max(
              localRow.latest_weighted_score,
              serverRow?.latest_weighted_score ?? 0,
            );
            const mergedFirstCompletedAt = earliestNonNull(
              localRow.first_completed_at,
              serverRow?.first_completed_at ?? null,
            );

            const shouldUpsert =
              !serverRow ||
              mergedAttemptCount !== serverRow.attempt_count ||
              mergedCompleted !== serverRow.completed ||
              mergedLatestWeightedScore !== serverRow.latest_weighted_score ||
              (serverRow.first_completed_at === null &&
                mergedFirstCompletedAt !== null);

            if (!shouldUpsert) {
              continue;
            }

            await upsertMyProgressForPackage(nextToken, localRow.package_id, {
              latest_weighted_score: mergedLatestWeightedScore,
              completed: mergedCompleted,
              ...(mergedAttemptCount > 0 ? { attempt_count: mergedAttemptCount } : {}),
            });
          }
        } catch {
          importSucceeded = false;
        }
      }

      const hasAnonymousStreakData =
        anonymousStreak.streak_count > 0 ||
        anonymousStreak.last_practised_date !== null;

      if (hasAnonymousStreakData) {
        try {
          const serverStreak = await fetchMyStreak(nextToken);
          const mergedStreakCount =
            serverStreak.streak_count === 0 && anonymousStreak.streak_count > 0
              ? anonymousStreak.streak_count
              : serverStreak.streak_count;
          const mergedLastPractisedDate = laterDate(
            serverStreak.last_practised_date,
            anonymousStreak.last_practised_date,
          );

          if (
            mergedStreakCount !== serverStreak.streak_count ||
            mergedLastPractisedDate !== serverStreak.last_practised_date
          ) {
            await updateMyStreakSnapshot(nextToken, {
              streak_count: mergedStreakCount,
              last_practised_date: mergedLastPractisedDate,
            });
          }
        } catch {
          importSucceeded = false;
        }
      }

      if (importSucceeded) {
        // Mark complete only when import fully succeeds.
        resetAnonymousLocalProgress();
        markXPReconciliationDecision(userId);
      }
    },
    [],
  );

  const login = useCallback(
    async (payload: LoginRequest) => {
      setStatus("loading");
      setError("");
      try {
        const response = await loginUser(payload);
        setAuthToken(response.access_token);
        setToken(response.access_token);
        setUser(response.user);
        setBonusXPNotice(response.user.bonus_xp_notice ?? null);
        setStatus("authenticated");
        void reconcileAnonymousLocalState(
          response.access_token,
          response.user.id,
        ).catch(() => {
          // Reconciliation is best-effort and must not block auth success.
        });
      } catch (err) {
        setStatus("error");
        setError(err instanceof Error ? err.message : "Login failed");
        throw err;
      }
    },
    [reconcileAnonymousLocalState],
  );

  const register = useCallback(
    async (payload: RegisterRequest) => {
      setStatus("loading");
      setError("");
      try {
        const response = await registerUser(payload);
        setAuthToken(response.access_token);
        setToken(response.access_token);
        setUser(response.user);
        setBonusXPNotice(null);
        setStatus("authenticated");
        void reconcileAnonymousLocalState(
          response.access_token,
          response.user.id,
        ).catch(() => {
          // Reconciliation is best-effort and must not block auth success.
        });
      } catch (err) {
        setStatus("error");
        setError(err instanceof Error ? err.message : "Registration failed");
        throw err;
      }
    },
    [reconcileAnonymousLocalState],
  );

  const logout = useCallback(() => {
    clearAuthToken();
    resetAnonymousLocalProgress();
    setToken(null);
    setUser(null);
    setBonusXPNotice(null);
    setStatus("idle");
    setError("");
    setLogoutVersion((current) => current + 1);
  }, []);

  const dismissBonusXPNotice = useCallback(() => {
    setBonusXPNotice(null);
  }, []);

  const clearError = useCallback(() => {
    setError("");
    setStatus((current) => (current === "error" ? "idle" : current));
  }, []);

  const setCurrentUser = useCallback((nextUser: User) => {
    setUser(nextUser);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      status,
      error,
      logoutVersion,
      bonusXPNotice,
      dismissBonusXPNotice,
      clearError,
      login,
      register,
      logout,
      resetAnonymousLocalProgress,
      setCurrentUser,
    }),
    [
      bonusXPNotice,
      clearError,
      dismissBonusXPNotice,
      error,
      logoutVersion,
      login,
      logout,
      register,
      setCurrentUser,
      status,
      token,
      user,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
