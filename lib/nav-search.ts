const MIN_QUERY_LENGTH = 2;
export const DEFAULT_NAV_AI_SEARCH_ENABLED = false;

export function buildNavSearchHref(query: string, aiEnabled: boolean, searchEventId?: string) {
  let href = `/search?query=${encodeURIComponent(query.trim())}`;
  if (aiEnabled) href += "&ai=1";
  if (searchEventId) href += `&searchEventId=${encodeURIComponent(searchEventId)}`;
  return href;
}

export function canShowNavSearchSuggestions(query: string, aiEnabled: boolean) {
  return !aiEnabled && query.trim().length >= MIN_QUERY_LENGTH;
}
