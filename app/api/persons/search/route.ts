import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  getPersonRoles,
  getPersonShareholdings,
  searchPersons,
} from "@/server/registry/role-search-service";

const querySchema = z
  .object({
    query: z.string().trim().max(200).default(""),
    identityKey: z.string().trim().min(1).max(512).optional(),
    section: z.enum(["roles", "shareholdings"]).optional(),
    roleType: z.string().trim().min(1).max(128).optional(),
    scope: z.enum(["persons", "roles"]).default("persons"),
    includeDeregistered: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const parsedQuery = querySchema.safeParse({
    query: searchParams.get("query") ?? undefined,
    identityKey: searchParams.get("identityKey") ?? undefined,
    section: searchParams.get("section") ?? undefined,
    roleType: searchParams.get("roleType") ?? undefined,
    scope: searchParams.get("scope") ?? undefined,
    includeDeregistered: searchParams.get("includeDeregistered") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
  });

  if (!parsedQuery.success) {
    return NextResponse.json({ error: "Ugyldige søkeparametere." }, { status: 400 });
  }
  const {
    query,
    identityKey,
    section,
    roleType,
    scope: mode,
    includeDeregistered,
    limit,
  } = parsedQuery.data;

  // With identityKey: the reverse lookup — a person's roles across companies plus the
  // shares they own (from the aksjonærregister).
  if (identityKey) {
    if (section === "roles") {
      const roles = await getPersonRoles(identityKey, { includeDeregistered });
      return NextResponse.json({ data: { roles } });
    }

    if (section === "shareholdings") {
      const shareholdings = await getPersonShareholdings(identityKey);
      return NextResponse.json({ data: { shareholdings } });
    }

    const [roles, shareholdings] = await Promise.all([
      getPersonRoles(identityKey, { includeDeregistered }),
      getPersonShareholdings(identityKey),
    ]);
    return NextResponse.json({ data: { roles, shareholdings } });
  }

  const results = await searchPersons(query, {
    includeDeregistered,
    roleType,
    mode,
    limit,
  });
  return NextResponse.json({ data: results });
}
