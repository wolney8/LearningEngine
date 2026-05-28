import { CheckCircle, XCircle } from "lucide-react";
import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import type { Question } from "../schemas/package";
import type { Difficulty } from "../types/difficulty";
import { DIFFICULTY_LABEL } from "../types/difficulty";
import "./TestResultsScreen.css";

interface TestResultsScreenProps {
  questions: Question[];
  answers: Record<string, string | null>;
  weightScore: number;
  passed: boolean;
  passingScore: number;
  difficulty: Difficulty;
  difficultyMultiplier: number;
  xpEarned: number;
  attemptNumber: number;
  isFirstCompletion: boolean;
  firstCompletionBonus: number;
  timedOut: boolean;
  onRetry: () => void;
  onBack: () => void;
}

function getAnswerText(question: Question, answerId: string | null): string {
  if (!answerId) return "No answer selected";
  const matched = question.answers.find((a) => a.id === answerId);
  return matched?.text ?? "Unknown answer";
}

export function TestResultsScreen({
  questions,
  answers,
  passed,
  passingScore,
  difficulty,
  difficultyMultiplier,
  xpEarned,
  attemptNumber,
  isFirstCompletion,
  firstCompletionBonus,
  timedOut,
  onRetry,
  onBack,
}: TestResultsScreenProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const correctCount = questions.filter(
    (q) => answers[q.id] === q.correct_answer,
  ).length;
  const roundedScore =
    questions.length === 0
      ? 0
      : Math.min(Math.round((correctCount / questions.length) * 100), 100);
  const scoreStyle = { "--score": `${roundedScore}%` } as CSSProperties;

  return (
    <section className="test-results" aria-label="Test results">
      <h2 tabIndex={-1} ref={headingRef}>
        {timedOut ? "Time's Up!" : "Test Complete"}
      </h2>

      <div
        className="test-results__arc"
        role="img"
        aria-label={`Score: ${roundedScore}%`}
        style={scoreStyle}
      >
        <span className="test-results__score">{roundedScore}%</span>
      </div>

      <p
        className={`test-results__status ${passed ? "test-results__status--pass" : "test-results__status--fail"}`}
      >
        {passed ? (
          <>
            <CheckCircle size={18} aria-hidden="true" /> Passed
          </>
        ) : (
          <>
            <XCircle size={18} aria-hidden="true" /> Failed
          </>
        )}
      </p>

      <p className="test-results__passing">
        Passing score: {Math.round(passingScore * 100)}%
      </p>

      {timedOut && (
        <output className="test-results__timeout" aria-live="polite">
          Time&apos;s up - exam auto-submitted
        </output>
      )}

      <div className="test-results__badges">
        <span className="test-results__badge">
          {DIFFICULTY_LABEL[difficulty]} x{difficultyMultiplier} XP
        </span>

        {xpEarned > 0 && (
          <span className="test-results__badge test-results__badge--xp">
            +{xpEarned} XP
          </span>
        )}

        {isFirstCompletion && (
          <span className="test-results__badge test-results__badge--xp">
            +{firstCompletionBonus} XP bonus
          </span>
        )}

        {attemptNumber >= 4 && (
          <>
            <span className="test-results__badge test-results__badge--muted">
              0 XP (Practice Mode)
            </span>
            <p className="test-results__note">
              <em>Practice makes perfect! Full XP returns tomorrow.</em>
            </p>
          </>
        )}
      </div>

      <details className="test-results__review">
        <summary>
          Review answers ({correctCount} / {questions.length} correct)
        </summary>
        <ul>
          {questions.map((question, index) => {
            const selected = answers[question.id] ?? null;
            const isCorrect = selected === question.correct_answer;
            const selectedText = getAnswerText(question, selected);
            const correctText = getAnswerText(question, question.correct_answer);

            return (
              <li key={question.id} className="test-results__review-item">
                <p className="test-results__review-question">
                  {index + 1}. {question.text}
                </p>
                <p
                  className={
                    isCorrect
                      ? "test-results__review-answer test-results__review-answer--correct"
                      : "test-results__review-answer test-results__review-answer--wrong"
                  }
                >
                  {isCorrect ? "✓" : "✗"} Your answer: {selectedText}
                </p>
                {!isCorrect && (
                  <p className="test-results__review-correct">
                    Correct answer: {correctText}
                  </p>
                )}
                {/* TODO Phase 7: link to revision pages */}
              </li>
            );
          })}
        </ul>
      </details>

      <div className="test-results__actions">
        <button type="button" onClick={onRetry}>
          Try again
        </button>
        <button type="button" onClick={onBack}>
          Back to packages
        </button>
      </div>
    </section>
  );
}
