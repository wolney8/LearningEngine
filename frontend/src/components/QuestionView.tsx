import type { Question } from "../schemas/package";
import { FeedbackPanel } from "./FeedbackPanel";
import { ProgressBar } from "./ProgressBar";
import { StreakBadge } from "./StreakBadge";
import "./QuestionView.css";

interface QuestionViewProps {
  question: Question;
  questionIndex: number; // 0-based
  questionCount: number;
  correctCount: number;
  streak: number;
  selectedAnswerId: string | null;
  submitted: boolean;
  onAnswer: (answerId: string, correct: boolean) => void;
  onNext: () => void;
}

export function QuestionView({
  question,
  questionIndex,
  questionCount,
  correctCount,
  streak,
  selectedAnswerId,
  submitted,
  onAnswer,
  onNext,
}: QuestionViewProps) {
  const current = questionIndex + 1;
  const label = `Question ${current} of ${questionCount}`;

  function handleSelect(answerId: string): void {
    if (submitted) return; // Guard against double-submission
    onAnswer(answerId, answerId === question.correct_answer);
  }

  const isCorrect = submitted && selectedAnswerId === question.correct_answer;

  return (
    <section className="question-view" aria-label={`Question ${current}`}>
      <div className="question-view__top-bar">
        <ProgressBar current={current} total={questionCount} label={label} />
        <p className="question-view__score" aria-live="polite">
          {correctCount} / {questionCount} correct
        </p>
        <StreakBadge streak={streak} />
      </div>

      <fieldset className="question-view__fieldset" disabled={submitted}>
        <legend className="question-view__question-text">{question.text}</legend>

        <ul className="question-view__answers">
          {question.answers.map((answer) => {
            const isSelected = selectedAnswerId === answer.id;
            const isThisCorrect = submitted && answer.id === question.correct_answer;
            const isThisWrong = submitted && isSelected && !isThisCorrect;

            let modifier = "";
            if (submitted && isThisCorrect) {
              modifier = "question-view__answer--correct";
            } else if (isThisWrong) {
              modifier = "question-view__answer--incorrect";
            } else if (isSelected && !submitted) {
              modifier = "question-view__answer--selected";
            }

            return (
              <li key={answer.id}>
                <button
                  type="button"
                  className={`question-view__answer ${modifier}`}
                  onClick={() => handleSelect(answer.id)}
                  aria-disabled={submitted}
                  aria-pressed={isSelected}
                >
                  {answer.text}
                  {submitted && isThisCorrect && (
                    <span className="question-view__sr-only"> - correct answer</span>
                  )}
                  {isThisWrong && (
                    <span className="question-view__sr-only">
                      {" "}
                      - your answer (incorrect)
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </fieldset>

      {submitted && (
        <FeedbackPanel
          correct={isCorrect}
          feedbackText={question.feedback}
          onNext={onNext}
        />
      )}
    </section>
  );
}
