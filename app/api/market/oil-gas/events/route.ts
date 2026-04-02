import { NextRequest, NextResponse } from "next/server";

import { parsePetroleumFilters } from "@/lib/petroleum-market";
import { getPetroleumEvents } from "@/server/services/petroleum-market-service";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const filters = parsePetroleumFilters(searchParams);
  const limit = Number(searchParams.get("limit") ?? "100");
  const data = await getPetroleumEvents(filters, Number.isFinite(limit) ? limit : 100);

  return NextResponse.json({ data });
}
