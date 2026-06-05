import { useEffect, useRef } from "react";

const DEFAULT_INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000;
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "scroll", "touchstart"] as const;

function readInactivityTimeoutMs(): number {
  const override = (
    window as Window & {
      __LLE_INACTIVITY_TIMEOUT_MS__?: unknown;
    }
  ).__LLE_INACTIVITY_TIMEOUT_MS__;

  if (typeof override === "number" && Number.isFinite(override) && override > 0) {
    return override;
  }

  return DEFAULT_INACTIVITY_TIMEOUT_MS;
}

export function useInactivityLogout(
  isAuthenticated: boolean,
  logout: () => void,
): void {
  const timeoutIdRef = useRef<number | null>(null);
  const hasTimedOutRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated) {
      hasTimedOutRef.current = false;
      if (timeoutIdRef.current !== null) {
        window.clearTimeout(timeoutIdRef.current);
        timeoutIdRef.current = null;
      }
      return;
    }

    const clearTimer = () => {
      if (timeoutIdRef.current !== null) {
        window.clearTimeout(timeoutIdRef.current);
        timeoutIdRef.current = null;
      }
    };

    const handleTimeout = () => {
      if (hasTimedOutRef.current) {
        return;
      }

      hasTimedOutRef.current = true;
      clearTimer();
      logout();
    };

    const scheduleTimeout = () => {
      clearTimer();
      timeoutIdRef.current = window.setTimeout(
        handleTimeout,
        readInactivityTimeoutMs(),
      );
    };

    const handleActivity = () => {
      if (hasTimedOutRef.current) {
        return;
      }
      scheduleTimeout();
    };

    hasTimedOutRef.current = false;
    scheduleTimeout();

    for (const eventName of ACTIVITY_EVENTS) {
      window.addEventListener(eventName, handleActivity, { passive: true });
    }

    return () => {
      clearTimer();
      for (const eventName of ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, handleActivity);
      }
    };
  }, [isAuthenticated, logout]);
}
