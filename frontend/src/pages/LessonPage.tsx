import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CompletionScreen } from "../components/CompletionScreen";
import { QuestionView } from "../components/QuestionView";
import { StudyPageView } from "../components/StudyPageView";
import { useStreak } from "../hooks/useStreak";
import { useXP } from "../hooks/useXP";
import type { Package } from "../schemas/package";
import { fetchPackage } from "../services/api";
import "./LessonPage.css";

// ---------------------------------------------------------------------------
// State machine types
// ---------------------------------------------------------------------------

type LessonPhase =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | {
      kind: "studying";
      pageIndex: number;
      visitedPageIds: Set<string>;
    }
  | {
      kind: "questions";
      questionIndex: number;
      correctCount: number;
      streak: number;
      xpEarned: number;
    }
  | {
      kind: "complete";
      correctCount: number;
      totalQuestions: number;
      xpEarned: number;
    };

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LessonPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { addXP } = useXP();
  const { markPractised } = useStreak();

  const [pkg, setPkg] = useState<Package | null>(null);
  const [phase, setPhase] = useState<LessonPhase>({ kind: "loading" });

  const loadPackage = useCallback(async () => {
    if (!id) {
      setPhase({ kind: "error", message: "No package ID in URL." });
      return;
    }
    setPhase({ kind: "loading" });
    try {
      const loaded = await fetchPackage(id);
      setPkg(loaded);
      setPhase({
        kind: "studying",
        pageIndex: 0,
        visitedPageIds: new Set([loaded.pages[0].id]),
      });
    } catch (err) {
      setPhase({
        kind: "error",
        message: err instanceof Error ? err.message : "Failed to load package.",
      });
    }
  }, [id]);

  useEffect(() => {
    void loadPackage();
  }, [loadPackage]);

  // -------------------------------------------------------------------------
  // Event handlers
  // -------------------------------------------------------------------------

  function handleNextPage(): void {
    if (!pkg || phase.kind !== "studying") return;

    const nextIndex = phase.pageIndex + 1;

    if (nextIndex >= pkg.pages.length) {
      // Finished reading - go to questions
      startQuestions();
      return;
    }

    setPhase({
      kind: "studying",
      pageIndex: nextIndex,
      visitedPageIds: new Set([...phase.visitedPageIds, pkg.pages[nextIndex].id]),
    });
  }

  function handleSkipToQuestions(): void {
    startQuestions();
  }

  function startQuestions(): void {
    setPhase({
      kind: "questions",
      questionIndex: 0,
      correctCount: 0,
      streak: 0,
      xpEarned: 0,
    });
  }

  function handleAnswer(_answerId: string, correct: boolean): void {
    if (!pkg || phase.kind !== "questions") return;

    const xpGain = correct ? 10 : 0;
    const newStreak = correct ? phase.streak + 1 : 0;
    const newCorrectCount = phase.correctCount + (correct ? 1 : 0);
    const newXP = phase.xpEarned + xpGain;
    const nextQIndex = phase.questionIndex + 1;

    if (nextQIndex >= pkg.questions.length) {
      // All questions done
      addXP(newXP);
      markPractised();
      setPhase({
        kind: "complete",
        correctCount: newCorrectCount,
        totalQuestions: pkg.questions.length,
        xpEarned: newXP,
      });
    } else {
      setPhase({
        kind: "questions",
        questionIndex: nextQIndex,
        correctCount: newCorrectCount,
        streak: newStreak,
        xpEarned: newXP,
      });
    }
  }

  function handleRetry(): void {
    if (!pkg) return;
    setPhase({
      kind: "studying",
      pageIndex: 0,
      visitedPageIds: new Set([pkg.pages[0].id]),
    });
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="lesson-page">
      <header className="lesson-page__header">
        <Link to="/" className="lesson-page__back-link">
          &larr; Back to packages
        </Link>
        {pkg && <h1 className="lesson-page__title">{pkg.title}</h1>}
      </header>

      <main className="lesson-page__content">
        {phase.kind === "loading" && (
          <p aria-live="polite" aria-busy="true">
            Loading lesson...
          </p>
        )}

        {phase.kind === "error" && (
          <div className="lesson-page__error">
            <p>{phase.message}</p>
            <Link to="/" className="lesson-page__back-link">
              Back to packages
            </Link>
          </div>
        )}

        {phase.kind === "studying" && pkg && (
          <StudyPageView
            page={pkg.pages[phase.pageIndex]}
            pageIndex={phase.pageIndex}
            pageCount={pkg.pages.length}
            allPagesVisited={phase.visitedPageIds.size >= pkg.pages.length}
            onNext={handleNextPage}
            onSkipToQuestions={handleSkipToQuestions}
          />
        )}

        {phase.kind === "questions" && pkg && (
          <QuestionView
            question={pkg.questions[phase.questionIndex]}
            questionIndex={phase.questionIndex}
            questionCount={pkg.questions.length}
            streak={phase.streak}
            onAnswer={handleAnswer}
          />
        )}

        {phase.kind === "complete" && (
          <CompletionScreen
            correctCount={phase.correctCount}
            totalQuestions={phase.totalQuestions}
            xpEarned={phase.xpEarned}
            onRetry={handleRetry}
            onBack={() => navigate("/")}
          />
        )}
      </main>
    </div>
  );
}
