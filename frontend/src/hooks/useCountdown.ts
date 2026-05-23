import { useEffect, useRef, useState } from "react";

export function useCountdown(
  totalSeconds: number,
  active: boolean,
): { timeRemaining: number; isExpired: boolean } {
  const [timeRemaining, setTimeRemaining] = useState(totalSeconds);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setTimeRemaining(totalSeconds);
  }, [totalSeconds]);

  useEffect(() => {
    if (!active) return;

    if (intervalRef.current) clearInterval(intervalRef.current);
    if (totalSeconds <= 0) return;

    intervalRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [active, totalSeconds]);

  const isExpired = totalSeconds > 0 && timeRemaining <= 0;

  return { timeRemaining, isExpired };
}
