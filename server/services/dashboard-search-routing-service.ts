import env from "@/lib/env";
import {
  buildDashboardSearchHref,
  type ResolvedDashboardSearchScope,
} from "@/lib/dashboard-search";
import { searchPersons } from "@/server/registry/role-search-service";
import { searchCompanies } from "@/server/services/company-service";

type AiScopeResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
};

export type RoutingDependencies = {
  searchCompanyMatches: (filters: {
    query: string;
    aiAssisted: boolean;
  }) => Promise<{
    results: Array<{ company: { name: string } }>;
    interpretation: { matchedIndustryCodes: Array<{ code: string }> };
  }>;
  searchPersonMatches: (
    query: string,
    options: { limit: number },
  ) => Promise<Array<{ fullName: string }>>;
  classifyWithAi: (query: string) => Promise<ResolvedDashboardSearchScope | null>;
};

const ROLE_TERMS = /\b(styreleder|styremedlem|daglig leder|revisor|innehaver|nestleder|varamedlem|kontaktperson)\b/i;
const BANKRUPTCY_TERMS = /\b(konkurs|konkurser|konkursrammet|tvangsavvikl(?:et|ing))\b/i;
const INDUSTRY_CODE = /^\d{2}(?:\.\d{1,3})?$/;

function normalize(value: string) {
  return value
    .toLocaleLowerCase("nb-NO")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function classifyWithAi(query: string): Promise<ResolvedDashboardSearchScope | null> {
  if (!env.openAiApiKey) return null;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.openAiApiKey}`,
      },
      body: JSON.stringify({
        model: env.openAiSearchModel,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Classify a Norwegian business-search query into exactly one available search scope. " +
              "Return strict JSON with the key scope and one of: companies, industries, persons, roles, bankruptcies. " +
              "Choose persons for a named individual, roles for queries primarily about a position, industries for an industry/activity, bankruptcies for bankruptcy-focused queries, otherwise companies. Do not invent facts.",
          },
          { role: "user", content: query },
        ],
      }),
    });
    if (!response.ok) return null;

    const payload = (await response.json()) as AiScopeResponse;
    const content = payload.choices?.[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content) as { scope?: string };
    return ["companies", "industries", "persons", "roles", "bankruptcies"].includes(
      parsed.scope ?? "",
    )
      ? (parsed.scope as ResolvedDashboardSearchScope)
      : null;
  } catch {
    return null;
  }
}

const defaultDependencies: RoutingDependencies = {
  searchCompanyMatches: searchCompanies,
  searchPersonMatches: searchPersons,
  classifyWithAi,
};

async function resolveWithoutAi(
  query: string,
  dependencies: RoutingDependencies,
): Promise<ResolvedDashboardSearchScope> {
  const compact = query.replace(/\s/g, "");
  if (/^\d{9}$/.test(compact)) return "companies";
  if (BANKRUPTCY_TERMS.test(query)) return "bankruptcies";
  if (ROLE_TERMS.test(query)) return "roles";
  if (INDUSTRY_CODE.test(query.trim())) return "industries";

  const [companyResult, personResult] = await Promise.allSettled([
    dependencies.searchCompanyMatches({ query, aiAssisted: false }),
    dependencies.searchPersonMatches(query, { limit: 5 }),
  ]);

  const normalizedQuery = normalize(query);
  const companies = companyResult.status === "fulfilled" ? companyResult.value : null;
  const persons = personResult.status === "fulfilled" ? personResult.value : [];
  const companyName = normalize(companies?.results[0]?.company.name ?? "");
  const personName = normalize(persons[0]?.fullName ?? "");

  if (personName === normalizedQuery && companyName !== normalizedQuery) return "persons";
  if (companyName === normalizedQuery) return "companies";
  if (personName.startsWith(normalizedQuery) && !companyName.startsWith(normalizedQuery)) {
    return "persons";
  }

  const industryMatch = companies?.interpretation.matchedIndustryCodes[0];
  if (industryMatch && !companyName.startsWith(normalizedQuery)) return "industries";
  if (persons.length > 0 && !companies?.results.length) return "persons";
  return "companies";
}

export async function resolveDashboardSearchHref(
  input: { query: string; aiEnabled: boolean },
  dependencies: RoutingDependencies = defaultDependencies,
) {
  const query = input.query.trim();
  const aiScope = input.aiEnabled ? await dependencies.classifyWithAi(query) : null;
  const scope = aiScope ?? (await resolveWithoutAi(query, dependencies));
  return buildDashboardSearchHref(query, scope, input.aiEnabled);
}
