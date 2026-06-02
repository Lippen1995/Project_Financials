import { NextRequest, NextResponse } from "next/server";

import { requireFinancialReviewer } from "@/lib/admin-auth";
import { getCompaniesForKey } from "@/server/services/canonical-key-service";

export async function GET(request: NextRequest) {
  const { error } = await requireFinancialReviewer();
  if (error) return error;

  const key = request.nextUrl.searchParams.get("key");
  if (!key) {
    return NextResponse.json({ error: "Mangler 'key'-parameter." }, { status: 400 });
  }

  const companies = await getCompaniesForKey(key);
  return NextResponse.json({ data: { companies } });
}
