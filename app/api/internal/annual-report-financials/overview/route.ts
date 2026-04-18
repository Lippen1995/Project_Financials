import { NextRequest, NextResponse } from "next/server";

import env from "@/lib/env";
import { getAnnualReportPipelineOverview } from "@/server/services/annual-report-financials-service";

function isAuthorized(request: NextRequest) {
  if (!env.workspaceSyncSecret) {
    return false;
  }

  const bearer = request.headers.get("authorization");
  if (bearer === `Bearer ${env.workspaceSyncSecret}`) {
    return true;
  }

  const headerSecret = request.headers.get("x-workspace-sync-secret");
  return headerSecret === env.workspaceSyncSecret;
}

function readListParam(request: NextRequest, key: string) {
  return request.nextUrl.searchParams
    .getAll(key)
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = await getAnnualReportPipelineOverview({
      orgNumbers: readListParam(request, "org"),
      sampleLimit: Number(request.nextUrl.searchParams.get("limit") ?? "20"),
    });
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Kunne ikke hente annual-report overview.",
      },
      { status: 500 },
    );
  }
}
