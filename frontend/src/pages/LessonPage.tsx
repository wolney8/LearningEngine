import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { CompletionScreen } from "../components/CompletionScreen";
import { GuestLimitNotice } from "../components/GuestLimitNotice";
import { QuestionView } from "../components/QuestionView";
import { StudyPageView } from "../components/StudyPageView";
import { useAttempts } from "../hooks/useAttempts";
import { useAuth } from "../hooks/useAuth";
import { useCelebrationEffects } from "../hooks/useCelebrationEffects";
import { useFirstCompletion } from "../hooks/useFirstCompletion";
import { useSettings } from "../hooks/useSettings";
import { useStreak } from "../hooks/useStreak";
import { useTestResults } from "../hooks/useTestResults";
import { useXP } from "../hooks/useXP";
import type { Package } from "../schemas/package";
import {
  ANONYMOUS_GUEST_PACKAGE_CAP,
  fetchPackage,
  getAnonymousGuestPackageCapStatus,
  markAnonymousGuestPackageEngaged,
} from "../services/api";
import "./LessonPage.css";

// ---------------------------------------------------------------------------
// State machine types
// ---------------------------------------------------------------------------

type LessonPhase =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "guest-limit"; message: string }
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
      attemptNumber: number;
      wasFirstCompletion: boolean;
    };

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LessonPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { addXP } = useXP();
  const { markPractised } = useStreak();
  const { triggerConfetti } = useCelebrationEffects();
  const { attemptNumber, recordAttempt } = useAttempts(id ?? "");
  const { isFirstCompletion, markCompleted } = useFirstCompletion(id ?? "");
  const { status } = useAuth();
  const { saveResult, progressMetadata } = useTestResults(id ?? "");
  const { settings } = useSettings();

  const isAuthenticated = status === "authenticated";
  const activeAttemptNumber = isAuthenticated
    ? (progressMetadata?.attemptCount ?? 0) + 1
    : attemptNumber;
  const activeIsFirstCompletion = isAuthenticated
    ? progressMetadata?.firstCompletedAt == null
    : isFirstCompletion;

  const [pkg, setPkg] = useState<Package | null>(null);
  const [phase, setPhase] = useState<LessonPhase>({ kind: "loading" });

  const showGuestLimit = useCallback((message: string): void => {
    setPhase({ kind: "guest-limit", message });
  }, []);

  const loadPackage = useCallback(async () => {
    if (!id) {
      setPhase({ kind: "error", message: "No package ID in URL." });
      return;
    }

    if (!isAuthenticated) {
      const capState = getAnonymousGuestPackageCapStatus(id);
      if (
        !capState.hasPackageEngagement &&
        capState.engagedCount >= ANONYMOUS_GUEST_PACKAGE_CAP
      ) {
        showGuestLimit(
          `Guest mode allows only ${ANONYMOUS_GUEST_PACKAGE_CAP} packages. Create an account to start additional packages and save progress.`,
        );
        return;
      }

      markAnonymousGuestPackageEngaged(id);
    }

    setPhase({ kind: "loading" });
    try {
      const loaded = await fetchPackage(id);
      const reviseQueryValues = searchParams
        .getAll("revise")
        .map((pageId) => pageId.trim())
        .filter((pageId) => pageId.length > 0);

      const revisePageIds =
        reviseQueryValues.length === 1 &&
        !loaded.pages.some((page) => page.id === reviseQueryValues[0])
          ? reviseQueryValues[0]
              .split(",")
              .map((pageId) => pageId.trim())
              .filter((pageId) => pageId.length > 0)
          : reviseQueryValues;

      const revisePageIdSet = new Set(revisePageIds);
      const reviseStartIndex = loaded.pages.findIndex((page) =>
        revisePageIdSet.has(page.id),
      );
      const startPageIndex = reviseStartIndex >= 0 ? reviseStartIndex : 0;

      setPkg(loaded);
      setPhase({
        kind: "studying",
        pageIndex: startPageIndex,
        visitedPageIds: new Set([loaded.pages[startPageIndex].id]),
      });
    } catch (err) {
      setPhase({
        kind: "error",
        message: err instanceof Error ? err.message : "Failed to load package.",
      });
    }
  }, [id, isAuthenticated, searchParams, showGuestLimit]);

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

  function handlePreviousPage(): void {
    if (!pkg || phase.kind !== "studying") return;

    const previousIndex = Math.max(0, phase.pageIndex - 1);
    if (previousIndex === phase.pageIndex) {
      return;
    }

    setPhase({
      kind: "studying",
      pageIndex: previousIndex,
      visitedPageIds: new Set(phase.visitedPageIds),
    });
  }

  function handleSkipToQuestions(): void {
    startQuestions();
  }

  function startQuestions(): void {
    if (!id || isAuthenticated) {
      setPhase({
        kind: "questions",
        questionIndex: 0,
        correctCount: 0,
        streak: 0,
        xpEarned: 0,
      });
      return;
    }

    const capState = getAnonymousGuestPackageCapStatus(id);
    if (
      !activeIsFirstCompletion &&
      capState.hasPackageEngagement &&
      capState.engagedCount >= ANONYMOUS_GUEST_PACKAGE_CAP
    ) {
      showGuestLimit(
        "You reached the guest package cap. Create an account to continue re-attempts and keep your progress.",
      );
      return;
    }

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

    const newStreak = correct ? phase.streak + 1 : 0;
    const newCorrectCount = phase.correctCount + (correct ? 1 : 0);
    const nextQIndex = phase.questionIndex + 1;

    if (nextQIndex >= pkg.questions.length) {
      // All questions done
      const currentAttemptNumber = activeAttemptNumber;
      const wasFirstCompletion = activeIsFirstCompletion;
      const multiplier =
        settings.xp.attempt_multipliers[
          String(currentAttemptNumber) as "1" | "2" | "3"
        ] ?? 0;
      const baseXP = newCorrectCount * settings.xp.lesson_base_xp_per_correct;
      let earned = Math.round(baseXP * multiplier);

      if (isAuthenticated) {
        if (wasFirstCompletion) {
          earned += settings.xp.first_completion_bonus;
        }
      } else {
        recordAttempt();
        if (wasFirstCompletion) {
          markCompleted();
          earned += settings.xp.first_completion_bonus;
        }
      }

      addXP(earned);
      markPractised();

      if (isAuthenticated) {
        saveResult(
          "normal",
          {
            passed: true,
            bestScore: Math.round((newCorrectCount / pkg.questions.length) * 100),
            bestXpEarned: earned,
            lastAttemptedAt: new Date().toISOString(),
          },
          { attemptCount: currentAttemptNumber },
        );
      }

      setPhase({
        kind: "complete",
        correctCount: newCorrectCount,
        totalQuestions: pkg.questions.length,
        xpEarned: earned,
        attemptNumber: currentAttemptNumber,
        wasFirstCompletion,
      });

      triggerConfetti("pass");
    } else {
      setPhase({
        kind: "questions",
        questionIndex: nextQIndex,
        correctCount: newCorrectCount,
        streak: newStreak,
        xpEarned: phase.xpEarned,
      });
    }
  }

  function handleRetry(): void {
    if (!pkg) return;

    if (!isAuthenticated && id) {
      const capState = getAnonymousGuestPackageCapStatus(id);
      if (
        capState.hasPackageEngagement &&
        capState.engagedCount >= ANONYMOUS_GUEST_PACKAGE_CAP
      ) {
        showGuestLimit(
          "You reached the guest package cap. Create an account to continue re-attempting packages.",
        );
        return;
      }
    }

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
        {(phase.kind === "studying" || phase.kind === "questions") &&
          activeAttemptNumber > 1 && (
            <div className="lesson-page__reduced-xp-notice" aria-live="polite">
              Reduced XP this attempt
            </div>
          )}

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

        {phase.kind === "guest-limit" && (
          <div className="lesson-page__guest-limit">
            <GuestLimitNotice message={phase.message} />
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
            onPrevious={handlePreviousPage}
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
            attemptNumber={phase.attemptNumber}
            isFirstCompletion={phase.wasFirstCompletion}
            firstCompletionBonus={settings.xp.first_completion_bonus}
            attemptMultipliers={settings.xp.attempt_multipliers}
            onRetry={handleRetry}
            onBack={() => navigate("/")}
          />
        )}
      </main>
    </div>
  );
}
