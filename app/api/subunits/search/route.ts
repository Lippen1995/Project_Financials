import { NextRequest, NextResponse } from "next/server";

import { searchRegistrySubunits } from "@/server/registry/subunit-search-service";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query") ?? "";
  const nacePrefix = searchParams.get("nace") ?? undefined;
  const limitParam = searchParams.get("limit");
  const activeOnly = searchParams.get("activeOnly") === "true";
  const limit = limitParam ? Number(limitParam) : undefined;

  const results = await searchRegistrySubunits(query, {
    nacePrefix,
    activeOnly,
    limit: Number.isNaN(limit) ? undefined : limit,
  });

  return NextResponse.json({ data: results });
}
