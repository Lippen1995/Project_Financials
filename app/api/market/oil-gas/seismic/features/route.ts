import { NextRequest, NextResponse } from "next/server";

import { parsePetroleumFilters } from "@/lib/petroleum-market";
import { getPetroleumSeismicFeatures } from "@/server/services/petroleum-seismic-service";

export async function GET(request: NextRequest) {
  const filters = parsePetroleumFilters(new URL(request.url).searchParams);
  const data = await getPetroleumSeismicFeatures(filters);

  return NextResponse.json({ data });
}
