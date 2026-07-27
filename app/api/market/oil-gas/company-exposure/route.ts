import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import {
  getPetroleumCompanyExposureSnapshots,
  syncPetroleumCompanyExposureSnapshots,
} from "@/server/services/petroleum-company-exposure-service";

export async function GET() {
  const data = await getPetroleumCompanyExposureSnapshots();
  return NextResponse.json({ data });
}

export async function POST() {
  const auth = await requireAdmin();
  if (auth.error) {
    return auth.error;
  }

  await syncPetroleumCompanyExposureSnapshots();
  const data = await getPetroleumCompanyExposureSnapshots();
  return NextResponse.json({ data });
}
