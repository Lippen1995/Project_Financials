import { NextRequest, NextResponse } from "next/server";

import { parsePetroleumFilters } from "@/lib/petroleum-market";
import { getPetroleumMarketFeatures } from "@/server/services/petroleum-market-service";

export async function GET(request: NextRequest) {
  const filters = parsePetroleumFilters(new URL(request.url).searchParams);
  const data = await getPetroleumMarketFeatures(filters);

  return NextResponse.json({ data });
}
