import { NextRequest, NextResponse } from "next/server";

import { queryPetroleumFiltersSchema } from "@/lib/petroleum-market";
import { getPetroleumSeismicFeatures } from "@/server/services/petroleum-seismic-service";

export async function GET(request: NextRequest) {
  const query = queryPetroleumFiltersSchema.safeParse(new URL(request.url).searchParams);
  if (!query.success) {
    return NextResponse.json({ error: "Invalid petroleum filters" }, { status: 400 });
  }
  const data = await getPetroleumSeismicFeatures(query.data);

  return NextResponse.json({ data });
}
