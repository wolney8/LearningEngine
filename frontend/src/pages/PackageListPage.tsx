import { Flame } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { GuestLimitNotice } from "../components/GuestLimitNotice";
import { PackageCard } from "../components/PackageCard";
import { PackageFilterBar } from "../components/PackageFilterBar";
import type { FilterKey, FilterOption } from "../components/PackageFilterBar";
import { PackageSearchBar } from "../components/PackageSearchBar";
import { useAuth } from "../hooks/useAuth";
import { useCelebrationEffects } from "../hooks/useCelebrationEffects";
import { usePackageProgress } from "../hooks/usePackageProgress";
import { useSettings } from "../hooks/useSettings";
import { useStreak } from "../hooks/useStreak";
import { removeCachedProgressForPackage } from "../hooks/useTestResults";
import type { PackageSummary } from "../schemas/package";
import {
  ANONYMOUS_GUEST_PACKAGE_CAP,
  addToLibrary,
  clearAnonymousPackageProgress,
  fetchMyCatalogue,
  fetchMyLibrary,
  fetchPackages,
  getAnonymousGuestPackageCapStatus,
  markAnonymousGuestPackageEngaged,
  removeFromLibrary,
} from "../services/api";
import "./PackageListPage.css";

type PackageScope = "library" | "catalogue";
type CatalogueTagOption = {
  key: string;
  label: string;
  count: number;
};

const UNAVAILABLE_TAG_KEY = "unavailable";
const VISIBLE_TAG_CHIP_COUNT = 4;

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

function getDailyStreakTier(streak: number): string {
  if (streak >= 14) {
    return "storm";
  }
  if (streak >= 7) {
    return "surge";
  }
  if (streak >= 3) {
    return "flame";
  }
  return "warm";
}

export function PackageListPage() {
  const { status: authStatus, token } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const { dailyStreak } = useStreak();
  const { lightningEnabled } = useCelebrationEffects();
  const [packages, setPackages] = useState<PackageSummary[]>([]);
  const [libraryNotice, setLibraryNotice] = useState("");
  const [guestLimitMessage, setGuestLimitMessage] = useState("");
  const [status, setStatus] = useState<"loading" | "error" | "loaded">("loading");
  const [authenticatedScope, setAuthenticatedScope] = useState<PackageScope>("library");
  const [isOverflowMenuOpen, setOverflowMenuOpen] = useState(false);
  const overflowMenuRef = useRef<HTMLDivElement | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const isAuthenticated = authStatus === "authenticated" && Boolean(token);
  const spendEconomyEnabled = settings.spend_economy.enabled;
  const unlockCost = settings.spend_economy.costs.unlock_hidden_package ?? 250;
  const effectiveScope: PackageScope = isAuthenticated
    ? authenticatedScope
    : "catalogue";
  const isFullCatalogue = isAuthenticated && effectiveScope === "catalogue";

  const query = searchParams.get("q") ?? "";
  const activeFilter = parseFilter(searchParams.get("filter"));
  const activeTagParam = (searchParams.get("tag") ?? "").trim().toLowerCase();
  const streakTier = getDailyStreakTier(dailyStreak);

  const loadPackages = useCallback(async () => {
    setStatus("loading");
    try {
      const fetched = isAuthenticated
        ? effectiveScope === "library"
          ? await fetchMyLibrary(token as string)
          : await fetchMyCatalogue(token as string)
        : await fetchPackages();
      setPackages(fetched);
      setStatus("loaded");
    } catch {
      setStatus("error");
    }
  }, [effectiveScope, isAuthenticated, token]);

  useEffect(() => {
    if (!isAuthenticated) {
      setAuthenticatedScope("library");
    }
  }, [isAuthenticated]);

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

  const catalogueTagOptions = useMemo((): CatalogueTagOption[] => {
    const tagCounts = new Map<string, CatalogueTagOption>();

    for (const pkg of packages) {
      for (const rawTag of pkg.tags) {
        const normalised = rawTag.trim().toLowerCase();
        if (!normalised || normalised === UNAVAILABLE_TAG_KEY) {
          continue;
        }

        const existing = tagCounts.get(normalised);
        if (existing) {
          existing.count += 1;
          continue;
        }

        tagCounts.set(normalised, {
          key: normalised,
          label: rawTag.trim(),
          count: 1,
        });
      }
    }

    const sortedTags = Array.from(tagCounts.values()).sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: "base" }),
    );

    return [
      {
        key: UNAVAILABLE_TAG_KEY,
        label: "Unavailable",
        count: unavailablePackages.length,
      },
      ...sortedTags,
    ];
  }, [packages, unavailablePackages.length]);

  const activeCatalogueTag = useMemo(() => {
    if (!activeTagParam) {
      return "";
    }
    const isValid = catalogueTagOptions.some((tag) => tag.key === activeTagParam);
    return isValid ? activeTagParam : "";
  }, [activeTagParam, catalogueTagOptions]);

  const visibleTagOptions = useMemo(
    () => catalogueTagOptions.slice(0, VISIBLE_TAG_CHIP_COUNT),
    [catalogueTagOptions],
  );

  const overflowTagOptions = useMemo(
    () => catalogueTagOptions.slice(VISIBLE_TAG_CHIP_COUNT),
    [catalogueTagOptions],
  );

  const hasOverflowSelectedTag = useMemo(
    () => overflowTagOptions.some((tag) => tag.key === activeCatalogueTag),
    [overflowTagOptions, activeCatalogueTag],
  );

  const updateParams = useCallback(
    (updates: { q?: string; filter?: FilterKey; tag?: string }): void => {
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
          if ("tag" in updates) {
            const normalisedTag = (updates.tag ?? "").trim().toLowerCase();
            if (normalisedTag) {
              next.set("tag", normalisedTag);
            } else {
              next.delete("tag");
            }
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  useEffect(() => {
    if (!isFullCatalogue) {
      setOverflowMenuOpen(false);
    }
  }, [isFullCatalogue]);

  useEffect(() => {
    if (!isOverflowMenuOpen) {
      return;
    }

    function closeOnClickOutside(event: MouseEvent): void {
      if (!overflowMenuRef.current?.contains(event.target as Node)) {
        setOverflowMenuOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setOverflowMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", closeOnClickOutside);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("mousedown", closeOnClickOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOverflowMenuOpen]);

  const statusFilteredPackages = useMemo(() => {
    const includeUnavailableInAll = isAuthenticated && effectiveScope === "catalogue";

    if (activeFilter === "unavailable") {
      return unavailablePackages;
    }
    if (activeFilter === "all") {
      return includeUnavailableInAll
        ? [...availablePackages, ...unavailablePackages]
        : availablePackages;
    }
    return availablePackages.filter((pkg) => progressMap.get(pkg.id) === activeFilter);
  }, [
    activeFilter,
    availablePackages,
    unavailablePackages,
    progressMap,
    isAuthenticated,
    effectiveScope,
  ]);

  const catalogueTagFilteredPackages = useMemo(() => {
    if (!activeCatalogueTag) {
      return packages;
    }

    if (activeCatalogueTag === UNAVAILABLE_TAG_KEY) {
      return unavailablePackages;
    }

    return packages.filter((pkg) =>
      pkg.tags.some((tag) => tag.trim().toLowerCase() === activeCatalogueTag),
    );
  }, [activeCatalogueTag, packages, unavailablePackages]);

  const filterBasePackages = isFullCatalogue
    ? catalogueTagFilteredPackages
    : statusFilteredPackages;

  const filteredPackages = useMemo(() => {
    if (!query) return filterBasePackages;
    const q = query.toLowerCase();
    return filterBasePackages.filter(
      (pkg) =>
        pkg.title.toLowerCase().includes(q) ||
        pkg.description.toLowerCase().includes(q) ||
        pkg.tags.join(" ").toLowerCase().includes(q),
    );
  }, [filterBasePackages, query]);

  const filterCounts = useMemo(() => {
    const includeUnavailableInAll = isAuthenticated && effectiveScope === "catalogue";
    const counts: Record<FilterKey, number> = {
      all: includeUnavailableInAll
        ? availablePackages.length + unavailablePackages.length
        : availablePackages.length,
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
  }, [
    availablePackages,
    unavailablePackages,
    progressMap,
    isAuthenticated,
    effectiveScope,
  ]);

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

  const includeUnavailableInAll = isFullCatalogue;

  const countBase = isFullCatalogue
    ? packages
    : activeFilter === "unavailable"
      ? unavailablePackages
      : activeFilter === "all" && includeUnavailableInAll
        ? [...availablePackages, ...unavailablePackages]
        : availablePackages;
  const isFiltered = filteredPackages.length < countBase.length;

  const handlePackageStart = useCallback(
    (
      packageId: string,
      routePath: string,
      options?: { isReattempt?: boolean },
    ): void => {
      if (isAuthenticated) {
        navigate(routePath);
        return;
      }

      const capState = getAnonymousGuestPackageCapStatus(packageId);
      const isReattempt = options?.isReattempt === true;

      if (
        !capState.hasPackageEngagement &&
        capState.engagedCount >= ANONYMOUS_GUEST_PACKAGE_CAP
      ) {
        setGuestLimitMessage(
          `Guest mode allows ${ANONYMOUS_GUEST_PACKAGE_CAP} packages. Create an account to start more packages and keep your progress.`,
        );
        return;
      }

      if (
        isReattempt &&
        capState.hasPackageEngagement &&
        capState.engagedCount >= ANONYMOUS_GUEST_PACKAGE_CAP
      ) {
        setGuestLimitMessage(
          "You reached the guest package cap. Create an account to continue re-attempts and keep progress synced across devices.",
        );
        return;
      }

      markAnonymousGuestPackageEngaged(packageId);
      setGuestLimitMessage("");
      navigate(routePath);
    },
    [isAuthenticated, navigate],
  );

  const handlePackageUnlocked = useCallback((): void => {
    void loadPackages();
  }, [loadPackages]);

  function getEmptyMessage(): string {
    if (query) return `No packages match '${query}'`;
    if (isFullCatalogue && activeCatalogueTag === UNAVAILABLE_TAG_KEY) {
      return "No unavailable packages";
    }
    if (isFullCatalogue && activeCatalogueTag) {
      return `No packages tagged '${activeCatalogueTag}'`;
    }
    return `No ${activeFilter} packages yet`;
  }

  return (
    <main className="package-list-page">
      {isAuthenticated && (
        <div className="package-list-page__status-strip">
          {dailyStreak > 0 && (
            <p
              className={`package-list-page__streak package-list-page__streak--${streakTier} ${
                lightningEnabled ? "package-list-page__streak--animated" : ""
              }`}
              aria-label={`${dailyStreak} day streak`}
            >
              <span className="package-list-page__streak-sparks" aria-hidden="true" />
              <Flame
                className="package-list-page__streak-icon"
                aria-hidden="true"
                focusable="false"
                size={16}
              />
              <span className="package-list-page__streak-value">
                {dailyStreak} {dailyStreak === 1 ? "day" : "days"} streak
              </span>
            </p>
          )}
        </div>
      )}

      {isAuthenticated && (
        <div className="package-list-page__scope-toggle" aria-label="Package scope">
          <button
            type="button"
            className="package-list-page__scope-button"
            data-active={effectiveScope === "library"}
            aria-pressed={effectiveScope === "library"}
            onClick={() => setAuthenticatedScope("library")}
          >
            My Library
          </button>
          <button
            type="button"
            className="package-list-page__scope-button"
            data-active={effectiveScope === "catalogue"}
            aria-pressed={effectiveScope === "catalogue"}
            onClick={() => setAuthenticatedScope("catalogue")}
          >
            Full catalogue
          </button>
        </div>
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

      {status === "loaded" && packages.length === 0 && (
        <p>
          {isAuthenticated && effectiveScope === "library"
            ? "Your library is empty. Switch to Full catalogue to browse all courses."
            : "No packages available."}
        </p>
      )}

      {status === "loaded" && packages.length > 0 && (
        <>
          {libraryNotice && (
            <output className="package-list-page__notice" aria-live="polite">
              {libraryNotice}
            </output>
          )}

          {guestLimitMessage && <GuestLimitNotice message={guestLimitMessage} />}

          <div className="package-list-page__controls">
            <PackageSearchBar
              value={query}
              onChange={(v) => updateParams({ q: v })}
              onClear={() => updateParams({ q: "" })}
            />
            {isFullCatalogue ? (
              <div
                className="package-list-page__tag-filter-bar"
                aria-label="Filter packages by tag"
              >
                {visibleTagOptions.map(({ key, label }) => {
                  const isActive = activeCatalogueTag === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`package-list-page__tag-chip${isActive ? " package-list-page__tag-chip--active" : ""}`}
                      aria-pressed={isActive}
                      onClick={() => updateParams({ tag: isActive ? "" : key })}
                    >
                      {label}
                    </button>
                  );
                })}

                {overflowTagOptions.length > 0 && (
                  <div
                    className="package-list-page__tag-overflow"
                    ref={overflowMenuRef}
                  >
                    <button
                      type="button"
                      className={`package-list-page__tag-chip${hasOverflowSelectedTag ? " package-list-page__tag-chip--active" : ""}`}
                      aria-haspopup="menu"
                      aria-expanded={isOverflowMenuOpen}
                      onClick={() => {
                        if (hasOverflowSelectedTag) {
                          setOverflowMenuOpen(false);
                          updateParams({ tag: "" });
                          return;
                        }
                        setOverflowMenuOpen((previous) => !previous);
                      }}
                    >
                      {hasOverflowSelectedTag ? "x ..." : "..."}
                    </button>

                    {isOverflowMenuOpen && !hasOverflowSelectedTag && (
                      <ul
                        className="package-list-page__tag-menu"
                        role="menu"
                        aria-label="More package tags"
                      >
                        {overflowTagOptions.map(({ key, label }) => {
                          const isActive = activeCatalogueTag === key;
                          return (
                            <li key={key}>
                              <button
                                type="button"
                                role="menuitemradio"
                                aria-checked={isActive}
                                className="package-list-page__tag-menu-item"
                                onClick={() => {
                                  updateParams({ tag: key });
                                  setOverflowMenuOpen(false);
                                }}
                              >
                                {label}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <PackageFilterBar
                filters={filterOptions}
                activeFilter={activeFilter}
                onChange={(key) => updateParams({ filter: key })}
              />
            )}
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
              {filteredPackages.map((pkg) => {
                const packageStatus = progressMap.get(pkg.id) ?? "incomplete";
                const isReattempt = packageStatus !== "incomplete";

                return (
                  <PackageCard
                    key={pkg.id}
                    pkg={pkg}
                    variant={
                      isAuthenticated && effectiveScope === "catalogue"
                        ? "catalogue"
                        : "learning"
                    }
                    onAdd={
                      isAuthenticated && effectiveScope === "catalogue" && !pkg.selected
                        ? async () => {
                            setLibraryNotice("");
                            await addToLibrary(token as string, pkg.id);
                            await loadPackages();
                          }
                        : undefined
                    }
                    onRemove={
                      isAuthenticated &&
                      effectiveScope === "library" &&
                      pkg.availability !== "unavailable"
                        ? async () => {
                            const confirmed = window.confirm(
                              `Remove '${pkg.title}' from My Library? This will reset your progress for this package.`,
                            );
                            if (!confirmed) {
                              return;
                            }

                            await removeFromLibrary(token as string, pkg.id);
                            clearAnonymousPackageProgress(pkg.id);
                            removeCachedProgressForPackage(pkg.id);
                            setLibraryNotice(
                              `Removed '${pkg.title}' from My Library. Progress was reset.`,
                            );
                            await loadPackages();
                          }
                        : isAuthenticated &&
                            effectiveScope === "catalogue" &&
                            pkg.selected &&
                            pkg.availability !== "unavailable"
                          ? async () => {
                              setLibraryNotice("");
                              await removeFromLibrary(token as string, pkg.id);
                              clearAnonymousPackageProgress(pkg.id);
                              removeCachedProgressForPackage(pkg.id);
                              await loadPackages();
                            }
                          : undefined
                    }
                    onStartLearning={() =>
                      handlePackageStart(pkg.id, `/packages/${pkg.id}`, {
                        isReattempt,
                      })
                    }
                    onTakeTest={() =>
                      handlePackageStart(pkg.id, `/test/exam/${pkg.id}`, {
                        isReattempt,
                      })
                    }
                    spendEconomyEnabled={spendEconomyEnabled}
                    unlockCost={unlockCost}
                    onPackageUnlocked={handlePackageUnlocked}
                  />
                );
              })}
            </section>
          )}
        </>
      )}
    </main>
  );
}
