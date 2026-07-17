import { NextRequest, NextResponse } from "next/server";

import { buildDashboardSearchHref } from "@/lib/dashboard-search";
import type { NavSearchSuggestion } from "@/lib/nav-search";
import { searchRegistryCompanies } from "@/server/registry/entity-search-service";
import { searchPersons, searchRoleTypes } from "@/server/registry/role-search-service";

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 200;

export async function GET(request: NextRequest) {
  const query = (request.nextUrl.searchParams.get("query") ?? "").trim();

  if (query.length > MAX_QUERY_LENGTH) {
    return NextResponse.json({ error: "Søket er for langt." }, { status: 400 });
  }
  if (query.length < MIN_QUERY_LENGTH) {
    return NextResponse.json({ data: [], meta: { unavailableSources: [] } });
  }

  const [companyResult, personResult, roleResult] = await Promise.allSettled([
    searchRegistryCompanies({ query, size: 3 }),
    searchPersons(query, { limit: 3 }),
    searchRoleTypes(query, { limit: 2 }),
  ]);

  const companies = companyResult.status === "fulfilled" ? companyResult.value : [];
  const persons = personResult.status === "fulfilled" ? personResult.value : [];
  const roles = roleResult.status === "fulfilled" ? roleResult.value : [];
  const unavailableSources = [
    companyResult.status === "rejected" ? "companies" : null,
    personResult.status === "rejected" ? "persons" : null,
    roleResult.status === "rejected" ? "roles" : null,
  ].filter((source): source is string => source !== null);

  if (unavailableSources.length === 3) {
    return NextResponse.json(
      { error: "Søket er midlertidig utilgjengelig." },
      { status: 503 },
    );
  }

  const data: NavSearchSuggestion[] = [
    ...companies.map((company) => ({
      type: "company" as const,
      id: company.orgNumber,
      title: company.name,
      description: [
        `Org.nr. ${company.orgNumber}`,
        company.municipality,
      ].filter(Boolean).join(" · "),
      href: `/companies/${company.orgNumber}`,
    })),
    ...persons.map((person) => ({
      type: "person" as const,
      id: person.identityKey,
      title: person.fullName,
      description: `Person · ${person.companyCount} selskaper · ${person.roleCount} roller`,
      href: buildDashboardSearchHref(person.fullName, "persons", false),
    })),
    ...roles.map((role) => {
      const title = role.roleTypeLabel ?? role.roleType;
      return {
        type: "role" as const,
        id: role.roleType,
        title,
        description: `Rolle · ${role.assignmentCount} registreringer`,
        href: buildDashboardSearchHref(title, "roles", false),
      };
    }),
  ];

  return NextResponse.json({ data, meta: { unavailableSources } });
}
