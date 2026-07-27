import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireFinancialReviewer } from "@/lib/admin-auth";
import { norwegianOrganizationNumberSchema } from "@/lib/norwegian-organization-number";
import {
  buildPdfParserRouteCanaryPreviewReport,
  DEFAULT_PDF_PARSER_ROUTE_CANARY_CONFIG,
} from "@/server/services/pdf-parser-route-canary-config-service";

const querySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  fiscalYear: z
    .string()
    .optional()
    .transform((v) => (v !== undefined ? parseInt(v, 10) : undefined))
    .pipe(z.number().int().min(2000).max(2100).optional()),
  organizationNumber: norwegianOrganizationNumberSchema.optional(),
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
    const report = await buildPdfParserRouteCanaryPreviewReport({
      ...parsed.data,
      config: DEFAULT_PDF_PARSER_ROUTE_CANARY_CONFIG,
    });

    return NextResponse.json({ data: report });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error.";
    return NextResponse.json(
      { error: "Could not generate canary preview report.", detail: message },
      { status: 500 },
    );
  }
}
