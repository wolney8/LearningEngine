import "./PackageFilterBar.css";

export type FilterKey =
  | "all"
  | "incomplete"
  | "failed"
  | "completed"
  | "unavailable";

export interface FilterOption {
  key: FilterKey;
  label: string;
  count: number;
}

interface PackageFilterBarProps {
  filters: FilterOption[];
  activeFilter: FilterKey;
  onChange: (key: FilterKey) => void;
}

export function PackageFilterBar({
  filters,
  activeFilter,
  onChange,
}: PackageFilterBarProps) {
  return (
    <div className="filter-bar" aria-label="Filter packages">
      {filters.map(({ key, label, count }) => {
        const isActive = key === activeFilter;
        return (
          <button
            key={key}
            type="button"
            className={`filter-bar__pill${isActive ? " filter-bar__pill--active" : ""}`}
            aria-pressed={isActive}
            onClick={() => onChange(key)}
          >
            {label}
            <span className="filter-bar__count">{count}</span>
          </button>
        );
      })}
    </div>
  );
}
