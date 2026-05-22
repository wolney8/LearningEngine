import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { QuestionCard } from "../components/QuestionCard";
import { TestNavigator } from "../components/TestNavigator";
import { TestResultsScreen } from "../components/TestResultsScreen";
import { useAttempts } from "../hooks/useAttempts";
import { useCountdown } from "../hooks/useCountdown";
import { useFirstCompletion } from "../hooks/useFirstCompletion";
import { useStreak } from "../hooks/useStreak";
import { useXP } from "../hooks/useXP";
import type { Package, Question } from "../schemas/package";
import { fetchPackage } from "../services/api";
import {
  DIFFICULTY_LABEL,
  DIFFICULTY_XP_MULTIPLIER,
  type Difficulty,
  SECONDS_PER_QUESTION,
} from "../types/difficulty";
import { shuffleArray } from "../utils/randomise";
import "./TestModePage.css";

type LoadingPhase = { kind: "loading" };
type ErrorPhase = { kind: "error"; message: string };
type DifficultySelectPhase = { kind: "difficulty-select"; pkg: Package };
type InProgressPhase = {
  kind: "in-progress";
  pkg: Package;
  shuffledQuestions: Question[];
  currentIndex: number;
  answers: Record<string, string | null>;
  flagged: Set<string>;
  difficulty: Difficulty;
  totalSeconds: number;
};
type CompletePhase = {
  kind: "complete";
  pkg: Package;
  shuffledQuestions: Question[];
  answers: Record<string, string | null>;
  difficulty: Difficulty;
  weightScore: number;
  passed: boolean;
  xpEarned: number;
  attemptNumber: number;
  wasFirstCompletion: boolean;
  timedOut: boolean;
};

type TestPhase =
  | LoadingPhase
  | ErrorPhase
  | DifficultySelectPhase
  | InProgressPhase
  | CompletePhase;

export function TestModePage() {
  const [phase, setPhase] = useState<TestPhase>({ kind: "loading" });

  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { attemptNumber, recordAttempt } = useAttempts(`test_${id}`);
  const { isFirstCompletion, markCompleted } = useFirstCompletion(`test_${id}`);
  const { addXP } = useXP();
  const { markPractised } = useStreak();

  const inProgress = phase.kind === "in-progress" ? phase : null;
  const { timeRemaining } = useCountdown(
    inProgress?.totalSeconds ?? 0,
    phase.kind === "in-progress",
  );
  const countdownArmedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setPhase({ kind: "loading" });

    fetchPackage(id)
      .then((pkg) => {
        if (!cancelled) {
          setPhase({ kind: "difficulty-select", pkg });
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (
          err instanceof Error &&
          (err.message.includes("404") ||
            err.message.toLowerCase().includes("not found"))
        ) {
          navigate("/");
          return;
        }
        setPhase({ kind: "error", message: "Failed to load package." });
      });

    return () => {
      cancelled = true;
    };
  }, [id, navigate]);

  const handleStartExam = useCallback(
    (difficulty: Difficulty): void => {
      if (phase.kind !== "difficulty-select") return;

      const pkg = phase.pkg;
      const shuffled = shuffleArray(pkg.questions).map((q) => ({
        ...q,
        answers: shuffleArray(q.answers),
      }));
      const totalSeconds = SECONDS_PER_QUESTION[difficulty] * shuffled.length;

      setPhase({
        kind: "in-progress",
        pkg,
        shuffledQuestions: shuffled,
        currentIndex: 0,
        answers: {},
        flagged: new Set(),
        difficulty,
        totalSeconds,
      });
    },
    [phase],
  );

  const handleSubmit = useCallback(
    (timedOut: boolean): void => {
      if (phase.kind !== "in-progress") return;

      const { shuffledQuestions, answers, difficulty, pkg } = phase;
      const weightScore = shuffledQuestions.reduce(
        (sum, q) =>
          answers[q.id] === q.correct_answer ? sum + q.weight * 100 : sum,
        0,
      );
      const passed = weightScore >= pkg.passing_score * 100;

      const attemptMults: Record<number, number> = { 1: 1.0, 2: 0.5, 3: 0.25 };
      const diffMult = DIFFICULTY_XP_MULTIPLIER[difficulty];
      const mult = (attemptMults[attemptNumber] ?? 0) * diffMult;
      let earned = Math.round(weightScore * mult);
      const wasFirst = isFirstCompletion;

      recordAttempt();
      if (wasFirst) {
        markCompleted();
        earned += 20;
      }

      addXP(earned);
      markPractised();

      setPhase({
        kind: "complete",
        pkg,
        shuffledQuestions,
        answers,
        difficulty,
        weightScore,
        passed,
        xpEarned: earned,
        attemptNumber,
        wasFirstCompletion: wasFirst,
        timedOut,
      });
    },
    [
      addXP,
      attemptNumber,
      isFirstCompletion,
      markCompleted,
      markPractised,
      phase,
      recordAttempt,
    ],
  );

  useEffect(() => {
    if (phase.kind !== "in-progress") {
      countdownArmedRef.current = false;
      return;
    }

    if (timeRemaining > 0) {
      countdownArmedRef.current = true;
      return;
    }

    if (timeRemaining === 0 && countdownArmedRef.current) {
      handleSubmit(true);
    }
  }, [handleSubmit, phase.kind, timeRemaining]);

  if (phase.kind === "loading") {
    return (
      <main className="test-mode-page" aria-busy="true" aria-live="polite">
        <p>Loading test mode...</p>
      </main>
    );
  }

  if (phase.kind === "error") {
    return (
      <main className="test-mode-page">
        <p>{phase.message}</p>
        <button type="button" onClick={() => navigate("/")}>
          Back to packages
        </button>
      </main>
    );
  }

  if (phase.kind === "difficulty-select") {
    const { pkg } = phase;

    return (
      <main className="test-mode-page">
        <header className="test-mode-page__header">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="test-mode-page__back"
          >
            ← Back to packages
          </button>
          <h1>{pkg.title}</h1>
          <p>Choose your difficulty to begin the timed exam.</p>
        </header>

        <div className="test-mode-page__difficulty-grid">
          {(["easy", "normal", "hard", "expert"] as Difficulty[]).map((d) => (
            <button
              key={d}
              type="button"
              className={`test-mode-page__difficulty-card test-mode-page__difficulty-card--${d}`}
              onClick={() => handleStartExam(d)}
            >
              <span className="test-mode-page__difficulty-label">
                {DIFFICULTY_LABEL[d]}
              </span>
              <span className="test-mode-page__difficulty-timer">
                {SECONDS_PER_QUESTION[d]}s per question
              </span>
              <span className="test-mode-page__difficulty-xp">
                ×{DIFFICULTY_XP_MULTIPLIER[d]} XP
              </span>
            </button>
          ))}
        </div>
      </main>
    );
  }

  if (phase.kind === "in-progress") {
    const currentQuestion = phase.shuffledQuestions[phase.currentIndex];
    const selectedAnswerId = phase.answers[currentQuestion.id] ?? null;

    const answeredIndexes = new Set<number>();
    phase.shuffledQuestions.forEach((question, index) => {
      if (phase.answers[question.id]) {
        answeredIndexes.add(index);
      }
    });

    const flaggedIndexes = new Set<number>();
    phase.shuffledQuestions.forEach((question, index) => {
      if (phase.flagged.has(question.id)) {
        flaggedIndexes.add(index);
      }
    });

    const unansweredCount =
      phase.shuffledQuestions.length - answeredIndexes.size;

    return (
      <main className="test-mode-page">
        <header className="test-mode-page__header test-mode-page__header--compact">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="test-mode-page__back"
          >
            ← Back to packages
          </button>
          <h1>{phase.pkg.title}</h1>
        </header>

        <TestNavigator
          questionCount={phase.shuffledQuestions.length}
          currentIndex={phase.currentIndex}
          answeredIndexes={answeredIndexes}
          flaggedIndexes={flaggedIndexes}
          timeRemaining={timeRemaining}
          onNavigate={(index) =>
            setPhase((prev) =>
              prev.kind === "in-progress"
                ? { ...prev, currentIndex: index }
                : prev,
            )
          }
        />

        <QuestionCard
          question={currentQuestion}
          questionIndex={phase.currentIndex}
          questionCount={phase.shuffledQuestions.length}
          selectedAnswerId={selectedAnswerId}
          isFlagged={phase.flagged.has(currentQuestion.id)}
          onSelectAnswer={(answerId) =>
            setPhase((prev) =>
              prev.kind === "in-progress"
                ? {
                    ...prev,
                    answers: {
                      ...prev.answers,
                      [currentQuestion.id]: answerId,
                    },
                  }
                : prev,
            )
          }
          onToggleFlag={() =>
            setPhase((prev) => {
              if (prev.kind !== "in-progress") return prev;
              const nextFlagged = new Set(prev.flagged);
              if (nextFlagged.has(currentQuestion.id)) {
                nextFlagged.delete(currentQuestion.id);
              } else {
                nextFlagged.add(currentQuestion.id);
              }
              return { ...prev, flagged: nextFlagged };
            })
          }
        />

        <footer className="test-mode-page__actions">
          <button
            type="button"
            onClick={() =>
              setPhase((prev) =>
                prev.kind === "in-progress"
                  ? {
                      ...prev,
                      currentIndex: Math.max(0, prev.currentIndex - 1),
                    }
                  : prev,
              )
            }
            disabled={phase.currentIndex === 0}
          >
            Previous
          </button>

          <button
            type="button"
            onClick={() =>
              setPhase((prev) =>
                prev.kind === "in-progress"
                  ? {
                      ...prev,
                      currentIndex: Math.min(
                        prev.shuffledQuestions.length - 1,
                        prev.currentIndex + 1,
                      ),
                    }
                  : prev,
              )
            }
            disabled={phase.currentIndex >= phase.shuffledQuestions.length - 1}
          >
            Next
          </button>

          <button type="button" onClick={() => handleSubmit(false)}>
            Submit
          </button>

          {unansweredCount > 0 && (
            <span className="test-mode-page__unanswered">
              ({unansweredCount} unanswered)
            </span>
          )}
        </footer>
      </main>
    );
  }

  return (
    <main className="test-mode-page">
      <header className="test-mode-page__header test-mode-page__header--compact">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="test-mode-page__back"
        >
          ← Back to packages
        </button>
        <h1>{phase.pkg.title}</h1>
      </header>

      <TestResultsScreen
        questions={phase.shuffledQuestions}
        answers={phase.answers}
        weightScore={phase.weightScore}
        passed={phase.passed}
        passingScore={phase.pkg.passing_score}
        difficulty={phase.difficulty}
        xpEarned={phase.xpEarned}
        attemptNumber={phase.attemptNumber}
        isFirstCompletion={phase.wasFirstCompletion}
        timedOut={phase.timedOut}
        onRetry={() => setPhase({ kind: "difficulty-select", pkg: phase.pkg })}
        onBack={() => navigate("/")}
      />
    </main>
  );
}
