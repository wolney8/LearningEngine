import { CheckCircle, XCircle } from "lucide-react";
import "./FeedbackPanel.css";

interface FeedbackPanelProps {
  correct: boolean;
  feedbackText: string;
  onNext: () => void;
}

export function FeedbackPanel({ correct, feedbackText, onNext }: FeedbackPanelProps) {
  return (
    <div
      className={`feedback-panel ${correct ? "feedback-panel--correct" : "feedback-panel--incorrect"}`}
      aria-live="polite"
    >
      <div className="feedback-panel__header">
        {correct ? (
          <CheckCircle className="feedback-panel__icon" aria-hidden="true" size={20} />
        ) : (
          <XCircle className="feedback-panel__icon" aria-hidden="true" size={20} />
        )}
        <span className="feedback-panel__result">
          {correct ? "Correct!" : "Incorrect"}
        </span>
      </div>
      <p className="feedback-panel__text">{feedbackText}</p>
      <button type="button" className="feedback-panel__next-btn" onClick={onNext}>
        Next
      </button>
    </div>
  );
}
