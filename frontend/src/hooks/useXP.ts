import { useEffect, useRef, useState } from "react";
import {
  fetchMyXP,
  readAnonymousXP,
  updateMyXP,
  writeAnonymousXP,
} from "../services/api";
import { type LevelProgress, deriveLevelProgress } from "../utils/levelProgress";
import { useAuth } from "./useAuth";
import { useSettings } from "./useSettings";

function readXP(): number {
  return readAnonymousXP() ?? 0;
}

function writeXP(value: number): void {
  writeAnonymousXP(value);
}

export function useXP(): {
  xp: number;
  addXP: (amount: number) => void;
  subtractXP: (amount: number) => void;
  levelProgress: LevelProgress;
} {
  const { token, status } = useAuth();
  const { settings } = useSettings();
  const [xp, setXP] = useState<number>(readXP);
  const requestChain = useRef<Promise<void>>(Promise.resolve());
  const xpRef = useRef<number>(xp);

  useEffect(() => {
    xpRef.current = xp;
  }, [xp]);

  useEffect(() => {
    if (!token || status !== "authenticated") {
      const localXP = readXP();
      xpRef.current = localXP;
      setXP(localXP);
      return;
    }

    let cancelled = false;
    void fetchMyXP(token)
      .then((nextXP) => {
        if (!cancelled) {
          xpRef.current = nextXP;
          setXP(nextXP);
        }
      })
      .catch(() => {
        if (!cancelled) {
          xpRef.current = 0;
          setXP(0);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [status, token]);

  function persistAuthenticatedXP(nextXP: number): void {
    if (!token) {
      return;
    }

    requestChain.current = requestChain.current
      .then(async () => {
        const persistedXP = await updateMyXP(token, nextXP);
        xpRef.current = persistedXP;
        setXP(persistedXP);
      })
      .catch(() => {
        // Keep UI responsive if the save fails; server state remains authoritative.
      });
  }

  function addXP(amount: number): void {
    const base = token && status === "authenticated" ? xpRef.current : readXP();
    const next = base + amount;
    xpRef.current = next;
    setXP(next);

    if (token && status === "authenticated") {
      persistAuthenticatedXP(next);
      return;
    }

    writeXP(next);
  }

  function subtractXP(amount: number): void {
    const base = token && status === "authenticated" ? xpRef.current : readXP();
    const next = Math.max(0, base - amount);
    xpRef.current = next;
    setXP(next);

    if (token && status === "authenticated") {
      persistAuthenticatedXP(next);
      return;
    }

    writeXP(next);
  }

  const levelProgress = deriveLevelProgress(xp, settings.xp.base_xp_per_level);

  return { xp, addXP, subtractXP, levelProgress };
}
