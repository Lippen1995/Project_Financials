import { NextRequest, NextResponse } from "next/server";

import {
  getPersonRoles,
  getPersonShareholdings,
  searchPersons,
} from "@/server/registry/role-search-service";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query") ?? "";
  const identityKey = searchParams.get("identityKey");
  const roleType = searchParams.get("roleType") ?? undefined;
  const includeDeregistered = searchParams.get("includeDeregistered") === "true";
  const limitParam = searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : undefined;

  // With identityKey: the reverse lookup — a person's roles across companies plus the
  // shares they own (from the aksjonærregister).
  if (identityKey) {
    const [roles, shareholdings] = await Promise.all([
      getPersonRoles(identityKey, { includeDeregistered }),
      getPersonShareholdings(identityKey),
    ]);
    return NextResponse.json({ data: { roles, shareholdings } });
  }

  const results = await searchPersons(query, {
    includeDeregistered,
    roleType,
    limit: Number.isNaN(limit) ? undefined : limit,
  });
  return NextResponse.json({ data: results });
}
