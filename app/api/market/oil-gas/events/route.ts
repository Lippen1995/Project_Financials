import { NextRequest, NextResponse } from "next/server";

import { queryPetroleumEventsSchema } from "@/lib/petroleum-market";
import { getPetroleumEvents } from "@/server/services/petroleum-market-service";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = queryPetroleumEventsSchema.safeParse(searchParams);
  if (!query.success) {
    return NextResponse.json({ error: "Invalid petroleum event filters" }, { status: 400 });
  }
  const data = await getPetroleumEvents(query.data.filters, query.data.limit);

  return NextResponse.json({ data });
}
