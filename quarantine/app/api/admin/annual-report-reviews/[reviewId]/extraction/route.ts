import { NextRequest, NextResponse } from "next/server";

import { requireFinancialReviewer } from "@/lib/admin-auth";
import { tryParseRouteIds } from "@/lib/api-input";
import { LocalAnnualReportArtifactStorage } from "@/server/financials/artifact-storage";
import { getAdminReviewDetail } from "@/server/persistence/annual-report-review-repository";

const storage = new LocalAnnualReportArtifactStorage();

/**
 * Returns the EXTRACTION_JSON artifact for a review — used by the "As Reported"
 * view in the manual review UI to show every extracted table row before
 * canonical mapping.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ reviewId: string }> },
) {
  const { user, error } = await requireFinancialReviewer();
  if (error) return error;
  void user;

  const routeIds = tryParseRouteIds(await params, ["reviewId"] as const);
  if (!routeIds) {
    return NextResponse.json({ error: "Ugyldig review-ID." }, { status: 400 });
  }
  const { reviewId } = routeIds;

  const review = await getAdminReviewDetail(reviewId);
  if (!review) {
    return NextResponse.json({ error: "Review ikke funnet." }, { status: 404 });
  }

  const extractionArtifact = review.filing.artifacts.find(
    (a) => a.artifactType === "EXTRACTION_JSON",
  );
  if (!extractionArtifact) {
    return NextResponse.json(
      { error: "Ingen EXTRACTION_JSON-artefakt funnet for dette review." },
      { status: 404 },
    );
  }

  try {
    const buffer = await storage.getArtifactBuffer(extractionArtifact.storageKey);
    const raw = JSON.parse(buffer.toString("utf-8")) as Record<string, unknown>;

    return NextResponse.json({
      engine: raw.engine ?? null,
      mode: raw.mode ?? null,
      rows: Array.isArray(raw.rows) ? raw.rows : [],
      mappedFacts: Array.isArray(raw.mappedFacts) ? raw.mappedFacts : [],
    });
  } catch {
    return NextResponse.json(
      { error: "Kunne ikke laste ekstraheringsdata." },
      { status: 500 },
    );
  }
}
