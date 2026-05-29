export interface LevelProgress {
  level: number;
  currentLevelThreshold: number;
  nextLevelThreshold: number;
  progressRatio: number;
  remainingXP: number;
}

export function levelThreshold(level: number, baseXPPerLevel: number): number {
  const safeLevel = Math.max(1, Math.floor(level));
  const safeBase = Math.max(1, Math.floor(baseXPPerLevel));
  return (safeLevel - 1) * safeBase;
}

export function deriveLevelProgress(xp: number, baseXPPerLevel: number): LevelProgress {
  const safeXP = Math.max(0, Math.floor(xp));
  const safeBase = Math.max(1, Math.floor(baseXPPerLevel));
  const level = Math.floor(safeXP / safeBase) + 1;
  const currentLevelThreshold = levelThreshold(level, safeBase);
  const nextLevelThreshold = levelThreshold(level + 1, safeBase);
  const progressRatio = Math.min(
    1,
    Math.max(0, (safeXP - currentLevelThreshold) / safeBase),
  );
  const remainingXP = Math.max(0, nextLevelThreshold - safeXP);

  return {
    level,
    currentLevelThreshold,
    nextLevelThreshold,
    progressRatio,
    remainingXP,
  };
}
