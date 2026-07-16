import type { Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { DistressModuleKpiStrip } from "@/components/distress/distress-module-kpis";
import { DistressModuleTable } from "@/components/distress/distress-module-table";
import { DistressNjord } from "@/components/distress/distress-njord";
import { DistressSectorHealth } from "@/components/distress/distress-sector-health";
import { safeAuth } from "@/lib/auth";
import { DistressSearchFilters, DistressSortKey } from "@/lib/types";
import { getDistressModuleForWorkspace } from "@/server/services/distress-analysis-service";

const DISTRESS_SORT_KEYS = new Set<DistressSortKey>([
  "healthScore_asc",
  "healthScore_desc",
  "liquidityRatio_asc",
  "liquidityRatio_desc",
  "realizableAssets_asc",
  "realizableAssets_desc",
]);

const PAGE_SIZE = 50;
/** Weakest companies first — the question the module exists to answer. Unscored rows sort last. */
const DEFAULT_SORT: DistressSortKey = "healthScore_asc";

function toSingle(value: string | string[] | undefined) {
  const candidate = Array.isArray(value) ? value[0] : value;
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : undefined;
}

function toNumber(value: string | string[] | undefined) {
  const candidate = toSingle(value);
  if (!candidate) {
    return undefined;
  }

  const parsed = Number(candidate);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toSort(value: string | string[] | undefined) {
  const candidate = toSingle(value);
  return candidate && DISTRESS_SORT_KEYS.has(candidate as DistressSortKey) ? (candidate as DistressSortKey) : undefined;
}

function buildFilters(query: Record<string, string | string[] | undefined>): DistressSearchFilters {
  const status = toSingle(query.status);

  return {
    query: toSingle(query.query),
    status: status ? ([status] as DistressSearchFilters["status"]) : undefined,
    sectorCodes: toSingle(query.sectorCode) ? [toSingle(query.sectorCode) as string] : undefined,
    page: toNumber(query.page) ?? 0,
    size: PAGE_SIZE,
    sort: toSort(query.sort) ?? DEFAULT_SORT,
    // The module is a full screener, not a curated shortlist: never silently hide candidates.
    view: "ALL",
  };
}

function buildPageHref(
  workspaceId: string,
  query: Record<string, string | string[] | undefined>,
  page: number,
): Route {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (key === "page") {
      continue;
    }

    const single = toSingle(value);
    if (single) {
      params.set(key, single);
    }
  }

  params.set("page", String(page));
  return `/workspaces/${workspaceId}/distress?${params.toString()}` as Route;
}

export default async function DistressModulePage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await safeAuth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const [{ workspaceId }, query] = await Promise.all([params, searchParams]);
  const filters = buildFilters(query);
  const distressModule = await getDistressModuleForWorkspace(session.user.id, workspaceId, filters);

  const canGoBack = distressModule.page > 0;
  const hasNextPage = (distressModule.page + 1) * distressModule.size < distressModule.totalCount;
  const activeSectorCode = toSingle(query.sectorCode);

  return (
    <main className="flex flex-col gap-8 pb-16">
      <div>
        <div className="data-label text-[11px] text-[var(--px-accent)]">Distress-modul</div>
        <h1 className="editorial-display mt-2.5 text-[38px] leading-[1.03] text-[var(--px-text)]">
          Finn hvilke selskaper som er konkurs
        </h1>
        <p className="mt-2.5 max-w-[70ch] text-sm text-[var(--px-muted)]">
          Selskaper under konkurs, avvikling eller restrukturering — med verdivurdering og bransjepress for oppkjøps- og
          motpartsanalyse.
        </p>
      </div>

      <DistressModuleKpiStrip kpis={distressModule.kpis} />

      <DistressModuleTable
        workspaceId={workspaceId}
        rows={distressModule.items}
        totalCount={distressModule.totalCount}
        filterOptions={distressModule.filterOptions}
        searchParams={query}
        activeSort={filters.sort ?? DEFAULT_SORT}
      />

      {distressModule.totalCount > distressModule.size ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-[var(--px-muted)]">
            Viser {(distressModule.page * distressModule.size + 1).toLocaleString("nb-NO")}–
            {Math.min((distressModule.page + 1) * distressModule.size, distressModule.totalCount).toLocaleString("nb-NO")} av{" "}
            {distressModule.totalCount.toLocaleString("nb-NO")} selskaper.
          </div>
          <div className="flex gap-2">
            {canGoBack ? (
              <Link
                href={buildPageHref(workspaceId, query, distressModule.page - 1)}
                className="rounded-full border border-[var(--px-border)] bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:text-slate-950"
              >
                Forrige
              </Link>
            ) : null}
            {hasNextPage ? (
              <Link
                href={buildPageHref(workspaceId, query, distressModule.page + 1)}
                className="rounded-full bg-[var(--px-action)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--px-action-hover)]"
              >
                Neste
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}

      <DistressSectorHealth
        workspaceId={workspaceId}
        sectors={distressModule.sectors}
        searchParams={query}
        activeSectorCode={activeSectorCode}
      />

      {/* Njord answers over every distress profile, not the filtered table, so it counts them all. */}
      <DistressNjord workspaceId={workspaceId} universeCount={distressModule.distressUniverseCount} />
    </main>
  );
}
