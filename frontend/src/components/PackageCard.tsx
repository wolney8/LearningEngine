import { useNavigate } from "react-router-dom";

import type { PackageSummary } from "../schemas/package";
import "./PackageCard.css";

interface PackageCardProps {
  pkg: PackageSummary;
}

export function PackageCard({ pkg }: PackageCardProps) {
  const navigate = useNavigate();
  const passingScorePercent = Math.round(pkg.passing_score * 100);

  return (
    <article className="package-card">
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
      </div>

      <div className="package-card__actions">
        <button
          type="button"
          className="package-card__btn package-card__btn--primary"
          onClick={() => navigate(`/packages/${pkg.id}`)}
        >
          Start Learning
        </button>
        <button
          type="button"
          className="package-card__btn package-card__btn--secondary"
          onClick={() => navigate(`/test/exam/${pkg.id}`)}
        >
          Take Test
        </button>
      </div>
    </article>
  );
}
