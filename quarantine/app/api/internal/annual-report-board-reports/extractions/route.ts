import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireFinancialReviewer } from "@/lib/admin-auth";
import { norwegianOrganizationNumberSchema } from "@/lib/norwegian-organization-number";
import { listPendingBoardReportExtractions } from "@/server/persistence/board-report-extraction-repository";
import {
  BoardReportExtractionError,
  BoardReportExtractionService,
} from "@/server/services/board-report-extraction-service";

const sharedFields = {
  publish: z.boolean().optional(),
};

const requestSchema = z.union([
  z
    .object({
      filingId: z.string().min(1),
      ...sharedFields,
    })
    .strict(),
  z
    .object({
      orgNumber: norwegianOrganizationNumberSchema,
      fiscalYear: z.number().int().min(1990).max(new Date().getFullYear()),
      ...sharedFields,
    })
    .strict(),
]);

const limitSchema = z.coerce.number().int().min(1).max(200);

export async function GET(request: NextRequest) {
  const auth = await requireFinancialReviewer();
  if (auth.error) return auth.error;
  const parsedLimit = limitSchema.safeParse(request.nextUrl.searchParams.get("limit") ?? "50");
  if (!parsedLimit.success) {
    return NextResponse.json(
      { error: { code: "INVALID_LIMIT", message: "limit must be an integer from 1 to 200." } },
      { status: 400 },
    );
  }
  const data = await listPendingBoardReportExtractions(parsedLimit.data);
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const auth = await requireFinancialReviewer();
  if (auth.error) return auth.error;
  try {
    const input = requestSchema.parse(await request.json());
    const service = new BoardReportExtractionService();
    const data = "filingId" in input
      ? await service.extractForFiling(input.filingId, { publish: input.publish })
      : await service.extractForCompanyYear(input.orgNumber!, input.fiscalYear!, {
          publish: input.publish,
        });
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    const validationError = error instanceof z.ZodError;
    const extractionError = error instanceof BoardReportExtractionError ? error : null;
    return NextResponse.json(
      {
        error: {
          code: validationError
            ? "INVALID_EXTRACTION_REQUEST"
            : extractionError
              ? extractionError.code
              : "FAILED",
          message: error instanceof Error ? error.message : "Board-report extraction failed.",
        },
      },
      { status: validationError ? 400 : extractionError?.code === "SOURCE_UNAVAILABLE" ? 404 : 500 },
    );
  }
}
