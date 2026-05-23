import { ProgressBar } from "./ProgressBar";
import "./TestNavigator.css";

interface TestNavigatorProps {
  questionCount: number;
  currentIndex: number;
  answeredIndexes: Set<number>;
  flaggedIndexes: Set<number>;
  timeRemaining: number;
  onNavigate: (index: number) => void;
}

export function TestNavigator({
  questionCount,
  currentIndex,
  answeredIndexes,
  flaggedIndexes,
  timeRemaining,
  onNavigate,
}: TestNavigatorProps) {
  const minutes = Math.floor(timeRemaining / 60);
  const seconds = timeRemaining % 60;
  const timeStr = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  const isWarning = timeRemaining < 30 && timeRemaining >= 10;
  const isDanger = timeRemaining < 10;

  const timerClass = isDanger
    ? "test-navigator__timer test-navigator__timer--danger"
    : isWarning
      ? "test-navigator__timer test-navigator__timer--warning"
      : "test-navigator__timer";

  return (
    <section className="test-navigator" aria-label="Test navigation">
      <div className="test-navigator__top">
        <ProgressBar
          current={answeredIndexes.size}
          total={questionCount}
          label={`${answeredIndexes.size} of ${questionCount} answered`}
        />
        <div
          className={timerClass}
          aria-label={`${minutes} minutes ${seconds} seconds remaining`}
        >
          {timeStr}
        </div>
      </div>
      <ol className="test-navigator__dots" aria-label="Question navigator">
        {Array.from({ length: questionCount }, (_, idx) => idx + 1).map(
          (questionNumber) => {
            const i = questionNumber - 1;
            const isCurrent = i === currentIndex;
            const isAnswered = answeredIndexes.has(i);
            const isFlagged = flaggedIndexes.has(i);
            let state = "unanswered";
            if (isCurrent) state = "current";
            else if (isFlagged) state = "flagged";
            else if (isAnswered) state = "answered";

            return (
              <li key={questionNumber} className="test-navigator__dot-item">
                <button
                  type="button"
                  className={`test-navigator__dot test-navigator__dot--${state}`}
                  aria-label={`Question ${i + 1}, ${state}`}
                  aria-current={isCurrent ? "true" : undefined}
                  onClick={() => onNavigate(i)}
                >
                  {i + 1}
                </button>
              </li>
            );
          },
        )}
      </ol>
    </section>
  );
}
