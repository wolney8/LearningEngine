import { LoaderCircle, X } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../hooks/useAuth";
import { useTestResults } from "../hooks/useTestResults";
import { useXP } from "../hooks/useXP";
import { useXPSpend } from "../hooks/useXPSpend";
import type { PackageSummary } from "../schemas/package";
import { PackageProgressPanel } from "./PackageProgressPanel";
import { SpendConfirmModal } from "./SpendConfirmModal";
import "./PackageCard.css";

interface PackageCardProps {
  pkg: PackageSummary;
  variant?: "learning" | "catalogue";
  onAdd?: () => Promise<void>;
  onRemove?: () => Promise<void>;
  onStartLearning?: () => void;
  onTakeTest?: () => void;
  spendEconomyEnabled?: boolean;
  unlockCost?: number;
  onPackageUnlocked?: () => void;
}

export function PackageCard({
  pkg,
  variant = "learning",
  onAdd,
  onRemove,
  onStartLearning,
  onTakeTest,
  spendEconomyEnabled,
  unlockCost,
  onPackageUnlocked,
}: PackageCardProps) {
  const navigate = useNavigate();
  const { status: authStatus, token } = useAuth();
  const { xp } = useXP();
  const { spend, loading, error, reset } = useXPSpend();
  const { results } = useTestResults(pkg.id);
  const passingScorePercent = Math.round(pkg.passing_score * 100);
  const isUnavailable = pkg.availability === "unavailable";
  const isHidden = pkg.availability === "hidden";
  const isUnavailableOrHidden = isUnavailable || isHidden;
  const isLearningCard = variant === "learning";
  const isCatalogueCard = variant === "catalogue";
  const isActionEnabled = pkg.availability === "available";
  const isAuthenticated = authStatus === "authenticated" && Boolean(token);
  const canUnlockHiddenPackage =
    isHidden && spendEconomyEnabled === true && isAuthenticated;
  const resolvedUnlockCost = unlockCost ?? 250;
  const [libraryPending, setLibraryPending] = useState(false);
  const [libraryError, setLibraryError] = useState("");
  const [areTagsExpanded, setAreTagsExpanded] = useState(false);
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const hasTagOverflow = pkg.tags.length > 3;
  const visibleTags = hasTagOverflow
    ? areTagsExpanded
      ? pkg.tags
      : pkg.tags.slice(0, 3)
    : pkg.tags;

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
      className={`package-card ${isUnavailableOrHidden ? "package-card--unavailable" : ""} ${isCatalogueCard ? "package-card--catalogue" : "package-card--learning"}`.trim()}
    >
      <div className="package-card__content">
        <div className="package-card__header">
          <div className="package-card__header-top-row">
            <h2 className="package-card__title">{pkg.title}</h2>
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
                {libraryPending ? (
                  <LoaderCircle
                    size={13}
                    aria-hidden="true"
                    className="package-card__remove-spinner"
                  />
                ) : (
                  <X size={13} aria-hidden="true" />
                )}
              </button>
            )}
          </div>
          {isLearningCard && !isUnavailableOrHidden && (
            <PackageProgressPanel results={results} showStats={false} />
          )}
        </div>

        <p className="package-card__description">{pkg.description}</p>

        <div className="package-card__meta" aria-label="Package details">
          <span>{pkg.page_count} pages</span>
          <span>{pkg.question_count} questions</span>
          <span>{passingScorePercent}% to pass</span>
        </div>

        {pkg.tags.length > 0 && (
          <div className="package-card__tags-wrap">
            <ul
              id={`package-card-tags-${pkg.id}`}
              className="package-card__tags"
              aria-label="Tags"
            >
              {visibleTags.map((tag) => (
                <li key={`${pkg.id}-${tag}`} className="package-card__tag">
                  {tag}
                </li>
              ))}
            </ul>
            {hasTagOverflow && (
              <button
                type="button"
                className="package-card__tags-toggle"
                onClick={() => setAreTagsExpanded((value) => !value)}
                aria-expanded={areTagsExpanded}
                aria-controls={`package-card-tags-${pkg.id}`}
                aria-label={
                  areTagsExpanded
                    ? `Show fewer tags for ${pkg.title}`
                    : `Show all tags for ${pkg.title}`
                }
              >
                {areTagsExpanded
                  ? "Show less"
                  : `+${pkg.tags.length - visibleTags.length} more`}
              </button>
            )}
          </div>
        )}

        {isUnavailableOrHidden && (
          <p className="package-card__status">
            {isHidden ? "Hidden" : "Unavailable"}
          </p>
        )}

        {isLearningCard && !isUnavailableOrHidden && (
          <PackageProgressPanel results={results} showIndicators={false} />
        )}
      </div>

      {(isLearningCard ||
        onAdd ||
        (isCatalogueCard && onRemove) ||
        canUnlockHiddenPackage) && (
        <div className="package-card__actions">
          {isLearningCard && (
            <>
              <button
                type="button"
                className="package-card__btn package-card__btn--primary"
                onClick={() =>
                  onStartLearning
                    ? onStartLearning()
                    : navigate(`/packages/${pkg.id}`)
                }
                disabled={!isActionEnabled}
                aria-disabled={!isActionEnabled}
              >
                Start Learning
              </button>
              <button
                type="button"
                className="package-card__btn package-card__btn--secondary"
                onClick={() =>
                  onTakeTest ? onTakeTest() : navigate(`/test/exam/${pkg.id}`)
                }
                disabled={!isActionEnabled}
                aria-disabled={!isActionEnabled}
              >
                Take Test
              </button>
            </>
          )}
          {onAdd && !isHidden && (
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
          {canUnlockHiddenPackage && (
            <button
              type="button"
              className="package-card__btn package-card__btn--primary"
              onClick={() => {
                reset();
                setShowUnlockModal(true);
              }}
              disabled={loading}
              aria-busy={loading}
            >
              Unlock Package
            </button>
          )}
          {libraryError && (
            <p className="package-card__library-error" role="alert">
              {libraryError}
            </p>
          )}
        </div>
      )}

      <SpendConfirmModal
        open={showUnlockModal}
        actionLabel="Unlock Package"
        cost={resolvedUnlockCost}
        currentXP={xp}
        onConfirm={async () => {
          try {
            await spend("package_unlock", pkg.id);
            setShowUnlockModal(false);
            reset();
            onPackageUnlocked?.();
          } catch {
            // Modal shows spend error via useXPSpend.
          }
        }}
        onCancel={() => {
          setShowUnlockModal(false);
          reset();
        }}
        loading={loading}
        error={error}
      />
    </article>
  );
}
