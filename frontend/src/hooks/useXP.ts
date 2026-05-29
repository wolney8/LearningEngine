import { useXPContext } from "../context/XPContext";
import type { LevelProgress } from "../utils/levelProgress";

export function useXP(): {
  xp: number;
  addXP: (amount: number) => void;
  subtractXP: (amount: number) => void;
  levelProgress: LevelProgress;
  changeVersion: number;
  lastChangeKind: "add" | "subtract" | "sync" | null;
} {
  return useXPContext();
}
