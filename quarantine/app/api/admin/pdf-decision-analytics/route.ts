import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireFinancialReviewer } from "@/lib/admin-auth";
import { norwegianOrganizationNumberSchema } from "@/lib/norwegian-organization-number";
import { LocalAnnualReportArtifactStorage } from "@/server/financials/artifact-storage";
import { listAnnualReportDecisionShadowRows } from "@/server/persistence/annual-report-decision-shadow-repository";
import { listPdfDecisionGoldSetItemsByFilingIds } from "@/server/persistence/pdf-decision-gold-set-repository";
import { evaluatePdfDecisionShadow } from "@/server/services/annual-report-pdf-decision-shadow-evaluation";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  fiscalYear: z.coerce.number().int().optional(),
  orgNumber: norwegianOrganizationNumberSchema.optional(),
});

export async function GET(request: NextRequest) {
  const { error } = await requireFinancialReviewer();
  if (error) return error;

  const parsed = querySchema.safeParse({
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
    fiscalYear: request.nextUrl.searchParams.get("fiscalYear") ?? undefined,
    orgNumber: request.nextUrl.searchParams.get("orgNumber") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ugyldig forespørsel.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const storage = new LocalAnnualReportArtifactStorage();

  try {
    const data = await evaluatePdfDecisionShadow(parsed.data, {
      listRows: listAnnualReportDecisionShadowRows,
      listGoldSetItems: listPdfDecisionGoldSetItemsByFilingIds,
      readArtifact: async (key) => {
        try {
          return await storage.getArtifactBuffer(key);
        } catch {
          return null;
        }
      },
    });
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json(
      { error: "Kunne ikke hente PDF Decision Analytics." },
      { status: 500 },
    );
  }
}
