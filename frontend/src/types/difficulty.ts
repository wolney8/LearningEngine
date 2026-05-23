export type Difficulty = "easy" | "normal" | "hard" | "expert";

export const SECONDS_PER_QUESTION: Record<Difficulty, number> = {
  easy: 90,
  normal: 45,
  hard: 20,
  expert: 10,
};

export const DIFFICULTY_XP_MULTIPLIER: Record<Difficulty, number> = {
  easy: 0.5,
  normal: 1.0,
  hard: 1.5,
  expert: 2.0,
};

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: "Easy",
  normal: "Normal",
  hard: "Hard",
  expert: "Expert",
};
