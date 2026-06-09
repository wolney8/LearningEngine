import { type MutableRefObject, useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_INACTIVITY_TIMEOUT_MS = 20 * 60 * 1000;
const DEFAULT_INACTIVITY_WARNING_MS = 60 * 1000;
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

function readInactivityWarningMs(timeoutMs: number): number {
  const override = (
    window as Window & {
      __LLE_INACTIVITY_WARNING_MS__?: unknown;
    }
  ).__LLE_INACTIVITY_WARNING_MS__;

  if (typeof override === "number" && Number.isFinite(override) && override >= 0) {
    return Math.min(override, Math.max(timeoutMs - 1, 0));
  }

  return Math.min(DEFAULT_INACTIVITY_WARNING_MS, Math.max(timeoutMs - 1, 0));
}

interface InactivityWarningState {
  warningOpen: boolean;
  countdownSeconds: number;
  staySignedIn: () => void;
  signOutNow: () => void;
}

export function useInactivityLogout(
  isAuthenticated: boolean,
  logout: () => void,
): InactivityWarningState {
  const warningTimeoutIdRef = useRef<number | null>(null);
  const logoutTimeoutIdRef = useRef<number | null>(null);
  const countdownIntervalIdRef = useRef<number | null>(null);
  const hasTimedOutRef = useRef(false);
  const warningOpenRef = useRef(false);
  const logoutAtRef = useRef<number | null>(null);
  const [warningOpen, setWarningOpen] = useState(false);
  const [countdownSeconds, setCountdownSeconds] = useState(0);

  const clearTimer = useCallback((timerRef: MutableRefObject<number | null>) => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const clearIntervalTimer = useCallback(() => {
    if (countdownIntervalIdRef.current !== null) {
      window.clearInterval(countdownIntervalIdRef.current);
      countdownIntervalIdRef.current = null;
    }
  }, []);

  const dismissWarning = useCallback(() => {
    warningOpenRef.current = false;
    setWarningOpen(false);
    setCountdownSeconds(0);
    clearIntervalTimer();
  }, [clearIntervalTimer]);

  const handleTimeout = useCallback(() => {
    if (hasTimedOutRef.current) {
      return;
    }

    hasTimedOutRef.current = true;
    dismissWarning();
    clearTimer(warningTimeoutIdRef);
    clearTimer(logoutTimeoutIdRef);
    logoutAtRef.current = null;
    logout();
  }, [clearTimer, dismissWarning, logout]);

  const scheduleTimeout = useCallback(() => {
    const timeoutMs = readInactivityTimeoutMs();
    const warningMs = readInactivityWarningMs(timeoutMs);
    clearTimer(warningTimeoutIdRef);
    clearTimer(logoutTimeoutIdRef);
    clearIntervalTimer();
    logoutAtRef.current = Date.now() + timeoutMs;
    dismissWarning();

    if (warningMs > 0) {
      warningTimeoutIdRef.current = window.setTimeout(() => {
        warningOpenRef.current = true;
        setWarningOpen(true);
        const updateCountdown = () => {
          const logoutAt = logoutAtRef.current;
          if (logoutAt === null) {
            setCountdownSeconds(0);
            return;
          }

          const remainingMs = Math.max(logoutAt - Date.now(), 0);
          setCountdownSeconds(Math.max(Math.ceil(remainingMs / 1000), 0));
        };

        updateCountdown();
        countdownIntervalIdRef.current = window.setInterval(updateCountdown, 250);
      }, timeoutMs - warningMs);
    }

    logoutTimeoutIdRef.current = window.setTimeout(handleTimeout, timeoutMs);
  }, [clearIntervalTimer, clearTimer, dismissWarning, handleTimeout]);

  const staySignedIn = useCallback(() => {
    if (hasTimedOutRef.current) {
      return;
    }
    scheduleTimeout();
  }, [scheduleTimeout]);

  const signOutNow = useCallback(() => {
    handleTimeout();
  }, [handleTimeout]);

  useEffect(() => {
    if (!isAuthenticated) {
      hasTimedOutRef.current = false;
      clearTimer(warningTimeoutIdRef);
      clearTimer(logoutTimeoutIdRef);
      logoutAtRef.current = null;
      dismissWarning();
      return;
    }

    const handleActivity = () => {
      if (hasTimedOutRef.current) {
        return;
      }
      if (warningOpenRef.current) {
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
      clearTimer(warningTimeoutIdRef);
      clearTimer(logoutTimeoutIdRef);
      clearIntervalTimer();
      for (const eventName of ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, handleActivity);
      }
    };
  }, [
    clearIntervalTimer,
    clearTimer,
    dismissWarning,
    isAuthenticated,
    scheduleTimeout,
  ]);

  return { warningOpen, countdownSeconds, staySignedIn, signOutNow };
}
