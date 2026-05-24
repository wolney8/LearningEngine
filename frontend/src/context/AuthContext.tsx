import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { LoginRequest, RegisterRequest, User } from "../schemas/auth";
import {
  clearAnonymousXP,
  clearAuthToken,
  fetchCurrentUser,
  fetchMyXP,
  getAuthToken,
  hasXPReconciliationDecision,
  loginUser,
  markXPReconciliationDecision,
  readAnonymousXP,
  registerUser,
  setAuthToken,
  updateMyXP,
} from "../services/api";

export type AuthStatus = "idle" | "loading" | "authenticated" | "error";

export type AuthContextValue = {
  user: User | null;
  token: string | null;
  status: AuthStatus;
  error: string;
  login: (payload: LoginRequest) => Promise<void>;
  register: (payload: RegisterRequest) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => getAuthToken());
  const [status, setStatus] = useState<AuthStatus>("idle");
  const [error, setError] = useState<string>("");

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

  const reconcileAnonymousXP = useCallback(
    async (nextToken: string, userId: number) => {
      if (hasXPReconciliationDecision(userId)) {
        return;
      }

      const anonymousXP = readAnonymousXP();
      if (anonymousXP === null) {
        return;
      }

      const shouldImportAnonymousXP = window.confirm(
        "Import XP from this device into your account?",
      );

      try {
        if (shouldImportAnonymousXP) {
          const serverXP = await fetchMyXP(nextToken);
          const mergedXP = Math.max(anonymousXP, serverXP);
          await updateMyXP(nextToken, mergedXP);
        }
      } finally {
        // Decision persistence and local cleanup happen for both choices.
        clearAnonymousXP();
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
        setStatus("authenticated");
        void reconcileAnonymousXP(response.access_token, response.user.id).catch(() => {
          // Reconciliation is best-effort and must not block auth success.
        });
      } catch (err) {
        setStatus("error");
        setError(err instanceof Error ? err.message : "Login failed");
        throw err;
      }
    },
    [reconcileAnonymousXP],
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
        setStatus("authenticated");
        void reconcileAnonymousXP(response.access_token, response.user.id).catch(() => {
          // Reconciliation is best-effort and must not block auth success.
        });
      } catch (err) {
        setStatus("error");
        setError(err instanceof Error ? err.message : "Registration failed");
        throw err;
      }
    },
    [reconcileAnonymousXP],
  );

  const logout = useCallback(() => {
    clearAuthToken();
    setToken(null);
    setUser(null);
    setStatus("idle");
    setError("");
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      status,
      error,
      login,
      register,
      logout,
    }),
    [error, login, logout, register, status, token, user],
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
