import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { useTestResults } from "../hooks/useTestResults";
import type { PackageSummary } from "../schemas/package";
import { PackageProgressPanel } from "./PackageProgressPanel";
import "./PackageCard.css";

interface PackageCardProps {
  pkg: PackageSummary;
  variant?: "learning" | "catalogue";
  onAdd?: () => Promise<void>;
  onRemove?: () => Promise<void>;
}

export function PackageCard({
  pkg,
  variant = "learning",
  onAdd,
  onRemove,
}: PackageCardProps) {
  const navigate = useNavigate();
  const { results } = useTestResults(pkg.id);
  const passingScorePercent = Math.round(pkg.passing_score * 100);
  const isUnavailable = pkg.availability === "unavailable";
  const isLearningCard = variant === "learning";
  const isCatalogueCard = variant === "catalogue";
  const isActionEnabled = pkg.availability === "available";
  const [libraryPending, setLibraryPending] = useState(false);
  const [libraryError, setLibraryError] = useState("");

  async function handleLibraryAction(action: () => Promise<void>) {
    setLibraryError("");
    setLibraryPending(true);
    try {
      await action();
    } catch {
      setLibraryError("Could not update your library. Please try again.");
    } finally {
      setLibraryPending(false);
    }
  }

  return (
    <article
      className={`package-card ${isUnavailable ? "package-card--unavailable" : ""} ${isCatalogueCard ? "package-card--catalogue" : "package-card--learning"}`.trim()}
    >
      {isLearningCard && onRemove && (
        <button
          type="button"
          className="package-card__remove-control"
          onClick={() => void handleLibraryAction(onRemove)}
          disabled={libraryPending}
          aria-busy={libraryPending}
          aria-label={`Remove from library: ${pkg.title}`}
          title="Remove from library"
        >
          {libraryPending ? "..." : "X"}
        </button>
      )}

      <div className="package-card__content">
        <div className="package-card__header">
          <h2 className="package-card__title">{pkg.title}</h2>
        </div>
        <span className="package-card__version">v{pkg.version}</span>

        <p className="package-card__description">{pkg.description}</p>

        <div className="package-card__meta" aria-label="Package details">
          <span>{pkg.page_count} pages</span>
          <span>{pkg.question_count} questions</span>
          <span>{passingScorePercent}% to pass</span>
        </div>

        {pkg.tags.length > 0 && (
          <ul className="package-card__tags" aria-label="Tags">
            {pkg.tags.map((tag) => (
              <li key={`${pkg.id}-${tag}`} className="package-card__tag">
                {tag}
              </li>
            ))}
          </ul>
        )}

        {isUnavailable && <p className="package-card__status">Unavailable</p>}

        {isLearningCard && !isUnavailable && <PackageProgressPanel results={results} />}
      </div>

      {(isLearningCard || onAdd || (isCatalogueCard && onRemove)) && (
        <div className="package-card__actions">
          {isLearningCard && (
            <>
              <button
                type="button"
                className="package-card__btn package-card__btn--primary"
                onClick={() => navigate(`/packages/${pkg.id}`)}
                disabled={!isActionEnabled}
                aria-disabled={!isActionEnabled}
              >
                Start Learning
              </button>
              <button
                type="button"
                className="package-card__btn package-card__btn--secondary"
                onClick={() => navigate(`/test/exam/${pkg.id}`)}
                disabled={!isActionEnabled}
                aria-disabled={!isActionEnabled}
              >
                Take Test
              </button>
            </>
          )}
          {onAdd && (
            <button
              type="button"
              className="package-card__btn package-card__btn--library-add"
              onClick={() => void handleLibraryAction(onAdd)}
              disabled={libraryPending}
              aria-busy={libraryPending}
              aria-label={`Add to library: ${pkg.title}`}
            >
              {libraryPending ? "Adding..." : "Add to Library"}
            </button>
          )}
          {isCatalogueCard && onRemove && (
            <button
              type="button"
              className="package-card__btn package-card__btn--library-remove"
              onClick={() => void handleLibraryAction(onRemove)}
              disabled={libraryPending}
              aria-busy={libraryPending}
              aria-label={`Remove from library: ${pkg.title}`}
            >
              {libraryPending ? "Removing..." : "Remove from Library"}
            </button>
          )}
          {libraryError && (
            <p className="package-card__library-error" role="alert">
              {libraryError}
            </p>
          )}
        </div>
      )}
    </article>
  );
}
