import type { Difficulty } from "../types/difficulty";
import { DIFFICULTY_LABEL as difficultyLabel } from "../types/difficulty";
import type { PackageTestResults } from "../types/testResult";
import "./PackageProgressPanel.css";

interface PackageProgressPanelProps {
  results: PackageTestResults;
}

const DIFFICULTIES: Difficulty[] = ["easy", "normal", "hard", "expert"];
const DIFFICULTY_INITIAL: Record<Difficulty, string> = {
  easy: "E",
  normal: "N",
  hard: "H",
  expert: "X",
};

function buildAriaLabel(
  difficulty: Difficulty,
  result: PackageTestResults[Difficulty],
): string {
  const label = difficultyLabel[difficulty];

  if (!result) {
    return `${label}: Not attempted`;
  }

  if (!result.passed) {
    return `${label}: Attempted — best score ${result.bestScore}%`;
  }

  return `${label}: Passed — best score ${result.bestScore}%`;
}

export function PackageProgressPanel({ results }: PackageProgressPanelProps) {
  const attemptedDifficulties = DIFFICULTIES.filter((difficulty) =>
    Boolean(results[difficulty]),
  );

  const lastDifficulty = attemptedDifficulties.reduce<Difficulty | null>(
    (latest, difficulty) => {
      if (!latest) {
        return difficulty;
      }

      const currentDate = results[difficulty]?.lastAttemptedAt ?? "";
      const latestDate = results[latest]?.lastAttemptedAt ?? "";
      return currentDate > latestDate ? difficulty : latest;
    },
    null,
  );

  const lastScore = lastDifficulty
    ? (results[lastDifficulty]?.bestScore ?? 0)
    : 0;
  const totalBestXp = attemptedDifficulties.reduce((sum, difficulty) => {
    return sum + (results[difficulty]?.bestXpEarned ?? 0);
  }, 0);

  return (
    <>
      <div className="difficulty-indicators">
        {DIFFICULTIES.map((difficulty) => {
          const result = results[difficulty];
          const stateClass = !result
            ? "difficulty-circle--not-attempted"
            : result.passed
              ? `difficulty-circle--passed difficulty-circle--passed-${difficulty}`
              : "difficulty-circle--attempted";

          return (
            <span
              key={difficulty}
              className={`difficulty-circle ${stateClass}`}
              role="img"
              aria-label={buildAriaLabel(difficulty, result)}
              data-difficulty={difficulty}
            >
              {DIFFICULTY_INITIAL[difficulty]}
            </span>
          );
        })}
      </div>

      {Object.keys(results).length > 0 && lastDifficulty && (
        <div className="package-stats-strip">
          <span className="package-stats-strip__last-test">
            Last test: {difficultyLabel[lastDifficulty]} — {lastScore}%
          </span>
          <span className="package-stats-strip__xp">{totalBestXp} XP</span>
        </div>
      )}
    </>
  );
}
