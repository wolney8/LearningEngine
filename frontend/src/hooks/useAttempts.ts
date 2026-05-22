import { useState } from "react";

interface AttemptRecord {
  count: number;
  date: string;
}

function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export function useAttempts(packageId: string): {
  attemptNumber: number;
  recordAttempt: () => void;
} {
  const key = `lle_attempt_${packageId}`;

  function readRecord(): AttemptRecord {
    const today = getToday();
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return { count: 0, date: today };
      const parsed = JSON.parse(raw) as AttemptRecord;
      if (parsed.date !== today) return { count: 0, date: today };
      return parsed;
    } catch {
      return { count: 0, date: today };
    }
  }

  const [record, setRecord] = useState<AttemptRecord>(readRecord);

  function recordAttempt(): void {
    const today = getToday();
    const nextRecord =
      record.date === today
        ? { count: record.count + 1, date: today }
        : { count: 1, date: today };

    try {
      localStorage.setItem(key, JSON.stringify(nextRecord));
    } catch {
      // private browsing / quota exceeded - no-op
    }
    setRecord(nextRecord);
  }

  return { attemptNumber: record.count + 1, recordAttempt };
}
