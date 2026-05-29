import confetti from "canvas-confetti";
import { useEffect, useRef, useState } from "react";
import "./LevelUpOverlay.css";

interface LevelUpOverlayProps {
  isOpen: boolean;
  level: number;
  totalXP: number;
  onDismiss: () => void;
}

function readReducedMotionPreference(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function LevelUpOverlay({
  isOpen,
  level,
  totalXP,
  onDismiss,
}: LevelUpOverlayProps) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const [reducedMotion, setReducedMotion] = useState<boolean>(() =>
    typeof window !== "undefined" ? readReducedMotionPreference() : false,
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const listener = () => setReducedMotion(mediaQuery.matches);

    mediaQuery.addEventListener("change", listener);
    return () => {
      mediaQuery.removeEventListener("change", listener);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    closeButtonRef.current?.focus();

    if (!reducedMotion) {
      void confetti({
        particleCount: 140,
        spread: 72,
        origin: { y: 0.32 },
        colors: ["#4f46e5", "#6366f1", "#0ea5e9", "#fbbf24"],
      });
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onDismiss();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onDismiss, reducedMotion]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="level-up-overlay" data-testid="level-up-overlay">
      <div className="level-up-overlay__scrim" aria-hidden="true" />
      <dialog
        className="level-up-overlay__dialog"
        open
        aria-modal="true"
        aria-labelledby="level-up-title"
        aria-describedby="level-up-summary"
        data-motion={reducedMotion ? "reduced" : "full"}
      >
        <p className="level-up-overlay__eyebrow">Milestone reached</p>
        <h2 id="level-up-title">Level up! You reached Level {level}</h2>
        <p id="level-up-summary">
          You now have {totalXP} XP. Keep going to unlock the next level.
        </p>
        <button
          ref={closeButtonRef}
          type="button"
          className="level-up-overlay__cta"
          onClick={onDismiss}
        >
          Continue learning
        </button>
      </dialog>
    </div>
  );
}
