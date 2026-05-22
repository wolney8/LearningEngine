import "./ProgressBar.css";

interface ProgressBarProps {
  current: number; // 1-based
  total: number;
  label: string; // e.g. "Page 2 of 3" — used as aria-label and visible text
}

export function ProgressBar({ current, total, label }: ProgressBarProps) {
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div className="progress-bar-wrapper">
      <div
        className="progress-bar"
        role="progressbar"
        tabIndex={0}
        aria-valuenow={current}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label={label}
      >
        <div className="progress-bar__fill" style={{ width: `${percentage}%` }} />
      </div>
      <span className="progress-bar__label" aria-hidden="true">
        {label}
      </span>
    </div>
  );
}
