import type { Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { DistressFilterPanel } from "@/components/distress/distress-filter-panel";
import { DistressTable } from "@/components/distress/distress-table";
import { Card } from "@/components/ui/card";
import { safeAuth } from "@/lib/auth";
import { DistressSearchFilters } from "@/lib/types";
import {
  getDistressFilterOptionsForWorkspace,
  listDistressCompaniesForWorkspace,
} from "@/server/services/distress-analysis-service";
import { getDashboardWorkspaceHome } from "@/server/services/workspace-service";

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

function toNumber(value: string | string[] | undefined) {
  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toArray(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value.map((item) => item.trim()).filter(Boolean);
  }

  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }

  return [];
}

function toSort(value: string | string[] | undefined) {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && DISTRESS_SORT_KEYS.has(candidate as NonNullable<DistressSearchFilters["sort"]>)
    ? (candidate as NonNullable<DistressSearchFilters["sort"]>)
    : undefined;
}

function toView(value: string | string[] | undefined) {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate === "ALL" ? "ALL" : "BEST_FIT";
}

function buildFilters(searchParams: Record<string, string | string[] | undefined>): DistressSearchFilters {
  const statuses = toArray(searchParams.status);
  const sectorCodes = toArray(searchParams.sectorCode);

  return {
    status: statuses.length > 0 ? (statuses as DistressSearchFilters["status"]) : undefined,
    minDaysInStatus: toNumber(searchParams.minDaysInStatus),
    maxDaysInStatus: toNumber(searchParams.maxDaysInStatus),
    industryCodePrefix:
      typeof searchParams.industryCodePrefix === "string" && searchParams.industryCodePrefix.trim()
        ? searchParams.industryCodePrefix.trim()
        : undefined,
    sectorCodes: sectorCodes.length > 0 ? sectorCodes : undefined,
    lastReportedYearFrom: toNumber(searchParams.lastReportedYearFrom),
    lastReportedYearTo: toNumber(searchParams.lastReportedYearTo),
    page: toNumber(searchParams.page) ?? 0,
    size: toNumber(searchParams.size) ?? 50,
    sort: toSort(searchParams.sort),
    view: toView(searchParams.view),
  };
}

function appendSearchParams(params: URLSearchParams, searchParams: Record<string, string | string[] | undefined>) {
  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item.trim()) {
          params.append(key, item);
        }
      }
      continue;
    }

    if (typeof value === "string" && value.trim()) {
      params.set(key, value);
    }
  }
}

function buildPageHref(
  workspaceId: string,
  searchParams: Record<string, string | string[] | undefined>,
  page: number,
): Route {
  const params = new URLSearchParams();
  appendSearchParams(params, searchParams);
  params.set("page", String(page));
  return `/workspaces/${workspaceId}/distress?${params.toString()}` as Route;
}

function buildViewHref(
  workspaceId: string,
  searchParams: Record<string, string | string[] | undefined>,
  view: "BEST_FIT" | "ALL",
): Route {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (key === "view" || key === "page") {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item.trim()) {
          params.append(key, item);
        }
      }
      continue;
    }

    if (typeof value === "string" && value.trim()) {
      params.set(key, value);
    }
  }

  params.set("view", view);
  params.set("page", "0");

  return `/workspaces/${workspaceId}/distress?${params.toString()}` as Route;
}

export default async function DistressWorkspacePage({
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
  const [workspaceHome, screening, filterOptions] = await Promise.all([
    getDashboardWorkspaceHome(session.user.id, workspaceId),
    listDistressCompaniesForWorkspace(session.user.id, workspaceId, filters),
    getDistressFilterOptionsForWorkspace(session.user.id, workspaceId),
  ]);

  const canGoBack = screening.page > 0;
  const hasNextPage = (screening.page + 1) * screening.size < screening.totalCount;
  const isBestFitView = screening.view === "BEST_FIT";

  return (
    <main className="space-y-8 pb-10">
      <section className="grid gap-0 border border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.78)] xl:grid-cols-[minmax(0,1.45fr),360px]">
        <div className="p-8">
          <div className="data-label inline-flex rounded-full border border-[rgba(15,23,42,0.1)] bg-white px-3 py-1 text-[11px] font-semibold uppercase text-slate-600">
            Distress workspace
          </div>
          <h1 className="editorial-display mt-5 max-w-5xl text-[3rem] leading-[0.98] text-slate-950 sm:text-[4rem]">
            Screen distress-selskaper i {workspaceHome.currentWorkspace.name}.
          </h1>
          <p className="mt-4 max-w-3xl text-[1.02rem] leading-8 text-slate-600">
            Denne arbeidsflaten samler alle kjente distress-kandidater med offisiell status, varighet i status og siste tilgjengelige regnskapssignal nar det finnes.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/dashboard"
              className="rounded-full border border-[rgba(15,23,42,0.1)] bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-[rgba(15,23,42,0.18)] hover:text-slate-950"
            >
              Til dashboard
            </Link>
          </div>
        </div>

        <aside className="border-t border-[rgba(15,23,42,0.08)] bg-[#192536] p-8 text-white xl:border-l xl:border-t-0">
          <div className="data-label text-[11px] font-semibold uppercase text-white/60">Screening</div>
          <div className="mt-4 text-[1.45rem] font-semibold leading-tight">
            {screening.totalUniverseCount} distress-kandidater i arbeidsflaten
          </div>
          <p className="mt-4 text-sm leading-7 text-white/76">
            {isBestFitView
              ? "Prioritert visning favoriserer rekonstruksjon, konkurs og selskaper med sterkere ferske signaler."
              : "Du ser hele distress-universet. Standardrekkefolgen starter med varighet i status, deretter siste hendelse og selskapsnavn."}
          </p>
        </aside>
      </section>

      <section className="grid gap-6 xl:grid-cols-[320px,minmax(0,1fr)]">
        <div className="space-y-6">
          <div className="border-t border-[rgba(15,23,42,0.12)] pt-4">
            <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Filtrering</div>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              Kombiner status, varighet, naeringskode og regnskapsar for a snevre inn kandidatlisten.
            </p>
          </div>
          <DistressFilterPanel searchParams={query} filterOptions={filterOptions} />
        </div>

        <div className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[rgba(15,23,42,0.08)] pb-4">
            <div>
              <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Treff</div>
              <h2 className="mt-2 text-[1.8rem] font-semibold text-slate-950">
                {screening.totalCount} selskaper funnet
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                {isBestFitView
                  ? `Viser et prioritert utdrag av ${screening.totalUniverseCount} totale distress-kandidater.`
                  : "Viser hele distress-universet som matcher filtrene dine."}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-full border border-[rgba(15,23,42,0.08)] bg-white p-1">
                <Link
                  href={buildViewHref(workspaceId, query, "BEST_FIT")}
                  className={`rounded-full px-3 py-2 text-sm font-semibold ${
                    isBestFitView ? "bg-[#162233] text-white" : "text-slate-600 hover:text-slate-950"
                  }`}
                >
                  Prioritert visning
                </Link>
                <Link
                  href={buildViewHref(workspaceId, query, "ALL")}
                  className={`rounded-full px-3 py-2 text-sm font-semibold ${
                    !isBestFitView ? "bg-[#162233] text-white" : "text-slate-600 hover:text-slate-950"
                  }`}
                >
                  Alle treff
                </Link>
              </div>
              <div className="text-sm text-slate-500">
                Side {screening.page + 1} · {screening.size} per side
              </div>
            </div>
          </div>

          <DistressTable workspaceId={workspaceId} rows={screening.items} searchParams={query} />

          <Card className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-slate-600">
              Viser {screening.items.length} av {screening.totalCount} {isBestFitView ? "prioriterte " : ""}distress-kandidater.
            </div>
            <div className="flex gap-2">
              {canGoBack ? (
                <Link
                  href={buildPageHref(workspaceId, query, screening.page - 1)}
                  className="rounded-full border border-[rgba(15,23,42,0.1)] bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-[rgba(15,23,42,0.18)] hover:text-slate-950"
                >
                  Forrige
                </Link>
              ) : null}
              {hasNextPage ? (
                <Link
                  href={buildPageHref(workspaceId, query, screening.page + 1)}
                  className="rounded-full bg-[#162233] px-4 py-2 text-sm font-semibold text-white hover:bg-[#223246]"
                >
                  Neste
                </Link>
              ) : null}
            </div>
          </Card>
        </div>
      </section>
    </main>
  );
}
