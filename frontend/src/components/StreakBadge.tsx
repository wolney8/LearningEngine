import { Flame, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useCelebrationEffects } from "../hooks/useCelebrationEffects";
import "./StreakBadge.css";

interface StreakBadgeProps {
  streak: number; // current in-lesson consecutive correct answers
}

const STREAK_MILESTONE = 3;
const LIGHTNING_DURATION_MS = 640;

export function StreakBadge({ streak }: StreakBadgeProps) {
  const prevStreakRef = useRef<number>(streak);
  const [isLightningActive, setLightningActive] = useState(false);
  const { lightningEnabled } = useCelebrationEffects();

  useEffect(() => {
    const hitMilestone =
      streak >= STREAK_MILESTONE &&
      streak % STREAK_MILESTONE === 0 &&
      prevStreakRef.current !== streak;

    if (lightningEnabled && hitMilestone) {
      setLightningActive(true);
      const timeoutId = window.setTimeout(() => {
        setLightningActive(false);
      }, LIGHTNING_DURATION_MS);

      prevStreakRef.current = streak;
      return () => {
        window.clearTimeout(timeoutId);
      };
    }

    prevStreakRef.current = streak;
  }, [lightningEnabled, streak]);

  if (streak < 2) return null;

  const isFlame = streak >= 3;
  const Icon = isFlame ? Flame : Zap;
  const label = `Streak: ${streak} correct in a row`;
  const modifier = isFlame ? "streak-badge--flame" : "streak-badge--zap";

  return (
    <div
      className={`streak-badge ${modifier} ${isLightningActive ? "streak-badge--lightning" : ""}`}
      aria-label={label}
    >
      <span className="streak-badge__lightning" aria-hidden="true" />
      <span className="streak-badge__sparks" aria-hidden="true" />
      <Icon size={16} aria-hidden="true" />
      <span className="streak-badge__count">{streak}</span>
    </div>
  );
}
