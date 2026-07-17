const MIN_QUERY_LENGTH = 2;
export const DEFAULT_NAV_AI_SEARCH_ENABLED = false;

export type NavSearchSuggestion = {
  type: "company" | "person" | "role" | "industry" | "bankruptcy";
  id: string;
  title: string;
  description: string;
  href: string;
};

export function getNavSearchSuggestionLabel(type: NavSearchSuggestion["type"]) {
  switch (type) {
    case "company":
      return "Selskap";
    case "person":
      return "Person";
    case "role":
      return "Rolle";
    case "industry":
      return "Bransje";
    case "bankruptcy":
      return "Konkurs";
  }
}

export function getNavSearchSuggestionIcon(type: NavSearchSuggestion["type"]) {
  switch (type) {
    case "company":
      return "apartment";
    case "person":
      return "person";
    case "role":
      return "badge";
    case "industry":
      return "category";
    case "bankruptcy":
      return "gavel";
  }
}

export function buildNavSearchHref(query: string, aiEnabled: boolean, searchEventId?: string) {
  const encodedQuery = encodeURIComponent(query.trim());
  let href = aiEnabled
    ? `/search?query=${encodedQuery}&ai=1`
    : `/search/resolve?query=${encodedQuery}&scope=all`;
  if (searchEventId) href += `&searchEventId=${encodeURIComponent(searchEventId)}`;
  return href;
}

export function canShowNavSearchSuggestions(query: string, aiEnabled: boolean) {
  return !aiEnabled && query.trim().length >= MIN_QUERY_LENGTH;
}
