import { NextResponse } from "next/server";

import { getPetroleumSeismicEntityDetailById } from "@/server/services/petroleum-seismic-service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ entityType: string; id: string }> },
) {
  const { entityType, id } = await context.params;
  const data = await getPetroleumSeismicEntityDetailById(entityType, id);

  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ data });
}
