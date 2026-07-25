import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { queryYearSchema, tryParseRouteIds } from "@/lib/api-input";
import { safeAuth } from "@/lib/auth";
import { DistressSearchFilters } from "@/lib/types";
import { listDistressCompaniesForWorkspace } from "@/server/services/distress-analysis-service";

const DISTRESS_SORT_KEYS = [
  "name_asc",
  "name_desc",
  "distressStatus_asc",
  "distressStatus_desc",
  "daysInStatus_desc",
  "daysInStatus_asc",
  "lastAnnouncementPublishedAt_desc",
  "lastAnnouncementPublishedAt_asc",
  "industryCode_asc",
  "industryCode_desc",
  "sector_asc",
  "sector_desc",
  "lastReportedYear_desc",
  "lastReportedYear_asc",
  "revenue_desc",
  "revenue_asc",
  "ebit_desc",
  "ebit_asc",
  "netIncome_desc",
  "netIncome_asc",
  "equityRatio_desc",
  "equityRatio_asc",
  "assets_desc",
  "assets_asc",
  "interestBearingDebt_desc",
  "interestBearingDebt_asc",
] as const;

const optionalQueryValue = (value: unknown) => {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  return value;
};

const optionalNonNegativeIntegerSchema = z.preprocess(
  optionalQueryValue,
  z.coerce.number().int().min(0).max(36_500).optional(),
);

const querySchema = z
  .object({
    status: z
      .array(
        z.enum([
          "RECONSTRUCTION",
          "BANKRUPTCY",
          "LIQUIDATION",
          "FORCED_PROCESS",
          "FOREIGN_INSOLVENCY",
          "OTHER_DISTRESS",
        ]),
      )
      .max(6),
    minDaysInStatus: optionalNonNegativeIntegerSchema,
    maxDaysInStatus: optionalNonNegativeIntegerSchema,
    industryCodePrefix: z.preprocess(
      optionalQueryValue,
      z
        .string()
        .regex(/^\d{1,2}(?:\.\d{1,3})?$/)
        .optional(),
    ),
    sectorCodes: z.array(z.string().regex(/^\d{2}$/)).max(100),
    lastReportedYearFrom: queryYearSchema,
    lastReportedYearTo: queryYearSchema,
    page: z.preprocess(
      optionalQueryValue,
      z.coerce.number().int().min(0).max(100_000).default(0),
    ),
    size: z.preprocess(
      optionalQueryValue,
      z.coerce.number().int().min(1).max(200).default(50),
    ),
    sort: z.preprocess(optionalQueryValue, z.enum(DISTRESS_SORT_KEYS).optional()),
    view: z.preprocess(
      optionalQueryValue,
      z.enum(["BEST_FIT", "ALL"]).default("BEST_FIT"),
    ),
  })
  .strict()
  .superRefine((values, ctx) => {
    if (
      values.minDaysInStatus !== undefined &&
      values.maxDaysInStatus !== undefined &&
      values.minDaysInStatus > values.maxDaysInStatus
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maxDaysInStatus"],
        message: "Maximum days must be greater than or equal to minimum days.",
      });
    }
    if (
      values.lastReportedYearFrom !== undefined &&
      values.lastReportedYearTo !== undefined &&
      values.lastReportedYearFrom > values.lastReportedYearTo
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lastReportedYearTo"],
        message: "Maximum year must be greater than or equal to minimum year.",
      });
    }
  })
  .transform(
    (values): DistressSearchFilters => ({
      ...values,
      status: values.status.length > 0 ? values.status : undefined,
      sectorCodes: values.sectorCodes.length > 0 ? values.sectorCodes : undefined,
    }),
  );

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ workspaceId: string }> },
) {
  const session = await safeAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const routeIds = tryParseRouteIds(await context.params, ["workspaceId"] as const);
    if (!routeIds) {
      return NextResponse.json({ error: "Ugyldig workspace-ID." }, { status: 400 });
    }
    const { workspaceId } = routeIds;
    const { searchParams } = request.nextUrl;
    const query = querySchema.safeParse({
      status: searchParams.getAll("status"),
      minDaysInStatus: searchParams.get("minDaysInStatus") ?? undefined,
      maxDaysInStatus: searchParams.get("maxDaysInStatus") ?? undefined,
      industryCodePrefix: searchParams.get("industryCodePrefix") ?? undefined,
      sectorCodes: searchParams.getAll("sectorCode").map((value) => value.trim()),
      lastReportedYearFrom: searchParams.get("lastReportedYearFrom") ?? undefined,
      lastReportedYearTo: searchParams.get("lastReportedYearTo") ?? undefined,
      page: searchParams.get("page") ?? undefined,
      size: searchParams.get("size") ?? undefined,
      sort: searchParams.get("sort") ?? undefined,
      view: searchParams.get("view") ?? undefined,
    });
    if (!query.success) {
      return NextResponse.json({ error: "Ugyldige distress-filtre." }, { status: 400 });
    }
    const data = await listDistressCompaniesForWorkspace(
      session.user.id,
      workspaceId,
      query.data,
    );
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke hente distress-screening." },
      { status: 400 },
    );
  }
}
