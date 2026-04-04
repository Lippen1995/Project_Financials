import { NextRequest, NextResponse } from "next/server";

import {
  PETROLEUM_DEFAULT_COMPARISON,
  PETROLEUM_DEFAULT_GRANULARITY,
  PETROLEUM_DEFAULT_PRODUCT,
  PETROLEUM_DEFAULT_SERIES_ENTITY_TYPE,
  PETROLEUM_DEFAULT_VIEW,
  parseArrayParam,
  parsePetroleumFilters,
} from "@/lib/petroleum-market";
import { getPetroleumMarketTimeseries } from "@/server/services/petroleum-market-service";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const filters = parsePetroleumFilters(searchParams);
  const entityIds = parseArrayParam(searchParams.get("entityIds"));
  const measures = parseArrayParam(searchParams.get("measures")) as Array<
    "oil" | "gas" | "condensate" | "ngl" | "liquids" | "oe" | "producedWater" | "investments"
  >;
  const data = await getPetroleumMarketTimeseries({
    filters,
    entityType:
      (searchParams.get("entityType") as "field" | "operator" | "area" | null) ??
      PETROLEUM_DEFAULT_SERIES_ENTITY_TYPE,
    entityIds,
    granularity:
      (searchParams.get("granularity") as "month" | "year" | null) ?? PETROLEUM_DEFAULT_GRANULARITY,
    measures: measures.length ? measures : ["oe", "investments"],
    product:
      (searchParams.get("product") as
        | "oil"
        | "gas"
        | "ngl"
        | "condensate"
        | "liquids"
        | "oe"
        | "producedWater"
        | null) ?? PETROLEUM_DEFAULT_PRODUCT,
    view: (searchParams.get("view") as "volume" | "rate" | null) ?? PETROLEUM_DEFAULT_VIEW,
    comparison:
      (searchParams.get("comparison") as "none" | "yoy" | "ytd" | "forecast" | null) ??
      PETROLEUM_DEFAULT_COMPARISON,
  });

  return NextResponse.json({ data });
}
