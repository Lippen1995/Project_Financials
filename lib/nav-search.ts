const MIN_QUERY_LENGTH = 2;
export const DEFAULT_NAV_AI_SEARCH_ENABLED = false;

export function buildNavSearchHref(query: string, aiEnabled: boolean) {
  const href = `/search?query=${encodeURIComponent(query.trim())}`;
  return aiEnabled ? `${href}&ai=1` : href;
}

export function canShowNavSearchSuggestions(query: string, aiEnabled: boolean) {
  return !aiEnabled && query.trim().length >= MIN_QUERY_LENGTH;
}
