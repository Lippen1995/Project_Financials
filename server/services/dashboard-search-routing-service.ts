import type { ScopeClassificationBudget } from "@/server/ai-search/classification/dashboard-search-scope-provider";
import {
  buildDashboardSearchHref,
  type ResolvedDashboardSearchScope,
} from "@/lib/dashboard-search";
import { searchPersons, searchRoleTypes } from "@/server/registry/role-search-service";
import { SsbClassificationRepository } from "@/server/registry/ssb-classification-repository";
import { searchCompanies } from "@/server/services/company-service";

export type RoutingDependencies = {
  searchCompanyMatches: (
    query: string,
    options?: { status?: "BANKRUPT" },
  ) => Promise<{
    results: Array<{ company: { name: string } }>;
  }>;
  searchPersonMatches: (query: string) => Promise<Array<{ fullName: string }>>;
  searchIndustryMatches: (
    query: string,
  ) => Promise<Array<{ code: string; title?: string | null; score: number }>>;
  searchRoleMatches: (
    query: string,
  ) => Promise<Array<{ roleType: string; roleTypeLabel: string | null }>>;
  classifyWithAi: (
    query: string,
    budget: ScopeClassificationBudget | null,
  ) => Promise<ResolvedDashboardSearchScope | null>;
};

const BANKRUPTCY_TERMS = /\b(konkurs|konkurser|konkursrammet|tvangsavvikl(?:et|ing))\b/i;
const INDUSTRY_CODE = /^\d{2}(?:\.\d{1,3})?$/;
const industryCodeProvider = new SsbClassificationRepository();

function normalize(value: string) {
  return value
    .toLocaleLowerCase("nb-NO")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const defaultDependencies: RoutingDependencies = {
  searchCompanyMatches: (query, options) =>
    searchCompanies({ query, aiAssisted: false, status: options?.status }),
  searchPersonMatches: (query) => searchPersons(query, { limit: 5 }),
  searchIndustryMatches: (query) => industryCodeProvider.searchIndustryCodes([query], 5),
  searchRoleMatches: (query) => searchRoleTypes(query, { limit: 5 }),
  // Scope classification is asynchronous under GL-A01. The request path uses
  // deterministic, database-backed routing until a stored classification exists.
  classifyWithAi: async () => null,
};

function nameScore(name: string | null | undefined, query: string, fallback: number) {
  const normalizedName = normalize(name ?? "");
  if (!normalizedName) return 0;
  if (normalizedName === query) return 100;
  if (normalizedName.startsWith(query)) return 80;
  if (normalizedName.includes(query)) return 65;
  return fallback;
}

async function resolveWithoutAi(
  query: string,
  dependencies: RoutingDependencies,
): Promise<ResolvedDashboardSearchScope> {
  const compact = query.replace(/\s/g, "");
  if (/^\d{9}$/.test(compact)) return "companies";
  if (BANKRUPTCY_TERMS.test(query)) return "bankruptcies";
  if (INDUSTRY_CODE.test(query.trim())) return "industries";

  const [companyResult, personResult, industryResult, roleResult, bankruptcyResult] =
    await Promise.allSettled([
    dependencies.searchCompanyMatches(query),
    dependencies.searchPersonMatches(query),
    dependencies.searchIndustryMatches(query),
    dependencies.searchRoleMatches(query),
    dependencies.searchCompanyMatches(query, { status: "BANKRUPT" }),
  ]);

  const normalizedQuery = normalize(query);
  const companies = companyResult.status === "fulfilled" ? companyResult.value.results : [];
  const persons = personResult.status === "fulfilled" ? personResult.value : [];
  const industries = industryResult.status === "fulfilled" ? industryResult.value : [];
  const roles = roleResult.status === "fulfilled" ? roleResult.value : [];
  const bankruptcies =
    bankruptcyResult.status === "fulfilled" ? bankruptcyResult.value.results : [];

  const scores: Array<{ scope: ResolvedDashboardSearchScope; score: number }> = [
    {
      scope: "companies",
      score: nameScore(companies[0]?.company.name, normalizedQuery, companies.length ? 35 : 0),
    },
    {
      scope: "persons",
      score: nameScore(persons[0]?.fullName, normalizedQuery, persons.length ? 40 : 0),
    },
    {
      scope: "industries",
      score: Math.max(
        nameScore(industries[0]?.title, normalizedQuery, industries.length ? 30 : 0),
        Math.min(industries[0]?.score ?? 0, 75),
      ),
    },
    {
      scope: "roles",
      score: nameScore(
        roles[0]?.roleTypeLabel ?? roles[0]?.roleType,
        normalizedQuery,
        roles.length ? 45 : 0,
      ),
    },
    {
      scope: "bankruptcies",
      score: Math.min(
        nameScore(
          bankruptcies[0]?.company.name,
          normalizedQuery,
          bankruptcies.length ? 25 : 0,
        ),
        90,
      ),
    },
  ];

  return scores.sort((left, right) => right.score - left.score)[0]?.scope ?? "companies";
}

/**
 * Resolves which search scope a query should land in.
 *
 * `aiBudget` must be supplied for the model-backed classifier to run at all.
 * `aiEnabled` alone only marks the resulting href as an AI search; it does not
 * authorise a model call, because a flag that both marks intent and unlocks
 * spending is too easy to flip by accident. The provider is fail-closed too,
 * so omitting the budget falls back to deterministic routing rather than
 * making an unbudgeted call.
 */
export async function resolveDashboardSearchHref(
  input: {
    query: string;
    aiEnabled: boolean;
    aiBudget?: ScopeClassificationBudget | null;
  },
  dependencies: RoutingDependencies = defaultDependencies,
) {
  const query = input.query.trim();
  const budget = input.aiBudget ?? null;
  const aiScope =
    input.aiEnabled && budget ? await dependencies.classifyWithAi(query, budget) : null;
  const scope = aiScope ?? (await resolveWithoutAi(query, dependencies));
  return buildDashboardSearchHref(query, scope, input.aiEnabled);
}
