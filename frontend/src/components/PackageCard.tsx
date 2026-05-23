import { useNavigate } from "react-router-dom";

import { useTestResults } from "../hooks/useTestResults";
import type { PackageSummary } from "../schemas/package";
import { PackageProgressPanel } from "./PackageProgressPanel";
import "./PackageCard.css";

interface PackageCardProps {
  pkg: PackageSummary;
}

export function PackageCard({ pkg }: PackageCardProps) {
  const navigate = useNavigate();
  const { results } = useTestResults(pkg.id);
  const passingScorePercent = Math.round(pkg.passing_score * 100);
  const isEnabled = pkg.enabled;

  return (
    <article
      className={`package-card ${isEnabled ? "" : "package-card--disabled"}`.trim()}
    >
      <div className="package-card__content">
        <div className="package-card__header">
          <h2 className="package-card__title">{pkg.title}</h2>
          <span className="package-card__version">v{pkg.version}</span>
        </div>

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

        {!isEnabled && (
          <p className="package-card__locked-note">
            Locked by admin. This package is currently unavailable.
          </p>
        )}

        <PackageProgressPanel results={results} />
      </div>

      <div className="package-card__actions">
        <button
          type="button"
          className="package-card__btn package-card__btn--primary"
          onClick={() => navigate(`/packages/${pkg.id}`)}
          disabled={!isEnabled}
          aria-disabled={!isEnabled}
        >
          Start Learning
        </button>
        <button
          type="button"
          className="package-card__btn package-card__btn--secondary"
          onClick={() => navigate(`/test/exam/${pkg.id}`)}
          disabled={!isEnabled}
          aria-disabled={!isEnabled}
        >
          Take Test
        </button>
      </div>
    </article>
  );
}
