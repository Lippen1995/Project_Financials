import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import env from "@/lib/env";
import { norwegianOrganizationNumberSchema } from "@/lib/norwegian-organization-number";
import {
  listAnnualReportReviewQueue,
  updateAnnualReportReview,
} from "@/server/services/annual-report-financials-service";

const reviewStatusSchema = z.enum([
  "PENDING_REVIEW",
  "ACCEPTED",
  "REJECTED",
  "REPROCESS_REQUESTED",
  "RESOLVED_BY_NEW_RUN",
]);
const listSchema = z.object({
  statuses: z.array(reviewStatusSchema).max(10).optional(),
  ruleCodes: z
    .array(z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9_.:-]+$/))
    .max(100),
  orgNumbers: z.array(norwegianOrganizationNumberSchema).max(100),
  limit: z.coerce.number().int().min(1).max(200),
});
const updateSchema = z
  .object({
    reviewId: z.string().trim().min(1).max(128),
    status: reviewStatusSchema,
    latestActionNote: z.string().trim().max(2_000).optional(),
  })
  .strict();

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
    const result = listSchema.safeParse({
      statuses: readListParam(request, "status"),
      ruleCodes: readListParam(request, "rule"),
      orgNumbers: readListParam(request, "org"),
      limit: request.nextUrl.searchParams.get("limit") ?? "50",
    });
    if (!result.success) {
      return NextResponse.json({ error: "Ugyldige køparametere." }, { status: 400 });
    }
    const data = await listAnnualReportReviewQueue({
      ...result.data,
      statuses: result.data.statuses?.length ? result.data.statuses : undefined,
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
    const result = updateSchema.safeParse(await request.json());
    if (!result.success) {
      return NextResponse.json({ error: "Ugyldig review-oppdatering." }, { status: 400 });
    }
    const data = await updateAnnualReportReview(
      result.data.reviewId,
      result.data.status,
      result.data.latestActionNote,
    );
    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Ugyldig JSON." }, { status: 400 });
    }
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
