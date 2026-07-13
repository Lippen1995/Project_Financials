export const DASHBOARD_SEARCH_SCOPES = [
  { value: "all", label: "ALLE" },
  { value: "companies", label: "SELSKAPER" },
  { value: "industries", label: "BRANSJER" },
  { value: "persons", label: "PERSONER" },
  { value: "roles", label: "ROLLER" },
  { value: "bankruptcies", label: "KONKURS" },
] as const;

export type DashboardSearchScope = (typeof DASHBOARD_SEARCH_SCOPES)[number]["value"];
export type ResolvedDashboardSearchScope = Exclude<DashboardSearchScope, "all">;

export function isDashboardSearchScope(value: string | null): value is DashboardSearchScope {
  return DASHBOARD_SEARCH_SCOPES.some((scope) => scope.value === value);
}

export function buildDashboardSearchHref(
  query: string,
  scope: ResolvedDashboardSearchScope,
  aiEnabled: boolean,
) {
  const params = new URLSearchParams({ query: query.trim(), scope });
  if (aiEnabled) params.set("ai", "1");

  if (scope === "persons" || scope === "roles") {
    const hash = scope === "roles" ? "#role-filter" : "";
    return `/people?${params.toString()}${hash}`;
  }

  if (scope === "bankruptcies") params.set("status", "BANKRUPT");
  return `/search?${params.toString()}`;
}
