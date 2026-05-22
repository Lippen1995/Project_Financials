import { NextResponse } from "next/server";

import { safeAuth } from "@/lib/auth";
import { searchCompaniesForProfile } from "@/server/services/user-profile-service";

export async function GET(request: Request) {
  const session = await safeAuth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") ?? "";
  const results = await searchCompaniesForProfile(query);

  return NextResponse.json({
    results,
    manualEntryAllowed: true,
  });
}
