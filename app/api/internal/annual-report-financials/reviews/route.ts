import { NextRequest, NextResponse } from "next/server";

import env from "@/lib/env";
import {
  listAnnualReportReviewQueue,
  updateAnnualReportReview,
} from "@/server/services/annual-report-financials-service";

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
    const data = await listAnnualReportReviewQueue({
      statuses:
        readListParam(request, "status").length > 0
          ? (readListParam(request, "status") as
              | (
                  | "PENDING_REVIEW"
                  | "ACCEPTED"
                  | "REJECTED"
                  | "REPROCESS_REQUESTED"
                  | "RESOLVED_BY_NEW_RUN"
                )[])
          : undefined,
      ruleCodes: readListParam(request, "rule"),
      orgNumbers: readListParam(request, "org"),
      limit: Number(request.nextUrl.searchParams.get("limit") ?? "50"),
    });

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Kunne ikke hente review-kø for årsrapporter.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    if (!body?.reviewId || !body?.status) {
      return NextResponse.json(
        { error: "Mangler reviewId eller status." },
        { status: 400 },
      );
    }

    const data = await updateAnnualReportReview(
      body.reviewId,
      body.status,
      body.latestActionNote,
    );
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Kunne ikke oppdatere review-status.",
      },
      { status: 500 },
    );
  }
}
