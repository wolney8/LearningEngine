import { useCallback, useState } from "react";
import type { XpSpendAction, XpSpendResponse } from "../schemas/xpSpend";
import { spendXP } from "../services/api";
import { useAuth } from "./useAuth";
import { useXP } from "./useXP";

// Wraps spendXP API call with loading/error state.
// Uses server-returned xp_remaining to keep XP context authoritative.
export function useXPSpend(): {
  spend: (
    action: XpSpendAction,
    packageId: string,
    difficulty?: "hard" | "expert",
  ) => Promise<XpSpendResponse>;
  loading: boolean;
  error: string | null;
  reset: () => void;
} {
  const { token } = useAuth();
  const { syncXP } = useXP();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setError(null);
  }, []);

  const spend = useCallback(
    async (
      action: XpSpendAction,
      packageId: string,
      difficulty?: "hard" | "expert",
    ): Promise<XpSpendResponse> => {
      if (!token) {
        const message = "You must be logged in to spend XP";
        setError(message);
        throw new Error(message);
      }

      setLoading(true);
      setError(null);

      try {
        const response = await spendXP(token, action, packageId, difficulty);
        syncXP(response.xp_remaining);
        setError(null);
        return response;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to spend XP";
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [syncXP, token],
  );

  return {
    spend,
    loading,
    error,
    reset,
  };
}
