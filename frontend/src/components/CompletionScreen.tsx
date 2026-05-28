import { useEffect, useRef } from "react";
import "./CompletionScreen.css";

interface CompletionScreenProps {
  correctCount: number;
  totalQuestions: number;
  xpEarned: number;
  attemptNumber?: number;
  isFirstCompletion?: boolean;
  firstCompletionBonus: number;
  attemptMultipliers: { "1": number; "2": number; "3": number };
  onRetry: () => void;
  onBack: () => void;
}

export function CompletionScreen({
  correctCount,
  totalQuestions,
  xpEarned,
  attemptNumber,
  isFirstCompletion,
  firstCompletionBonus,
  attemptMultipliers,
  onRetry,
  onBack,
}: CompletionScreenProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Move focus to heading on mount for WCAG 2.4.3
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const percentage =
    totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

  const message =
    percentage === 100
      ? "Perfect score! Outstanding work."
      : percentage >= 80
        ? "Great effort! Almost perfect."
        : percentage >= 50
          ? "Good start — keep practising!"
          : "Don't give up — every attempt helps.";

  return (
    <section className="completion-screen" aria-label="Lesson complete">
      <h2 className="completion-screen__heading" ref={headingRef} tabIndex={-1}>
        Lesson complete!
      </h2>

      <p className="completion-screen__score">
        {correctCount} / {totalQuestions} correct
      </p>

      <p className="completion-screen__message">{message}</p>

      {xpEarned > 0 && (
        <p className="completion-screen__xp">+{xpEarned} XP earned</p>
      )}

      {isFirstCompletion && (
        <span
          className="completion-screen__badge completion-screen__badge--first"
          aria-label={`First completion bonus, ${firstCompletionBonus} extra experience points`}
        >
          +{firstCompletionBonus} XP bonus
        </span>
      )}

      {(attemptNumber ?? 1) === 2 && (
        <span
          className="completion-screen__badge completion-screen__badge--reduced"
          aria-label={`Reduced experience points, multiplier ${attemptMultipliers["2"]}`}
        >
          Reduced XP (×{attemptMultipliers["2"]})
        </span>
      )}

      {(attemptNumber ?? 1) === 3 && (
        <span
          className="completion-screen__badge completion-screen__badge--reduced"
          aria-label={`Reduced experience points, multiplier ${attemptMultipliers["3"]}`}
        >
          Reduced XP (×{attemptMultipliers["3"]})
        </span>
      )}

      {(attemptNumber ?? 1) >= 4 && (
        <>
          <span
            className="completion-screen__badge completion-screen__badge--reduced"
            aria-label="Zero experience points earned, practice mode"
          >
            0 XP (Practice Mode)
          </span>
          <p className="completion-screen__xp-note">
            Practice makes perfect! Full XP returns tomorrow.
          </p>
        </>
      )}

      <div className="completion-screen__actions">
        <button
          type="button"
          className="completion-screen__btn completion-screen__btn--primary"
          onClick={onRetry}
        >
          Try again
        </button>
        <button
          type="button"
          className="completion-screen__btn completion-screen__btn--ghost"
          onClick={onBack}
        >
          Back to packages
        </button>
      </div>
    </section>
  );
}
