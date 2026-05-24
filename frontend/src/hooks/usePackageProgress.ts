import { useEffect, useMemo, useState } from "react";
import { fetchMyProgress } from "../services/api";
import { useAuth } from "./useAuth";
import { readResults } from "./useTestResults";

export type PackageStatus = "incomplete" | "failed" | "completed";

export function usePackageProgress(packageIds: string[]): Map<string, PackageStatus> {
  const { status, token } = useAuth();
  const [serverProgress, setServerProgress] = useState<Map<
    string,
    PackageStatus
  > | null>(null);

  useEffect(() => {
    if (status !== "authenticated" || !token) {
      setServerProgress(null);
      return;
    }

    let cancelled = false;

    void fetchMyProgress(token)
      .then((rows) => {
        if (cancelled) return;
        const next = new Map<string, PackageStatus>();
        for (const row of rows) {
          next.set(row.package_id, row.completed ? "completed" : "failed");
        }
        setServerProgress(next);
      })
      .catch(() => {
        if (cancelled) return;
        // Keep local status visible if server fetch fails.
        setServerProgress(null);
      });

    return () => {
      cancelled = true;
    };
  }, [status, token]);

  return useMemo(() => {
    if (status === "authenticated" && token && serverProgress !== null) {
      const map = new Map<string, PackageStatus>();
      for (const id of packageIds) {
        map.set(id, serverProgress.get(id) ?? "incomplete");
      }
      return map;
    }

    const map = new Map<string, PackageStatus>();
    for (const id of packageIds) {
      const results = readResults(id);
      const entries = Object.values(results);
      if (entries.length === 0) {
        map.set(id, "incomplete");
      } else if (entries.some((r) => r.passed)) {
        map.set(id, "completed");
      } else {
        map.set(id, "failed");
      }
    }
    return map;
  }, [packageIds, serverProgress, status, token]);
}
