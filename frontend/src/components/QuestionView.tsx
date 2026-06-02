import { useState } from "react";
import type { Question } from "../schemas/package";
import { FeedbackPanel } from "./FeedbackPanel";
import { ProgressBar } from "./ProgressBar";
import { StreakBadge } from "./StreakBadge";
import "./QuestionView.css";

interface QuestionViewProps {
  question: Question;
  questionIndex: number; // 0-based
  questionCount: number;
  streak: number;
  onAnswer: (answerId: string, correct: boolean) => void;
}

export function QuestionView({
  question,
  questionIndex,
  questionCount,
  streak,
  onAnswer,
}: QuestionViewProps) {
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const current = questionIndex + 1;
  const label = `Question ${current} of ${questionCount}`;

  function handleSelect(answerId: string): void {
    if (submitted) return; // Guard against double-submission
    setSelectedAnswer(answerId);
    setSubmitted(true);
  }

  function handleNext(): void {
    if (selectedAnswer === null) return;
    onAnswer(selectedAnswer, selectedAnswer === question.correct_answer);
    // Reset local state for next question
    setSelectedAnswer(null);
    setSubmitted(false);
  }

  const isCorrect = submitted && selectedAnswer === question.correct_answer;

  return (
    <section className="question-view" aria-label={`Question ${current}`}>
      <div className="question-view__top-bar">
        <ProgressBar current={current} total={questionCount} label={label} />
        <StreakBadge streak={streak} />
      </div>

      <fieldset className="question-view__fieldset" disabled={submitted}>
        <legend className="question-view__question-text">
          {question.text}
        </legend>

        <ul className="question-view__answers">
          {question.answers.map((answer) => {
            const isSelected = selectedAnswer === answer.id;
            const isThisCorrect =
              submitted && answer.id === question.correct_answer;
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
                    <span className="question-view__sr-only">
                      {" "}
                      - correct answer
                    </span>
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
          onNext={handleNext}
        />
      )}
    </section>
  );
}
