import confetti from "canvas-confetti";
import { Flame, Zap } from "lucide-react";
import { useEffect, useRef } from "react";
import "./StreakBadge.css";

interface StreakBadgeProps {
  streak: number; // current in-lesson consecutive correct answers
}

function triggerConfetti(): void {
  // Suppressed when user prefers reduced motion
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }
  void confetti({
    particleCount: 80,
    spread: 60,
    origin: { y: 0.4 },
    colors: ["#4f46e5", "#6366f1", "#a5b4fc", "#fbbf24"],
  });
}

export function StreakBadge({ streak }: StreakBadgeProps) {
  const prevStreakRef = useRef<number>(streak);

  useEffect(() => {
    if (streak >= 5 && prevStreakRef.current < 5) {
      triggerConfetti();
    }
    prevStreakRef.current = streak;
  }, [streak]);

  if (streak < 2) return null;

  const isFlame = streak >= 3;
  const Icon = isFlame ? Flame : Zap;
  const label = `Streak: ${streak} correct in a row`;
  const modifier = isFlame ? "streak-badge--flame" : "streak-badge--zap";

  return (
    <div className={`streak-badge ${modifier}`} aria-label={label}>
      <Icon size={16} aria-hidden="true" />
      <span className="streak-badge__count">{streak}</span>
    </div>
  );
}
