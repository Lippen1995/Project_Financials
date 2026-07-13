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

const ROLE_QUERY_TERMS: Array<{ pattern: RegExp; roleType: string }> = [
  { pattern: /\b(?:styrets leder|styreleder)\b/i, roleType: "LEDE" },
  { pattern: /\bnestleder\b/i, roleType: "NEST" },
  { pattern: /\bstyremedlem\b/i, roleType: "MEDL" },
  { pattern: /\bvaramedlem\b/i, roleType: "VARA" },
  { pattern: /\bdaglig leder\b/i, roleType: "DAGL" },
  { pattern: /\binnehaver\b/i, roleType: "INNH" },
  { pattern: /\bkontaktperson\b/i, roleType: "KONT" },
  { pattern: /\brevisor\b/i, roleType: "REVI" },
];

function parseRoleQuery(query: string) {
  for (const role of ROLE_QUERY_TERMS) {
    if (role.pattern.test(query)) {
      return {
        query: query.replace(role.pattern, " ").replace(/\s+/g, " ").trim(),
        roleType: role.roleType,
      };
    }
  }
  return { query: query.trim(), roleType: null };
}

export function isDashboardSearchScope(value: string | null): value is DashboardSearchScope {
  return DASHBOARD_SEARCH_SCOPES.some((scope) => scope.value === value);
}

export function buildDashboardSearchHref(
  query: string,
  scope: ResolvedDashboardSearchScope,
  aiEnabled: boolean,
) {
  const roleQuery = scope === "roles" ? parseRoleQuery(query) : null;
  const params = new URLSearchParams({ query: roleQuery?.query ?? query.trim(), scope });
  if (aiEnabled) params.set("ai", "1");
  if (roleQuery?.roleType) params.set("roleType", roleQuery.roleType);

  if (scope === "persons" || scope === "roles") {
    const hash = scope === "roles" ? "#role-filter" : "";
    return `/people?${params.toString()}${hash}`;
  }

  if (scope === "bankruptcies") params.set("status", "BANKRUPT");
  return `/search?${params.toString()}`;
}
