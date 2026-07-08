import { NextRequest, NextResponse } from "next/server";

import { getPersonRoles, searchPersons } from "@/server/registry/role-search-service";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query") ?? "";
  const identityKey = searchParams.get("identityKey");
  const includeDeregistered = searchParams.get("includeDeregistered") === "true";
  const limitParam = searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : undefined;

  // With identityKey: the reverse lookup (a person's roles across companies).
  if (identityKey) {
    const roles = await getPersonRoles(identityKey, { includeDeregistered });
    return NextResponse.json({ data: roles });
  }

  const results = await searchPersons(query, {
    includeDeregistered,
    limit: Number.isNaN(limit) ? undefined : limit,
  });
  return NextResponse.json({ data: results });
}
