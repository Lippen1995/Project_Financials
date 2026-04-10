import { NextRequest, NextResponse } from "next/server";

import { getPetroleumFiscalSnapshots } from "@/server/services/petroleum-market-macro-service";

export async function GET(request: NextRequest) {
  const jurisdiction = new URL(request.url).searchParams.get("jurisdiction")?.trim() || "NO";
  const data = await getPetroleumFiscalSnapshots(jurisdiction);
  return NextResponse.json({ data });
}
