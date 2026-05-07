import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireFinancialReviewer } from "@/lib/admin-auth";
import { DEFAULT_PDF_PARSER_ROUTE_CANARY_CONFIG } from "@/server/services/pdf-parser-route-canary-config-service";
import { buildPdfParserRouteAssignmentPreviewReport } from "@/server/services/pdf-parser-route-assignment-preview-service";

const querySchema = z.object({
  seed: z.string().trim().min(1).max(128).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  fiscalYear: z.coerce.number().int().min(2000).max(2100).optional(),
  organizationNumber: z.string().trim().min(1).max(20).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export async function GET(request: NextRequest) {
  const { error } = await requireFinancialReviewer();
  if (error) return error;

  const { searchParams } = request.nextUrl;
  const raw = Object.fromEntries(searchParams.entries());
  const parsed = querySchema.safeParse(raw);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query parameters.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const report = await buildPdfParserRouteAssignmentPreviewReport({
      ...parsed.data,
      config: DEFAULT_PDF_PARSER_ROUTE_CANARY_CONFIG,
    });

    return NextResponse.json({ data: report });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error.";
    return NextResponse.json(
      { error: "Could not build assignment preview.", detail: message },
      { status: 500 },
    );
  }
}
