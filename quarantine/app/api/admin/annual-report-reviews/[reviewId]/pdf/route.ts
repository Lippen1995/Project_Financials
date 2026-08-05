import { NextRequest, NextResponse } from "next/server";

import { requireFinancialReviewer } from "@/lib/admin-auth";
import { tryParseRouteIds } from "@/lib/api-input";
import { LocalAnnualReportArtifactStorage } from "@/server/financials/artifact-storage";
import { getAdminReviewDetail } from "@/server/persistence/annual-report-review-repository";

const storage = new LocalAnnualReportArtifactStorage();

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

  const pdfArtifact = review.filing.artifacts.find((a) => a.artifactType === "PDF");
  if (!pdfArtifact) {
    return NextResponse.json({ error: "Ingen PDF-artefakt funnet." }, { status: 404 });
  }

  try {
    const buffer = await storage.getArtifactBuffer(pdfArtifact.storageKey);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Kunne ikke laste PDF." }, { status: 500 });
  }
}
