import { NextResponse } from "next/server";

import { getPetroleumEntityDetailById } from "@/server/services/petroleum-market-service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ entityType: string; id: string }> },
) {
  const { entityType, id } = await context.params;
  const data = await getPetroleumEntityDetailById(entityType, id);

  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ data });
}
