import {
  getNavSearchSuggestionIcon,
  getNavSearchSuggestionLabel,
  type NavSearchSuggestion,
} from "@/lib/nav-search";

export function dashboardSuggestionOptionId(listId: string, index: number) {
  return `${listId}-option-${index}`;
}

export function DashboardSearchSuggestionList({
  id,
  visible,
  suggestions,
  loading,
  error,
  highlightedIndex,
  onHighlight,
}: {
  id: string;
  visible: boolean;
  suggestions: NavSearchSuggestion[];
  loading: boolean;
  error: string | null;
  highlightedIndex: number;
  onHighlight: (index: number) => void;
}) {
  if (!visible) return null;

  return (
    <ul
      id={id}
      role="listbox"
      className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[50vh] overflow-y-auto rounded-xl border border-[var(--px-border)] bg-[var(--px-surface)] py-1 text-left"
    >
      {loading && suggestions.length === 0 ? (
        <li className="px-4 py-3 text-sm text-[var(--px-muted)]">Søker…</li>
      ) : error && suggestions.length === 0 ? (
        <li role="status" className="px-4 py-3 text-sm text-amber-700">
          {error}
        </li>
      ) : suggestions.length === 0 ? (
        <li className="px-4 py-3 text-sm text-[var(--px-muted)]">Ingen treff</li>
      ) : (
        <>
          {suggestions.map((suggestion, index) => (
            <li
              id={dashboardSuggestionOptionId(id, index)}
              key={`${suggestion.type}:${suggestion.id}`}
              role="option"
              aria-selected={highlightedIndex === index}
            >
              <a
                href={suggestion.href}
                onMouseEnter={() => onHighlight(index)}
                className={`flex items-start gap-4 px-4 py-3 transition-colors ${
                  highlightedIndex === index
                    ? "bg-[var(--px-subtle)]"
                    : "hover:bg-[var(--px-subtle)]"
                }`}
              >
                <span className="material-symbols-outlined mt-0.5 text-[20px] text-[var(--px-muted)]">
                  {getNavSearchSuggestionIcon(suggestion.type)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-4">
                    <span className="truncate text-sm font-semibold text-[var(--px-text)]">
                      {suggestion.title}
                    </span>
                    <span className="data-label shrink-0 text-[9px] font-semibold uppercase text-[var(--px-muted)]">
                      {getNavSearchSuggestionLabel(suggestion.type)}
                    </span>
                  </span>
                  <span className="block truncate text-xs tabular-nums text-[var(--px-muted)]">
                    {suggestion.description}
                  </span>
                </span>
              </a>
            </li>
          ))}
          {error ? (
            <li
              role="status"
              className="border-t border-[var(--px-border)] px-4 py-2 text-xs text-amber-700"
            >
              {error}
            </li>
          ) : null}
        </>
      )}
    </ul>
  );
}
