import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { PackageCard } from "../components/PackageCard";
import { PackageFilterBar } from "../components/PackageFilterBar";
import type { FilterKey, FilterOption } from "../components/PackageFilterBar";
import { PackageSearchBar } from "../components/PackageSearchBar";
import { useAuth } from "../hooks/useAuth";
import { usePackageProgress } from "../hooks/usePackageProgress";
import { useStreak } from "../hooks/useStreak";
import type { PackageSummary } from "../schemas/package";
import { fetchPackages } from "../services/api";
import "./PackageListPage.css";

const VALID_FILTERS: FilterKey[] = [
  "all",
  "incomplete",
  "failed",
  "completed",
  "unavailable",
];

function parseFilter(value: string | null): FilterKey {
  if (value && (VALID_FILTERS as string[]).includes(value)) {
    return value as FilterKey;
  }
  return "all";
}

export function PackageListPage() {
  const { status: authStatus, user, logout } = useAuth();
  const { dailyStreak } = useStreak();
  const [packages, setPackages] = useState<PackageSummary[]>([]);
  const [status, setStatus] = useState<"loading" | "error" | "loaded">("loading");
  const [searchParams, setSearchParams] = useSearchParams();

  const query = searchParams.get("q") ?? "";
  const activeFilter = parseFilter(searchParams.get("filter"));

  const loadPackages = useCallback(async () => {
    setStatus("loading");
    try {
      const fetched = await fetchPackages();
      setPackages(fetched);
      setStatus("loaded");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void loadPackages();
  }, [loadPackages]);

  const packageIds = useMemo(() => packages.map((p) => p.id), [packages]);
  const progressMap = usePackageProgress(packageIds);

  const availablePackages = useMemo(
    () => packages.filter((pkg) => pkg.availability === "available"),
    [packages],
  );

  const unavailablePackages = useMemo(
    () => packages.filter((pkg) => pkg.availability === "unavailable"),
    [packages],
  );

  const updateParams = useCallback(
    (updates: { q?: string; filter?: FilterKey }): void => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if ("q" in updates) {
            if (updates.q) {
              next.set("q", updates.q);
            } else {
              next.delete("q");
            }
          }
          if ("filter" in updates) {
            if (updates.filter && updates.filter !== "all") {
              next.set("filter", updates.filter);
            } else {
              next.delete("filter");
            }
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const statusFilteredPackages = useMemo(() => {
    if (activeFilter === "unavailable") {
      return unavailablePackages;
    }
    if (activeFilter === "all") {
      return availablePackages;
    }
    return availablePackages.filter((pkg) => progressMap.get(pkg.id) === activeFilter);
  }, [activeFilter, availablePackages, unavailablePackages, progressMap]);

  const filteredPackages = useMemo(() => {
    if (!query) return statusFilteredPackages;
    const q = query.toLowerCase();
    return statusFilteredPackages.filter(
      (pkg) =>
        pkg.title.toLowerCase().includes(q) ||
        pkg.description.toLowerCase().includes(q) ||
        pkg.tags.join(" ").toLowerCase().includes(q),
    );
  }, [statusFilteredPackages, query]);

  const filterCounts = useMemo(() => {
    const counts: Record<FilterKey, number> = {
      all: availablePackages.length,
      incomplete: 0,
      failed: 0,
      completed: 0,
      unavailable: unavailablePackages.length,
    };
    for (const pkg of availablePackages) {
      const s = progressMap.get(pkg.id) ?? "incomplete";
      counts[s]++;
    }
    return counts;
  }, [availablePackages, unavailablePackages, progressMap]);

  const filterOptions: FilterOption[] = [
    { key: "all", label: "All", count: filterCounts.all },
    { key: "incomplete", label: "Incomplete", count: filterCounts.incomplete },
    { key: "failed", label: "Failed", count: filterCounts.failed },
    { key: "completed", label: "Completed", count: filterCounts.completed },
    {
      key: "unavailable",
      label: "Unavailable",
      count: filterCounts.unavailable,
    },
  ];

  const countBase =
    activeFilter === "unavailable" ? unavailablePackages : availablePackages;
  const isFiltered = filteredPackages.length < countBase.length;

  function getEmptyMessage(): string {
    if (query) return `No packages match '${query}'`;
    return `No ${activeFilter} packages yet`;
  }

  return (
    <main className="package-list-page">
      <h1>Local Learning Engine</h1>
      <p className="package-list-page__subtitle">Pick a package to start learning</p>
      {authStatus === "authenticated" && user ? (
        <p className="package-list-page__auth-links" aria-live="polite">
          <span className="package-list-page__auth-user">
            Signed in as {user.username}
          </span>
          <button
            type="button"
            className="package-list-page__auth-action"
            onClick={logout}
            aria-label="Sign out"
          >
            Sign out
          </button>
        </p>
      ) : (
        <p className="package-list-page__auth-links">
          <Link to="/login">Sign in</Link>
          <span aria-hidden="true">|</span>
          <Link to="/register">Create account</Link>
        </p>
      )}
      {dailyStreak > 0 && (
        <p
          className="package-list-page__streak"
          aria-label={`${dailyStreak} day streak`}
        >
          🔥 {dailyStreak} {dailyStreak === 1 ? "day" : "days"} streak
        </p>
      )}

      {status === "loading" && (
        <p aria-live="polite" aria-busy="true">
          Loading packages…
        </p>
      )}

      {status === "error" && (
        <>
          <p>Could not load packages. Make sure the backend is running.</p>
          <button type="button" onClick={() => void loadPackages()}>
            Retry
          </button>
        </>
      )}

      {status === "loaded" && packages.length === 0 && <p>No packages available.</p>}

      {status === "loaded" && packages.length > 0 && (
        <>
          <div className="package-list-page__controls">
            <PackageSearchBar
              value={query}
              onChange={(v) => updateParams({ q: v })}
              onClear={() => updateParams({ q: "" })}
            />
            <PackageFilterBar
              filters={filterOptions}
              activeFilter={activeFilter}
              onChange={(key) => updateParams({ filter: key })}
            />
          </div>

          {isFiltered && (
            <p className="package-list-page__count" aria-live="polite">
              Showing {filteredPackages.length} of {countBase.length} packages
            </p>
          )}

          {filteredPackages.length === 0 ? (
            <p className="package-list-page__empty">{getEmptyMessage()}</p>
          ) : (
            <section
              className="package-list-page__grid"
              aria-label="Available packages"
            >
              {filteredPackages.map((pkg) => (
                <PackageCard key={pkg.id} pkg={pkg} />
              ))}
            </section>
          )}
        </>
      )}
    </main>
  );
}
