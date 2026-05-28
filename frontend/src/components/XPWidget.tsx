import type { LevelProgress } from "../utils/levelProgress";
import "./XPWidget.css";

interface XPWidgetProps {
  xp: number;
  levelProgress: LevelProgress;
}

export function XPWidget({ xp, levelProgress }: XPWidgetProps) {
  const progressPercent = Math.round(levelProgress.progressRatio * 100);

  return (
    <aside
      className="xp-widget"
      data-testid="xp-widget"
      aria-label={`Level ${levelProgress.level}, ${xp} total XP, ${levelProgress.remainingXP} XP to next level`}
    >
      <p className="xp-widget__level">Level {levelProgress.level}</p>
      <p className="xp-widget__total">{xp} XP total</p>
      <div
        className="xp-widget__progress"
        role="progressbar"
        tabIndex={0}
        aria-label={`Level progress: ${progressPercent}%`}
        aria-valuemin={levelProgress.currentLevelThreshold}
        aria-valuemax={levelProgress.nextLevelThreshold}
        aria-valuenow={xp}
        data-testid="xp-progress-bar"
      >
        <span
          className="xp-widget__progress-fill"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
      <p className="xp-widget__remaining">
        {levelProgress.remainingXP} XP to next level
      </p>
    </aside>
  );
}
