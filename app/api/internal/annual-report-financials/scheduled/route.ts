import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import env from "@/lib/env";
import { runScheduledAnnualReportFinancialSync } from "@/server/services/annual-report-financials-scheduler-service";

const querySchema = z.object({
  lowConfidenceRetryLimit: z
    .string()
    .regex(/^(?:0|[1-9]\d{0,2})$/)
    .transform(Number)
    .pipe(z.number().int().min(0).max(100)),
}).strict();

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

  const parsedQuery = querySchema.safeParse({
    lowConfidenceRetryLimit:
      request.nextUrl.searchParams.get("lowConfidenceRetryLimit") ?? "0",
  });
  if (!parsedQuery.success) {
    return NextResponse.json({ error: "Invalid scheduled sync query." }, { status: 400 });
  }

  try {
    const data = await runScheduledAnnualReportFinancialSync({
      lowConfidenceRetryLimit: parsedQuery.data.lowConfidenceRetryLimit,
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
