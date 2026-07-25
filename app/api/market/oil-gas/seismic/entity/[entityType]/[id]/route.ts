import { NextResponse } from "next/server";

import { tryParseRouteIds } from "@/lib/api-input";
import { getPetroleumSeismicEntityDetailById } from "@/server/services/petroleum-seismic-service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ entityType: string; id: string }> },
) {
  const routeIds = tryParseRouteIds(await context.params, ["entityType", "id"] as const);
  if (!routeIds) {
    return NextResponse.json({ error: "Invalid route parameters" }, { status: 400 });
  }
  const { entityType, id } = routeIds;
  const data = await getPetroleumSeismicEntityDetailById(entityType, id);

  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ data });
}
