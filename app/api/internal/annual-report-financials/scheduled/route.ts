import { NextRequest, NextResponse } from "next/server";

import env from "@/lib/env";
import { runScheduledAnnualReportFinancialSync } from "@/server/services/annual-report-financials-scheduler-service";

function isAuthorized(request: NextRequest) {
  if (!env.financialsSyncSecret) {
    return false;
  }

  const bearer = request.headers.get("authorization");
  if (bearer === `Bearer ${env.financialsSyncSecret}`) {
    return true;
  }

  const headerSecret = request.headers.get("x-financials-sync-secret");
  return headerSecret === env.financialsSyncSecret;
}

async function handle(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const retryLimit = Number(
      request.nextUrl.searchParams.get("lowConfidenceRetryLimit") ?? "0",
    );
    const data = await runScheduledAnnualReportFinancialSync({
      lowConfidenceRetryLimit: Number.isFinite(retryLimit) ? retryLimit : 0,
    });

    return NextResponse.json(
      { job: "scheduled-annual-report-sync", data },
      { status: data.skipped ? 200 : 200 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Kunne ikke kjore planlagt annual-report financial sync.",
      },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
