import { NextResponse } from "next/server";

import { getPetroleumMacroSummary } from "@/server/services/petroleum-market-macro-service";

export async function GET() {
  const data = await getPetroleumMacroSummary();
  return NextResponse.json({ data });
}
