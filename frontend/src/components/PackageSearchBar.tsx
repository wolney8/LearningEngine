import "./PackageSearchBar.css";

interface PackageSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
}

export function PackageSearchBar({ value, onChange, onClear }: PackageSearchBarProps) {
  return (
    <form className="search-bar" onSubmit={(e) => e.preventDefault()}>
      <svg
        className="search-bar__icon"
        aria-hidden="true"
        focusable="false"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        className="search-bar__input"
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Search packages"
        placeholder="Search packages…"
        autoComplete="off"
      />
      {value.length > 0 && (
        <button
          type="button"
          className="search-bar__clear"
          onClick={onClear}
          aria-label="Clear search"
        >
          ×
        </button>
      )}
    </form>
  );
}
