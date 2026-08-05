import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireFinancialReviewer } from "@/lib/admin-auth";
import { norwegianOrganizationNumberSchema } from "@/lib/norwegian-organization-number";
import type { PdfParserRoute } from "@/server/services/pdf-parser-route-quality-comparison-service";
import {
  buildAndPersistPdfParserRouteRecommendationV2Snapshot,
  PdfModelArtifactSnapshotValidationError,
} from "@/server/services/pdf-model-artifact-snapshot-service";

const VALID_ROUTES: PdfParserRoute[] = ["OCR", "OPENDATALOADER_LOCAL", "HYBRID", "TEXT_LAYER"];

const bodySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  fiscalYear: z.number().int().min(2000).max(2100).optional(),
  organizationNumber: norwegianOrganizationNumberSchema.optional(),
  routes: z
    .array(z.enum(VALID_ROUTES as [PdfParserRoute, ...PdfParserRoute[]]))
    .optional(),
  limit: z.number().int().min(1).max(500).optional(),
});

export async function POST(request: NextRequest) {
  const { error, user } = await requireFinancialReviewer();
  if (error) return error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const result = await buildAndPersistPdfParserRouteRecommendationV2Snapshot({
      ...parsed.data,
      sourceCommand: "POST /api/admin/pdf-parser-route-recommendation-v2/snapshots",
      createdByUserId: user?.id ?? null,
    });

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (err) {
    if (err instanceof PdfModelArtifactSnapshotValidationError) {
      return NextResponse.json(
        { error: "Report validation failed.", detail: err.message },
        { status: 422 },
      );
    }
    const message = err instanceof Error ? err.message : "Unexpected error.";
    return NextResponse.json(
      { error: "Could not persist recommendation snapshot.", detail: message },
      { status: 500 },
    );
  }
}
