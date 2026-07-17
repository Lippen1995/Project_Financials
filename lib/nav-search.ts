const MIN_QUERY_LENGTH = 2;
export const DEFAULT_NAV_AI_SEARCH_ENABLED = false;

export type NavSearchSuggestion = {
  type: "company" | "person" | "role";
  id: string;
  title: string;
  description: string;
  href: string;
};

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
