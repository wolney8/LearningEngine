import { useCallback, useEffect, useRef, useState } from "react";
import { useBlocker, useNavigate, useParams } from "react-router-dom";
import { GuestLimitNotice } from "../components/GuestLimitNotice";
import { QuestionCard } from "../components/QuestionCard";
import { SpendConfirmModal } from "../components/SpendConfirmModal";
import { TestNavigator } from "../components/TestNavigator";
import { TestResultsScreen } from "../components/TestResultsScreen";
import { useAttempts } from "../hooks/useAttempts";
import { useAuth } from "../hooks/useAuth";
import { useCelebrationEffects } from "../hooks/useCelebrationEffects";
import { useCountdown } from "../hooks/useCountdown";
import { useFirstCompletion } from "../hooks/useFirstCompletion";
import { useSettings } from "../hooks/useSettings";
import { useStreak } from "../hooks/useStreak";
import { useTestResults } from "../hooks/useTestResults";
import { useXP } from "../hooks/useXP";
import { useXPSpend } from "../hooks/useXPSpend";
import type { Package, Question } from "../schemas/package";
import type { UnlockedDifficulties } from "../schemas/xpSpend";
import {
  ANONYMOUS_GUEST_PACKAGE_CAP,
  fetchPackage,
  fetchUnlockedDifficulties,
  getAnonymousGuestPackageCapStatus,
  markAnonymousGuestPackageEngaged,
} from "../services/api";
import { DIFFICULTY_LABEL, type Difficulty } from "../types/difficulty";
import { shuffleArray } from "../utils/randomise";
import "./TestModePage.css";

type LoadingPhase = { kind: "loading" };
type ErrorPhase = { kind: "error"; message: string };
type GuestLimitPhase = { kind: "guest-limit"; message: string };
type DifficultySelectPhase = { kind: "difficulty-select"; pkg: Package };
type HardExpertWarningPhase = {
  kind: "hard-expert-warning";
  pkg: Package;
  difficulty: Difficulty;
};
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
  | GuestLimitPhase
  | DifficultySelectPhase
  | HardExpertWarningPhase
  | InProgressPhase
  | CompletePhase;

export function TestModePage() {
  const [phase, setPhase] = useState<TestPhase>({ kind: "loading" });
  const [submitWarning, setSubmitWarning] = useState<
    "zero-answer" | "few-answer" | null
  >(null);
  const [unlockedDifficulties, setUnlockedDifficulties] =
    useState<UnlockedDifficulties>({
      hard: false,
      expert: false,
    });
  const [pendingSpendDifficulty, setPendingSpendDifficulty] = useState<
    "hard" | "expert" | null
  >(null);

  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { attemptNumber, recordAttempt } = useAttempts(`test_${id}`);
  const { isFirstCompletion, markCompleted } = useFirstCompletion(`test_${id}`);
  const { addXP, subtractXP, xp } = useXP();
  const { markPractised } = useStreak();
  const { triggerConfetti } = useCelebrationEffects();
  const { status, token } = useAuth();
  const { saveResult, progressMetadata } = useTestResults(id);
  const { settings } = useSettings();
  const { spend, loading: spendLoading, error: spendError, reset } = useXPSpend();

  const isAuthenticated = status === "authenticated";
  const spendEconomyEnabled = settings.spend_economy?.enabled ?? false;
  const spendCosts = settings.spend_economy?.costs;
  const difficultyUnlockCost = spendCosts?.increase_difficulty_cap ?? 0;
  const activeAttemptNumber = isAuthenticated
    ? (progressMetadata?.attemptCount ?? 0) + 1
    : attemptNumber;
  const activeIsFirstCompletion = isAuthenticated
    ? progressMetadata?.firstCompletedAt == null
    : isFirstCompletion;

  const inProgress = phase.kind === "in-progress" ? phase : null;
  const { timeRemaining } = useCountdown(
    inProgress?.totalSeconds ?? 0,
    phase.kind === "in-progress",
  );
  const countdownArmedRef = useRef(false);
  const exitPenaltyAppliedRef = useRef(false);

  const showGuestLimit = useCallback((message: string): void => {
    setPhase({ kind: "guest-limit", message });
  }, []);

  const refreshUnlockedDifficulties = useCallback(
    async (packageId: string): Promise<UnlockedDifficulties> => {
      if (!spendEconomyEnabled || !token || !packageId) {
        const empty = { hard: false, expert: false };
        setUnlockedDifficulties(empty);
        return empty;
      }

      const nextUnlocked = await fetchUnlockedDifficulties(token, packageId);
      setUnlockedDifficulties(nextUnlocked);
      return nextUnlocked;
    },
    [spendEconomyEnabled, token],
  );

  const applyExitPenalty = useCallback((): void => {
    if (exitPenaltyAppliedRef.current) return;
    exitPenaltyAppliedRef.current = true;
    subtractXP(settings.xp.hard_expert_exit_penalty);
    recordAttempt();
  }, [recordAttempt, settings.xp.hard_expert_exit_penalty, subtractXP]);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      phase.kind === "in-progress" &&
      (phase.difficulty === "hard" || phase.difficulty === "expert") &&
      currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (phase.kind !== "difficulty-select") {
      setPendingSpendDifficulty(null);
      reset();
      return;
    }

    if (!spendEconomyEnabled || !token || !phase.pkg.id) {
      setUnlockedDifficulties({ hard: false, expert: false });
      return;
    }

    let cancelled = false;

    refreshUnlockedDifficulties(phase.pkg.id)
      .then((nextUnlocked) => {
        if (!cancelled) {
          setUnlockedDifficulties(nextUnlocked);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUnlockedDifficulties({ hard: false, expert: false });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [phase, refreshUnlockedDifficulties, reset, spendEconomyEnabled, token]);

  useEffect(() => {
    let cancelled = false;

    if (!isAuthenticated && id) {
      const capState = getAnonymousGuestPackageCapStatus(id);
      if (
        !capState.hasPackageEngagement &&
        capState.engagedCount >= ANONYMOUS_GUEST_PACKAGE_CAP
      ) {
        showGuestLimit(
          `Guest mode allows only ${ANONYMOUS_GUEST_PACKAGE_CAP} packages. Create an account to start additional test tracks and save progress.`,
        );
        return;
      }

      markAnonymousGuestPackageEngaged(id);
    }

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
  }, [id, isAuthenticated, navigate, showGuestLimit]);

  const startExam = useCallback(
    (pkg: Package, difficulty: Difficulty): void => {
      const isTaggedPackage = pkg.questions.some((q) => q.difficulty != null);

      let pool: typeof pkg.questions;
      if (isTaggedPackage) {
        const filtered = pkg.questions.filter((q) => q.difficulty === difficulty);
        if (filtered.length === 0) {
          console.warn(
            `[TestModePage] No questions tagged "${difficulty}" in package "${pkg.id}". Falling back to full question set.`,
          );
          pool = pkg.questions;
        } else {
          pool = filtered;
        }
      } else {
        pool = pkg.questions;
      }

      const shuffled = shuffleArray(pool).map((q) => ({
        ...q,
        answers: shuffleArray(q.answers),
      }));
      const totalSeconds =
        settings.difficulty.seconds_per_question[difficulty] * shuffled.length;

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
    [settings.difficulty.seconds_per_question],
  );

  const handleSelectDifficulty = useCallback(
    (difficulty: Difficulty): void => {
      if (phase.kind !== "difficulty-select") return;

      if (!isAuthenticated) {
        const capState = getAnonymousGuestPackageCapStatus(id);
        if (
          activeAttemptNumber > 1 &&
          capState.hasPackageEngagement &&
          capState.engagedCount >= ANONYMOUS_GUEST_PACKAGE_CAP
        ) {
          showGuestLimit(
            "You reached the guest package cap. Create an account to continue re-attempts in test mode.",
          );
          return;
        }
      }

      if (difficulty === "hard" || difficulty === "expert") {
        setPhase({ kind: "hard-expert-warning", pkg: phase.pkg, difficulty });
        return;
      }

      startExam(phase.pkg, difficulty);
    },
    [activeAttemptNumber, id, isAuthenticated, phase, showGuestLimit, startExam],
  );

  const handleSubmit = useCallback(
    (
      timedOut: boolean,
      options?: { bypassWarning?: boolean; applyFewAnswerPenalty?: boolean },
    ): void => {
      if (phase.kind !== "in-progress") return;

      const { shuffledQuestions, answers, difficulty, pkg } = phase;
      const answeredCount = Object.keys(answers).filter(
        (questionId) =>
          answers[questionId] !== null && answers[questionId] !== undefined,
      ).length;

      if (!options?.bypassWarning) {
        if (answeredCount === 0) {
          setSubmitWarning("zero-answer");
          return;
        }

        if ((difficulty === "hard" || difficulty === "expert") && answeredCount <= 1) {
          setSubmitWarning("few-answer");
          return;
        }
      }

      setSubmitWarning(null);

      if (options?.applyFewAnswerPenalty) {
        subtractXP(settings.xp.hard_expert_low_answer_penalty);
      }

      const weightScore = shuffledQuestions.reduce(
        (sum, q) => (answers[q.id] === q.correct_answer ? sum + q.weight : sum),
        0,
      );
      const totalPossibleWeight = shuffledQuestions.reduce((s, q) => s + q.weight, 0);
      const correctCount = shuffledQuestions.filter(
        (q) => answers[q.id] === q.correct_answer,
      ).length;
      const passed =
        totalPossibleWeight > 0
          ? weightScore / totalPossibleWeight >= phase.pkg.passing_score
          : false;
      const minimumAnswerGateApplies =
        correctCount < settings.xp.min_correct_for_xp[difficulty];

      const attemptMult =
        settings.xp.attempt_multipliers[
          String(activeAttemptNumber) as "1" | "2" | "3"
        ] ?? 0;
      const diffMult = settings.difficulty.xp_multiplier[difficulty];
      const mult = attemptMult * diffMult;
      let earned = minimumAnswerGateApplies ? 0 : Math.round(weightScore * mult);
      const wasFirst = activeIsFirstCompletion;
      const awardFirstCompletionBonus = wasFirst && !minimumAnswerGateApplies;

      if (isAuthenticated) {
        if (awardFirstCompletionBonus) {
          earned += settings.xp.first_completion_bonus;
        }
      } else {
        recordAttempt();
        if (awardFirstCompletionBonus) {
          markCompleted();
          earned += settings.xp.first_completion_bonus;
        }
      }

      if (!minimumAnswerGateApplies) {
        addXP(earned);
      }
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
        attemptNumber: activeAttemptNumber,
        wasFirstCompletion: awardFirstCompletionBonus,
        timedOut,
      });

      if (passed) {
        triggerConfetti("pass");
      }

      const scorePercent =
        totalPossibleWeight > 0
          ? Math.round((weightScore / totalPossibleWeight) * 100)
          : 0;

      saveResult(
        difficulty,
        {
          passed,
          bestScore: scorePercent,
          bestXpEarned: earned,
          lastAttemptedAt: new Date().toISOString(),
        },
        {
          attemptCount: isAuthenticated ? activeAttemptNumber : undefined,
        },
      );
    },
    [
      addXP,
      activeAttemptNumber,
      activeIsFirstCompletion,
      isAuthenticated,
      markCompleted,
      markPractised,
      phase,
      recordAttempt,
      saveResult,
      settings.difficulty.xp_multiplier,
      settings.xp.attempt_multipliers,
      settings.xp.first_completion_bonus,
      settings.xp.hard_expert_low_answer_penalty,
      settings.xp.min_correct_for_xp,
      subtractXP,
      triggerConfetti,
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
      handleSubmit(true, { bypassWarning: true });
    }
  }, [handleSubmit, phase.kind, timeRemaining]);

  useEffect(() => {
    if (phase.kind !== "in-progress") {
      exitPenaltyAppliedRef.current = false;
      return;
    }

    if (phase.difficulty !== "hard" && phase.difficulty !== "expert") {
      exitPenaltyAppliedRef.current = false;
    }
  }, [phase]);

  useEffect(() => {
    if (
      blocker.state !== "blocked" ||
      phase.kind !== "in-progress" ||
      (phase.difficulty !== "hard" && phase.difficulty !== "expert")
    ) {
      return;
    }

    applyExitPenalty();
    blocker.proceed();
  }, [applyExitPenalty, blocker, phase]);

  useEffect(() => {
    if (
      phase.kind !== "in-progress" ||
      (phase.difficulty !== "hard" && phase.difficulty !== "expert")
    ) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      applyExitPenalty();
      event.preventDefault();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [applyExitPenalty, phase]);

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

  if (phase.kind === "guest-limit") {
    return (
      <main className="test-mode-page">
        <GuestLimitNotice message={phase.message} />
        <button type="button" onClick={() => navigate("/")}>
          Back to packages
        </button>
      </main>
    );
  }

  if (phase.kind === "difficulty-select") {
    const { pkg } = phase;
    const showDifficultySpendHint = spendEconomyEnabled && isAuthenticated;
    const isLockedDifficulty = (
      difficulty: Difficulty,
    ): difficulty is "hard" | "expert" =>
      spendEconomyEnabled &&
      isAuthenticated &&
      (difficulty === "hard" || difficulty === "expert") &&
      !unlockedDifficulties[difficulty];

    const handleDifficultyCardClick = (difficulty: Difficulty): void => {
      if (isLockedDifficulty(difficulty)) {
        setPendingSpendDifficulty(difficulty);
        reset();
        return;
      }

      handleSelectDifficulty(difficulty);
    };

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
          {showDifficultySpendHint && (
            <section className="test-mode-page__spend-callout" aria-live="polite">
              <h2>Unlock Hard and Expert tests with XP.</h2>
            </section>
          )}
        </header>

        <div className="test-mode-page__difficulty-grid">
          {(["easy", "normal", "hard", "expert"] as Difficulty[]).map((d) => (
            // Hard/expert can require XP spend in authenticated mode when spend economy is enabled.
            <button
              key={d}
              type="button"
              className={`test-mode-page__difficulty-card test-mode-page__difficulty-card--${d}`}
              onClick={() => handleDifficultyCardClick(d)}
            >
              <span className="test-mode-page__difficulty-label">
                {DIFFICULTY_LABEL[d]}
              </span>
              <span className="test-mode-page__difficulty-timer">
                {settings.difficulty.seconds_per_question[d]}s per question
              </span>
              <span className="test-mode-page__difficulty-xp">
                ×{settings.difficulty.xp_multiplier[d]} XP
              </span>

              {isLockedDifficulty(d) && (
                <span className="test-mode-page__difficulty-xp" aria-live="polite">
                  🔒 {difficultyUnlockCost} XP to unlock
                </span>
              )}
            </button>
          ))}
        </div>

        <SpendConfirmModal
          open={pendingSpendDifficulty !== null}
          actionLabel={`Unlock ${pendingSpendDifficulty === "hard" ? "Hard" : "Expert"} difficulty`}
          cost={difficultyUnlockCost}
          currentXP={xp}
          onConfirm={async () => {
            if (!pendingSpendDifficulty) {
              return;
            }

            try {
              const unlockedDifficulty = pendingSpendDifficulty;
              await spend("difficulty_unlock", pkg.id, unlockedDifficulty);
              setUnlockedDifficulties((prev) => ({
                ...prev,
                [unlockedDifficulty]: true,
              }));
              await refreshUnlockedDifficulties(pkg.id).catch(() => undefined);
              setPendingSpendDifficulty(null);
              reset();
              handleSelectDifficulty(unlockedDifficulty);
            } catch (err) {
              if (
                err instanceof Error &&
                err.message === "This difficulty is already unlocked."
              ) {
                const unlockedDifficulty = pendingSpendDifficulty;
                setUnlockedDifficulties((prev) => ({
                  ...prev,
                  [unlockedDifficulty]: true,
                }));
                await refreshUnlockedDifficulties(pkg.id).catch(() => undefined);
                setPendingSpendDifficulty(null);
                reset();
                handleSelectDifficulty(unlockedDifficulty);
              }
              // useXPSpend already stores the error; keep modal open for user feedback.
            }
          }}
          onCancel={() => {
            setPendingSpendDifficulty(null);
            reset();
          }}
          loading={spendLoading}
          error={spendError}
        />
      </main>
    );
  }

  if (phase.kind === "hard-expert-warning") {
    const { pkg, difficulty } = phase;

    return (
      <main className="test-mode-page">
        <header className="test-mode-page__header">
          <button
            type="button"
            onClick={() => setPhase({ kind: "difficulty-select", pkg })}
            className="test-mode-page__back"
          >
            ← Back to difficulties
          </button>
          <h1>{pkg.title}</h1>
        </header>

        <section className="test-mode-page__warning-callout" aria-live="polite">
          <h2>⚠ {DIFFICULTY_LABEL[difficulty]} Mode</h2>
          <p>
            If you leave or cancel this exam mid-way, you will automatically fail and
            lose {settings.xp.hard_expert_exit_penalty} XP.
          </p>
          <div className="test-mode-page__warning-actions">
            <button
              type="button"
              className="test-mode-page__btn test-mode-page__btn--finish"
              onClick={() => startExam(pkg, difficulty)}
            >
              Confirm — Start Exam
            </button>
            <button
              type="button"
              className="test-mode-page__btn"
              onClick={() => setPhase({ kind: "difficulty-select", pkg })}
            >
              Choose a different difficulty
            </button>
          </div>
        </section>
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

    const unansweredCount = phase.shuffledQuestions.length - answeredIndexes.size;
    const isLastQuestion = phase.currentIndex === phase.shuffledQuestions.length - 1;

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
              prev.kind === "in-progress" ? { ...prev, currentIndex: index } : prev,
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
            className="test-mode-page__btn"
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

          {isLastQuestion ? (
            <button
              className="test-mode-page__btn test-mode-page__btn--finish"
              type="button"
              onClick={() => handleSubmit(false)}
            >
              Finish
            </button>
          ) : (
            <button
              className="test-mode-page__btn"
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
          )}

          {submitWarning && (
            <div className="test-mode-page__submit-warning" role="alert">
              <p>
                {submitWarning === "zero-answer"
                  ? "You haven't answered any questions — are you sure you want to submit?"
                  : `You've answered very few questions. Submitting will deduct ${settings.xp.hard_expert_low_answer_penalty} XP. Continue?`}
              </p>
              <div className="test-mode-page__submit-warning-actions">
                <button
                  type="button"
                  className="test-mode-page__btn test-mode-page__btn--finish"
                  onClick={() => {
                    const warningKind = submitWarning;
                    setSubmitWarning(null);
                    handleSubmit(false, {
                      bypassWarning: true,
                      applyFewAnswerPenalty: warningKind === "few-answer",
                    });
                  }}
                >
                  {submitWarning === "few-answer" ? "Continue" : "Submit anyway"}
                </button>
                <button
                  type="button"
                  className="test-mode-page__btn"
                  onClick={() => setSubmitWarning(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

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
        difficultyMultiplier={settings.difficulty.xp_multiplier[phase.difficulty]}
        xpEarned={phase.xpEarned}
        attemptNumber={phase.attemptNumber}
        isFirstCompletion={phase.wasFirstCompletion}
        firstCompletionBonus={settings.xp.first_completion_bonus}
        timedOut={phase.timedOut}
        onRetry={() => {
          if (!isAuthenticated) {
            const capState = getAnonymousGuestPackageCapStatus(id);
            if (
              capState.hasPackageEngagement &&
              capState.engagedCount >= ANONYMOUS_GUEST_PACKAGE_CAP
            ) {
              showGuestLimit(
                "You reached the guest package cap. Create an account to continue re-attempts in test mode.",
              );
              return;
            }
          }

          setPhase({ kind: "difficulty-select", pkg: phase.pkg });
        }}
        onBack={() => navigate("/")}
        onRevise={(revisionPageIds) => {
          const cleanedRevisionPageIds = revisionPageIds
            .map((pageId) => pageId.trim())
            .filter((pageId) => pageId.length > 0);

          if (cleanedRevisionPageIds.length === 0) {
            navigate(`/packages/${id}`);
            return;
          }

          const reviseParams = new URLSearchParams();
          for (const pageId of cleanedRevisionPageIds) {
            reviseParams.append("revise", pageId);
          }
          navigate(`/packages/${id}?${reviseParams.toString()}`);
        }}
      />
    </main>
  );
}
