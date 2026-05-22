import { Bookmark } from "lucide-react";
import type { Question } from "../schemas/package";
import "./QuestionCard.css";

interface QuestionCardProps {
  question: Question;
  questionIndex: number;
  questionCount: number;
  selectedAnswerId: string | null;
  isFlagged: boolean;
  onSelectAnswer: (answerId: string) => void;
  onToggleFlag: () => void;
}

export function QuestionCard({
  question,
  questionIndex,
  questionCount,
  selectedAnswerId,
  isFlagged,
  onSelectAnswer,
  onToggleFlag,
}: QuestionCardProps) {
  return (
    <section className="question-card" aria-label={`Question ${questionIndex + 1}`}>
      <button
        type="button"
        className={`question-card__flag${isFlagged ? " question-card__flag--active" : ""}`}
        aria-label="Flag question for review"
        aria-pressed={isFlagged}
        onClick={onToggleFlag}
      >
        <Bookmark size={18} aria-hidden="true" />
      </button>

      <fieldset className="question-card__fieldset">
        <legend className="question-card__legend">
          <span className="question-card__counter" aria-hidden="true">
            Question {questionIndex + 1} of {questionCount}
          </span>
          <span className="question-card__text">{question.text}</span>
        </legend>

        <ul className="question-card__answers" aria-label="Answer options">
          {question.answers.map((answer) => {
            const isSelected = selectedAnswerId === answer.id;
            return (
              <li key={answer.id} className="question-card__answer-item">
                <button
                  type="button"
                  className={`question-card__answer${isSelected ? " question-card__answer--selected" : ""}`}
                  aria-pressed={isSelected}
                  onClick={() => onSelectAnswer(answer.id)}
                >
                  {answer.text}
                </button>
              </li>
            );
          })}
        </ul>
      </fieldset>
    </section>
  );
}
