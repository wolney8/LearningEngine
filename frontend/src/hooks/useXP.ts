import { useXPContext } from "../context/XPContext";
import type { LevelProgress } from "../utils/levelProgress";

export function useXP(): {
  xp: number;
  addXP: (amount: number) => void;
  subtractXP: (amount: number) => void;
  syncXP: (value: number) => void;
  levelProgress: LevelProgress;
  changeVersion: number;
  lastChangeKind: "add" | "subtract" | "sync" | null;
  latestDecayNotice: {
    deducted_xp: number;
    stale_package_count: number;
    intervals_applied: number;
    floor_reached: boolean;
    stale_window_days: number;
  } | null;
  clearDecayNotice: () => void;
} {
  return useXPContext();
}
