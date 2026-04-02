import { NextRequest, NextResponse } from "next/server";

import { safeAuth } from "@/lib/auth";
import { DistressSearchFilters } from "@/lib/types";
import { listDistressCompaniesForWorkspace } from "@/server/services/distress-analysis-service";

const DISTRESS_SORT_KEYS = new Set<NonNullable<DistressSearchFilters["sort"]>>([
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
]);

function toNumber(value: string | null) {
  if (!value || !value.trim()) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toArray(values: string[]) {
  return values.map((value) => value.trim()).filter(Boolean);
}

function toSort(value: string | null) {
  return value && DISTRESS_SORT_KEYS.has(value as NonNullable<DistressSearchFilters["sort"]>)
    ? (value as NonNullable<DistressSearchFilters["sort"]>)
    : undefined;
}

function toView(value: string | null) {
  return value === "ALL" ? "ALL" : "BEST_FIT";
}

function parseFilters(request: NextRequest): DistressSearchFilters {
  const { searchParams } = request.nextUrl;
  const statuses = toArray(searchParams.getAll("status"));
  const sectorCodes = toArray(searchParams.getAll("sectorCode"));

  return {
    status: statuses.length > 0 ? (statuses as DistressSearchFilters["status"]) : undefined,
    minDaysInStatus: toNumber(searchParams.get("minDaysInStatus")),
    maxDaysInStatus: toNumber(searchParams.get("maxDaysInStatus")),
    industryCodePrefix: searchParams.get("industryCodePrefix") ?? undefined,
    sectorCodes: sectorCodes.length > 0 ? sectorCodes : undefined,
    lastReportedYearFrom: toNumber(searchParams.get("lastReportedYearFrom")),
    lastReportedYearTo: toNumber(searchParams.get("lastReportedYearTo")),
    page: toNumber(searchParams.get("page")) ?? 0,
    size: toNumber(searchParams.get("size")) ?? 50,
    sort: toSort(searchParams.get("sort")),
    view: toView(searchParams.get("view")),
  };
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ workspaceId: string }> },
) {
  const session = await safeAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { workspaceId } = await context.params;
    const data = await listDistressCompaniesForWorkspace(session.user.id, workspaceId, parseFilters(request));
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke hente distress-screening." },
      { status: 400 },
    );
  }
}
