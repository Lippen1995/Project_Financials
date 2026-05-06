import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireFinancialReviewer } from "@/lib/admin-auth";
import type { PdfParserRoute } from "@/server/services/pdf-parser-route-quality-comparison-service";
import {
  buildPdfParserRouteRecommendationV2Report,
  validatePdfParserRouteRecommendationV2Report,
} from "@/server/services/pdf-parser-route-recommendation-v2-service";

const VALID_ROUTES: PdfParserRoute[] = ["OCR", "OPENDATALOADER_LOCAL", "HYBRID", "TEXT_LAYER"];

const querySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  fiscalYear: z
    .string()
    .optional()
    .transform((v) => (v !== undefined ? parseInt(v, 10) : undefined))
    .pipe(z.number().int().min(2000).max(2100).optional()),
  organizationNumber: z.string().trim().min(1).max(20).optional(),
  routes: z
    .string()
    .optional()
    .transform((v) =>
      v
        ? v
            .split(",")
            .map((r) => r.trim())
            .filter(Boolean)
        : undefined,
    )
    .pipe(
      z
        .array(z.enum(VALID_ROUTES as [PdfParserRoute, ...PdfParserRoute[]]))
        .optional(),
    ),
  limit: z
    .string()
    .optional()
    .transform((v) => (v !== undefined ? parseInt(v, 10) : undefined))
    .pipe(z.number().int().min(1).max(500).optional()),
});

export async function GET(request: NextRequest) {
  const { error } = await requireFinancialReviewer();
  if (error) return error;

  const { searchParams } = request.nextUrl;
  const rawQuery = Object.fromEntries(searchParams.entries());

  const parsed = querySchema.safeParse(rawQuery);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query parameters.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const report = await buildPdfParserRouteRecommendationV2Report(parsed.data);

    const { valid, issues } = validatePdfParserRouteRecommendationV2Report(report);
    if (!valid) {
      return NextResponse.json(
        { error: "Report validation failed.", details: issues },
        { status: 500 },
      );
    }

    return NextResponse.json({ data: report });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error.";
    return NextResponse.json(
      { error: "Could not generate route recommendation report.", detail: message },
      { status: 500 },
    );
  }
}
