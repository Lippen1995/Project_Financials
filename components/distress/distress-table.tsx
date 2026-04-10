import Link from "next/link";

import { DistressCompanyRow, DistressSortKey } from "@/lib/types";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";

type SortDirection = "asc" | "desc";

const SORTABLE_COLUMNS: Record<
  string,
  {
    desc: DistressSortKey;
    asc: DistressSortKey;
    defaultDirection: SortDirection;
  }
> = {
  company: {
    desc: "name_desc",
    asc: "name_asc",
    defaultDirection: "asc",
  },
  distressStatus: {
    desc: "distressStatus_desc",
    asc: "distressStatus_asc",
    defaultDirection: "asc",
  },
  daysInStatus: {
    desc: "daysInStatus_desc",
    asc: "daysInStatus_asc",
    defaultDirection: "desc",
  },
  industryCode: {
    desc: "industryCode_desc",
    asc: "industryCode_asc",
    defaultDirection: "asc",
  },
  sector: {
    desc: "sector_desc",
    asc: "sector_asc",
    defaultDirection: "asc",
  },
  lastReportedYear: {
    desc: "lastReportedYear_desc",
    asc: "lastReportedYear_asc",
    defaultDirection: "desc",
  },
  revenue: {
    desc: "revenue_desc",
    asc: "revenue_asc",
    defaultDirection: "desc",
  },
  ebit: {
    desc: "ebit_desc",
    asc: "ebit_asc",
    defaultDirection: "desc",
  },
  netIncome: {
    desc: "netIncome_desc",
    asc: "netIncome_asc",
    defaultDirection: "desc",
  },
  equityRatio: {
    desc: "equityRatio_desc",
    asc: "equityRatio_asc",
    defaultDirection: "desc",
  },
  assets: {
    desc: "assets_desc",
    asc: "assets_asc",
    defaultDirection: "desc",
  },
  interestBearingDebt: {
    desc: "interestBearingDebt_desc",
    asc: "interestBearingDebt_asc",
    defaultDirection: "desc",
  },
};

function toArray(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value.map((item) => item.trim()).filter(Boolean);
  }

  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }

  return [];
}

function formatPercent(value?: number | null) {
  if (value === null || value === undefined) {
    return "Ikke tilgjengelig";
  }

  return `${new Intl.NumberFormat("nb-NO", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value)} %`;
}

function getCoverageLabel(value: string) {
  switch (value) {
    case "FINANCIALS_AVAILABLE":
      return "Regnskap tilgjengelig";
    case "FINANCIALS_PARTIAL":
      return "Delvis regnskap";
    default:
      return "Regnskap mangler";
  }
}

function buildQueryString(searchParams: Record<string, string | string[] | undefined>, nextSort?: DistressSortKey) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (key === "sort" || key === "page") {
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

  params.set("page", "0");

  if (nextSort) {
    params.set("sort", nextSort);
  }

  return params.toString();
}

function getNextSort(currentSort: DistressSortKey | undefined, columnKey: keyof typeof SORTABLE_COLUMNS) {
  const config = SORTABLE_COLUMNS[columnKey];

  if (currentSort === config.desc) {
    return config.asc;
  }

  if (currentSort === config.asc) {
    return undefined;
  }

  return config.defaultDirection === "desc" ? config.desc : config.asc;
}

function getSortIndicator(currentSort: DistressSortKey | undefined, columnKey: keyof typeof SORTABLE_COLUMNS) {
  const config = SORTABLE_COLUMNS[columnKey];

  if (currentSort === config.desc) {
    return "v";
  }

  if (currentSort === config.asc) {
    return "^";
  }

  return "";
}

function SortableHeader({
  label,
  columnKey,
  workspaceId,
  searchParams,
  currentSort,
}: {
  label: string;
  columnKey: keyof typeof SORTABLE_COLUMNS;
  workspaceId: string;
  searchParams: Record<string, string | string[] | undefined>;
  currentSort: DistressSortKey | undefined;
}) {
  const nextSort = getNextSort(currentSort, columnKey);
  const indicator = getSortIndicator(currentSort, columnKey);
  const queryString = buildQueryString(searchParams, nextSort);

  return (
    <th className="data-label px-5 py-4 font-medium">
      <Link
        href={`/workspaces/${workspaceId}/distress/search?${queryString}`}
        className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-950"
      >
        <span>{label}</span>
        <span className={cn("min-w-2 text-[11px] uppercase text-slate-400", indicator ? "text-slate-700" : "")}>
          {indicator || ".."}
        </span>
      </Link>
    </th>
  );
}

export function DistressTable({
  workspaceId,
  rows,
  searchParams,
}: {
  workspaceId: string;
  rows: DistressCompanyRow[];
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const currentSortValues = toArray(searchParams.sort);
  const currentSort = currentSortValues[0] as DistressSortKey | undefined;

  if (rows.length === 0) {
    return (
      <div className="border border-dashed border-[rgba(15,23,42,0.14)] bg-[rgba(255,255,255,0.7)] p-8 text-center text-sm text-slate-600">
        Ingen distress-kandidater matchet filtrene dine.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto border border-[rgba(15,23,42,0.08)] bg-white">
      <table className="min-w-[1300px] divide-y divide-[rgba(15,23,42,0.08)] text-sm">
        <thead className="bg-[rgba(248,249,250,0.72)]">
          <tr className="text-left text-slate-600">
            <SortableHeader
              label="Selskap"
              columnKey="company"
              workspaceId={workspaceId}
              searchParams={searchParams}
              currentSort={currentSort}
            />
            <SortableHeader
              label="Distress-status"
              columnKey="distressStatus"
              workspaceId={workspaceId}
              searchParams={searchParams}
              currentSort={currentSort}
            />
            <SortableHeader
              label="Dager i status"
              columnKey="daysInStatus"
              workspaceId={workspaceId}
              searchParams={searchParams}
              currentSort={currentSort}
            />
            <SortableHeader
              label="Naeringskode"
              columnKey="industryCode"
              workspaceId={workspaceId}
              searchParams={searchParams}
              currentSort={currentSort}
            />
            <SortableHeader
              label="Sektor"
              columnKey="sector"
              workspaceId={workspaceId}
              searchParams={searchParams}
              currentSort={currentSort}
            />
            <SortableHeader
              label="Siste aar"
              columnKey="lastReportedYear"
              workspaceId={workspaceId}
              searchParams={searchParams}
              currentSort={currentSort}
            />
            <SortableHeader
              label="Inntekter"
              columnKey="revenue"
              workspaceId={workspaceId}
              searchParams={searchParams}
              currentSort={currentSort}
            />
            <SortableHeader
              label="EBIT"
              columnKey="ebit"
              workspaceId={workspaceId}
              searchParams={searchParams}
              currentSort={currentSort}
            />
            <SortableHeader
              label="Aarsresultat"
              columnKey="netIncome"
              workspaceId={workspaceId}
              searchParams={searchParams}
              currentSort={currentSort}
            />
            <SortableHeader
              label="Egenkapitalandel"
              columnKey="equityRatio"
              workspaceId={workspaceId}
              searchParams={searchParams}
              currentSort={currentSort}
            />
            <SortableHeader
              label="Eiendeler"
              columnKey="assets"
              workspaceId={workspaceId}
              searchParams={searchParams}
              currentSort={currentSort}
            />
            <SortableHeader
              label="Rentebaerende gjeld"
              columnKey="interestBearingDebt"
              workspaceId={workspaceId}
              searchParams={searchParams}
              currentSort={currentSort}
            />
            <th className="data-label px-5 py-4 font-medium">Score</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[rgba(15,23,42,0.06)]">
          {rows.map((row) => (
            <tr key={row.company.orgNumber} className="hover:bg-[rgba(248,249,250,0.72)]">
              <td className="px-5 py-4 align-top">
                <Link
                  href={`/workspaces/${workspaceId}/distress/companies/${row.company.orgNumber}`}
                  className="font-semibold text-[#162233] hover:text-[#31495f]"
                >
                  {row.company.name}
                </Link>
                <div className="text-xs text-slate-500">{row.company.orgNumber}</div>
                <div className="mt-1 text-xs text-slate-500">{getCoverageLabel(row.dataCoverage)}</div>
              </td>
              <td className="px-5 py-4 align-top">
                <div className="font-semibold text-slate-900">{row.distress.label}</div>
                <div className="text-xs text-slate-500">{row.distress.lastAnnouncementTitle ?? "Ingen siste hendelse"}</div>
              </td>
              <td className="px-5 py-4 align-top">{formatNumber(row.distress.daysInStatus)}</td>
              <td className="px-5 py-4 align-top">
                {row.company.industryCode?.code}
                {row.company.industryCode?.title ? ` ${row.company.industryCode.title}` : ""}
              </td>
              <td className="px-5 py-4 align-top">
                {row.sector?.code}
                {row.sector?.label ? ` ${row.sector.label}` : ""}
              </td>
              <td className="px-5 py-4 align-top">{formatNumber(row.financials.lastReportedYear)}</td>
              <td className="px-5 py-4 align-top">{formatCurrency(row.financials.revenue)}</td>
              <td className="px-5 py-4 align-top">{formatCurrency(row.financials.ebit)}</td>
              <td className="px-5 py-4 align-top">{formatCurrency(row.financials.netIncome)}</td>
              <td className="px-5 py-4 align-top">{formatPercent(row.financials.equityRatio)}</td>
              <td className="px-5 py-4 align-top">{formatCurrency(row.financials.assets)}</td>
              <td className="px-5 py-4 align-top">{formatCurrency(row.financials.interestBearingDebt)}</td>
              <td className="px-5 py-4 align-top text-slate-500">Kommer</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
