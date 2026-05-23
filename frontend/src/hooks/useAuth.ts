import { useCallback, useEffect, useState } from "react";
import type { LoginRequest, RegisterRequest, User } from "../schemas/auth";
import {
  clearAuthToken,
  fetchCurrentUser,
  getAuthToken,
  loginUser,
  registerUser,
  setAuthToken,
} from "../services/api";

type AuthStatus = "idle" | "loading" | "authenticated" | "error";

export function useAuth(): {
  user: User | null;
  token: string | null;
  status: AuthStatus;
  error: string;
  login: (payload: LoginRequest) => Promise<void>;
  register: (payload: RegisterRequest) => Promise<void>;
  logout: () => void;
} {
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

  const login = useCallback(async (payload: LoginRequest) => {
    setStatus("loading");
    setError("");
    try {
      const response = await loginUser(payload);
      setAuthToken(response.access_token);
      setToken(response.access_token);
      setUser(response.user);
      setStatus("authenticated");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Login failed");
      throw err;
    }
  }, []);

  const register = useCallback(async (payload: RegisterRequest) => {
    setStatus("loading");
    setError("");
    try {
      const response = await registerUser(payload);
      setAuthToken(response.access_token);
      setToken(response.access_token);
      setUser(response.user);
      setStatus("authenticated");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Registration failed");
      throw err;
    }
  }, []);

  const logout = useCallback(() => {
    clearAuthToken();
    setToken(null);
    setUser(null);
    setStatus("idle");
    setError("");
  }, []);

  return {
    user,
    token,
    status,
    error,
    login,
    register,
    logout,
  };
}
