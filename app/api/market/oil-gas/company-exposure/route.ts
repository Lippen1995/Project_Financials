import { NextResponse } from "next/server";

import {
  getPetroleumCompanyExposureSnapshots,
  syncPetroleumCompanyExposureSnapshots,
} from "@/server/services/petroleum-company-exposure-service";

export async function GET() {
  const data = await getPetroleumCompanyExposureSnapshots();
  return NextResponse.json({ data });
}

export async function POST() {
  await syncPetroleumCompanyExposureSnapshots();
  const data = await getPetroleumCompanyExposureSnapshots();
  return NextResponse.json({ data });
}
