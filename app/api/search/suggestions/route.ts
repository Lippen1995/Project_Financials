import { NextRequest, NextResponse } from "next/server";

import { SsbIndustryCodeProvider } from "@/integrations/ssb/ssb-industry-code-provider";
import { buildDashboardSearchHref, isDashboardSearchScope } from "@/lib/dashboard-search";
import type { NavSearchSuggestion } from "@/lib/nav-search";
import {
  consumeRateLimit,
  getClientAddress,
  rateLimitHeaders,
} from "@/lib/rate-limit";
import { searchRegistryCompanies } from "@/server/registry/entity-search-service";
import { searchPersons, searchRoleTypes } from "@/server/registry/role-search-service";

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 200;
const industryCodeProvider = new SsbIndustryCodeProvider();

export async function GET(request: NextRequest) {
  const requestLimit = consumeRateLimit(
    "search-suggestions",
    getClientAddress(request.headers),
    { limit: 120, windowMs: 60_000 },
  );
  if (!requestLimit.allowed) {
    return NextResponse.json(
      { error: "For mange søk. Prøv igjen om litt." },
      { status: 429, headers: rateLimitHeaders(requestLimit) },
    );
  }

  const query = (request.nextUrl.searchParams.get("query") ?? "").trim();
  const rawScope = request.nextUrl.searchParams.get("scope");
  if (rawScope !== null && !isDashboardSearchScope(rawScope)) {
    return NextResponse.json({ error: "Ugyldig søkeavgrensning." }, { status: 400 });
  }
  const scope = isDashboardSearchScope(rawScope) ? rawScope : "all";
  const includesScope = (candidate: Exclude<typeof scope, "all">) =>
    scope === "all" || scope === candidate;

  if (query.length > MAX_QUERY_LENGTH) {
    return NextResponse.json({ error: "Søket er for langt." }, { status: 400 });
  }
  if (query.length < MIN_QUERY_LENGTH) {
    return NextResponse.json({ data: [], meta: { unavailableSources: [] } });
  }

  const [companyResult, personResult, roleResult, industryResult, bankruptcyResult] =
    await Promise.allSettled([
      includesScope("companies")
        ? searchRegistryCompanies({ query, size: 3 })
        : Promise.resolve([]),
      includesScope("persons") ? searchPersons(query, { limit: 3 }) : Promise.resolve([]),
      includesScope("roles") ? searchRoleTypes(query, { limit: 2 }) : Promise.resolve([]),
      includesScope("industries")
        ? industryCodeProvider.searchIndustryCodes([query], 3)
        : Promise.resolve([]),
      includesScope("bankruptcies")
        ? searchRegistryCompanies({ query, size: 3, status: "BANKRUPT" })
        : Promise.resolve([]),
    ]);

  const companies = companyResult.status === "fulfilled" ? companyResult.value : [];
  const persons = personResult.status === "fulfilled" ? personResult.value : [];
  const roles = roleResult.status === "fulfilled" ? roleResult.value : [];
  const industries = industryResult.status === "fulfilled" ? industryResult.value : [];
  const bankruptcies = bankruptcyResult.status === "fulfilled" ? bankruptcyResult.value : [];
  const unavailableSources = [
    companyResult.status === "rejected" ? "companies" : null,
    personResult.status === "rejected" ? "persons" : null,
    roleResult.status === "rejected" ? "roles" : null,
    industryResult.status === "rejected" ? "industries" : null,
    bankruptcyResult.status === "rejected" ? "bankruptcies" : null,
  ].filter((source): source is string => source !== null);

  const includedSourceCount = scope === "all" ? 5 : 1;
  if (unavailableSources.length === includedSourceCount) {
    return NextResponse.json(
      { error: "Søket er midlertidig utilgjengelig." },
      { status: 503 },
    );
  }

  const companySuggestions: NavSearchSuggestion[] = companies.map((company) => ({
    type: "company" as const,
    id: company.orgNumber,
    title: company.name,
    description: [`Org.nr. ${company.orgNumber}`, company.municipality]
      .filter(Boolean)
      .join(" · "),
    href: `/companies/${company.orgNumber}`,
  }));
  const personSuggestions: NavSearchSuggestion[] = persons.map((person) => ({
    type: "person" as const,
    id: person.identityKey,
    title: person.fullName,
    description: `Person · ${person.companyCount} selskaper · ${person.roleCount} roller`,
    href: buildDashboardSearchHref(person.fullName, "persons", false),
  }));
  const roleSuggestions: NavSearchSuggestion[] = roles.map((role) => {
    const title = role.roleTypeLabel ?? role.roleType;
    return {
      type: "role" as const,
      id: role.roleType,
      title,
      description: `Rolle · ${role.assignmentCount} registreringer`,
      href: buildDashboardSearchHref(title, "roles", false),
    };
  });
  const industrySuggestions: NavSearchSuggestion[] = industries.map((industry) => ({
    type: "industry" as const,
    id: industry.code,
    title: industry.title ?? industry.code,
    description: `Næringskode ${industry.code}`,
    href: buildDashboardSearchHref(industry.code, "industries", false),
  }));
  const bankruptcySuggestions: NavSearchSuggestion[] = bankruptcies.map((company) => ({
    type: "bankruptcy" as const,
    id: company.orgNumber,
    title: company.name,
    description: `Konkurs · Org.nr. ${company.orgNumber}`,
    href: `/companies/${company.orgNumber}`,
  }));
  const groups = [
    companySuggestions,
    personSuggestions,
    industrySuggestions,
    roleSuggestions,
    bankruptcySuggestions,
  ];
  const data = [
    ...groups.flatMap((group) => group.slice(0, 1)),
    ...groups.flatMap((group) => group.slice(1)),
  ];

  return NextResponse.json({ data, meta: { unavailableSources } });
}
