import {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useAuth } from "../hooks/useAuth";
import { useSettings } from "../hooks/useSettings";
import {
  fetchMyXP,
  readAnonymousXP,
  updateMyXP,
  writeAnonymousXP,
} from "../services/api";
import { type LevelProgress, deriveLevelProgress } from "../utils/levelProgress";

interface XPContextValue {
  xp: number;
  addXP: (amount: number) => void;
  subtractXP: (amount: number) => void;
  levelProgress: LevelProgress;
  changeVersion: number;
  lastChangeKind: "add" | "subtract" | "sync" | null;
}

const XPContext = createContext<XPContextValue | null>(null);

function readXP(): number {
  return readAnonymousXP() ?? 0;
}

function writeXP(value: number): void {
  writeAnonymousXP(value);
}

export function XPProvider({ children }: { children: ReactNode }) {
  const { token, status } = useAuth();
  const { settings } = useSettings();
  const [xp, setXP] = useState<number>(readXP);
  const [changeVersion, setChangeVersion] = useState<number>(0);
  const [lastChangeKind, setLastChangeKind] = useState<
    "add" | "subtract" | "sync" | null
  >(null);
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
      setLastChangeKind("sync");
      return;
    }

    let cancelled = false;
    void fetchMyXP(token)
      .then((nextXP) => {
        if (!cancelled) {
          xpRef.current = nextXP;
          setXP(nextXP);
          setLastChangeKind("sync");
        }
      })
      .catch(() => {
        if (!cancelled) {
          xpRef.current = 0;
          setXP(0);
          setLastChangeKind("sync");
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
    if (amount <= 0) {
      return;
    }

    const base = token && status === "authenticated" ? xpRef.current : readXP();
    const next = base + amount;
    xpRef.current = next;
    setXP(next);
    setLastChangeKind("add");
    setChangeVersion((current) => current + 1);

    if (token && status === "authenticated") {
      persistAuthenticatedXP(next);
      return;
    }

    writeXP(next);
  }

  function subtractXP(amount: number): void {
    if (amount <= 0) {
      return;
    }

    const base = token && status === "authenticated" ? xpRef.current : readXP();
    const next = Math.max(0, base - amount);
    xpRef.current = next;
    setXP(next);
    setLastChangeKind("subtract");
    setChangeVersion((current) => current + 1);

    if (token && status === "authenticated") {
      persistAuthenticatedXP(next);
      return;
    }

    writeXP(next);
  }

  const levelProgress = useMemo(
    () => deriveLevelProgress(xp, settings.xp.base_xp_per_level),
    [xp, settings.xp.base_xp_per_level],
  );

  const value: XPContextValue = {
    xp,
    addXP,
    subtractXP,
    levelProgress,
    changeVersion,
    lastChangeKind,
  };

  return <XPContext.Provider value={value}>{children}</XPContext.Provider>;
}

export function useXPContext(): XPContextValue {
  const context = useContext(XPContext);
  if (!context) {
    throw new Error("useXP must be used within an XPProvider");
  }
  return context;
}
