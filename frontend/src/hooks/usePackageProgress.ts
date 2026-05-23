import { useMemo } from "react";
import { readResults } from "./useTestResults";

export type PackageStatus = "incomplete" | "failed" | "completed";

export function usePackageProgress(packageIds: string[]): Map<string, PackageStatus> {
  return useMemo(() => {
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
  }, [packageIds]);
}
