import type { PackageSummary } from "../schemas/package";
import "./PackageCard.css";

interface PackageCardProps {
  pkg: PackageSummary;
  onClick: () => void;
}

export function PackageCard({ pkg, onClick }: PackageCardProps) {
  const passingScorePercent = Math.round(pkg.passing_score * 100);

  return (
    <button type="button" className="package-card" onClick={onClick}>
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
    </button>
  );
}
