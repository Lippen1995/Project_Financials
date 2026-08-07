"use client";

import Link from "next/link";
import * as React from "react";

import {
  CompanyMapMap,
  type CompanyMapFeature,
  type CompanyMapViewport,
} from "@/components/company-map/company-map-map";

type CompanyMapCompany = {
  orgNumber: string;
  name: string;
  organisationForm: string | null;
  employeeCount: number | null;
  municipality: string | null;
  officialAddressId: string | null;
  groupLabel: string | null;
  fiscalYear: number | null;
  currency: string | null;
  revenue: string | null;
  ebit: string | null;
  preTaxProfit: string | null;
  netIncome: string | null;
  equity: string | null;
  totalAssets: string | null;
  profileHref: string;
  statementScope: "COMPANY" | "CONSOLIDATED" | null;
  preTaxProfitStatus: "AVAILABLE" | "MISSING" | "AMBIGUOUS" | null;
  financialSource: {
    sourceSystem: string;
    publishedAt: string | null;
    fetchedAt: string;
    normalizedAt: string;
  } | null;
};

type CompanyListData = {
  companies: CompanyMapCompany[];
  page: {
    total: number;
    withRevenue: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
  provenance: {
    groupTaxYear: number;
  };
};

type CoverageData = {
  coverage: {
    eligible: number;
    plotted: number;
    omitted: number;
    coveragePercent: number;
    omissions: Array<{ reason: string; count: number }>;
    financialCoverage: {
      metric: string;
      withMetric: number;
      withoutMetric: number;
      eligibleCoveragePercent: number;
    };
  };
};

type ApiEnvelope<T> = { data: T } | { error: string };

type Availability = "LOADING" | "READY" | "UNPUBLISHED" | "ERROR";

const INITIAL_VIEWPORT: CompanyMapViewport = {
  west: 3,
  south: 57,
  east: 32,
  north: 72,
  zoom: 4,
};

const metricOptions = [
  ["revenue", "Revenue"],
  ["ebit", "EBIT"],
  ["preTaxProfit", "Pre-tax profit"],
  ["netIncome", "Net income"],
  ["equity", "Equity"],
  ["totalAssets", "Total assets"],
  ["employees", "Employees"],
] as const;

const omissionLabels: Record<string, string> = {
  NO_BUSINESS_ADDRESS: "No registered business address",
  INCOMPLETE_OR_INVALID: "Incomplete or invalid address",
  NON_GEOGRAPHIC_ADDRESS: "Non-geographic address",
  NO_EXACT_MATCH: "No exact official-address match",
  AMBIGUOUS_EXACT_MATCH: "Ambiguous official-address match",
  OUTSIDE_NORWAY: "Address outside Norway",
  PRIVACY_WITHHELD: "Coordinates withheld for privacy",
  PENDING: "Address resolution pending",
  PROVIDER_FAILURE: "Address provider failure",
};

class ApiError extends Error {
  constructor(public status: number) {
    super(`Company-map request failed with status ${status}.`);
  }
}

async function fetchData<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, cache: "no-store" });
  const envelope = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || !("data" in envelope)) {
    throw new ApiError(response.status);
  }
  return envelope.data;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("nb-NO").format(value);
}

function formatMoney(value: string | null, currency: string | null) {
  if (!value || !currency) return "Not available";
  try {
    return new Intl.NumberFormat("nb-NO", {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(BigInt(value));
  } catch {
    return "Not available";
  }
}

function formatSourceDate(value: string) {
  return new Intl.DateTimeFormat("nb-NO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function buildFilterParams({
  organisationForms,
  companyStatuses,
}: {
  organisationForms: "AS,ASA" | "ALL";
  companyStatuses: "ACTIVE" | "ACTIVE,DISSOLVED,BANKRUPT";
}) {
  return new URLSearchParams({ organisationForms, companyStatuses });
}

export function CompanyMapExplorer() {
  const [organisationForms, setOrganisationForms] =
    React.useState<"AS,ASA" | "ALL">("AS,ASA");
  const [companyStatuses, setCompanyStatuses] =
    React.useState<"ACTIVE" | "ACTIVE,DISSOLVED,BANKRUPT">("ACTIVE");
  const [statementScope, setStatementScope] =
    React.useState<"COMPANY" | "CONSOLIDATED">("COMPANY");
  const [metric, setMetric] = React.useState<(typeof metricOptions)[number][0]>(
    "revenue",
  );
  const [viewport, setViewport] =
    React.useState<CompanyMapViewport>(INITIAL_VIEWPORT);
  const [features, setFeatures] = React.useState<CompanyMapFeature[]>([]);
  const [mapDataState, setMapDataState] = React.useState<
    "LOADING" | "READY" | "UNPUBLISHED" | "ERROR"
  >("LOADING");
  const [mapTruncated, setMapTruncated] = React.useState(false);
  const [selectedAddressId, setSelectedAddressId] = React.useState<
    string | null
  >(null);
  const [coverage, setCoverage] = React.useState<CoverageData | null>(null);
  const [companyList, setCompanyList] = React.useState<CompanyListData | null>(
    null,
  );
  const [loadingMore, setLoadingMore] = React.useState(false);
  const loadMoreAbortRef = React.useRef<AbortController | null>(null);
  const [availability, setAvailability] =
    React.useState<Availability>("LOADING");
  const currentListRequestKey = [
    organisationForms,
    companyStatuses,
    statementScope,
    selectedAddressId ?? "ALL_ADDRESSES",
  ].join("|");
  const currentListRequestKeyRef = React.useRef(currentListRequestKey);
  currentListRequestKeyRef.current = currentListRequestKey;

  React.useEffect(() => {
    setSelectedAddressId(null);
    setFeatures([]);
    setMapTruncated(false);
  }, [organisationForms, companyStatuses]);

  React.useEffect(() => {
    const controller = new AbortController();
    loadMoreAbortRef.current?.abort();
    loadMoreAbortRef.current = null;
    setLoadingMore(false);
    const params = buildFilterParams({ organisationForms, companyStatuses });
    params.set("statementScope", statementScope);
    params.set("currency", "NOK");
    const coverageParams = new URLSearchParams(params);
    coverageParams.set("metric", metric);
    const companyParams = new URLSearchParams(params);
    companyParams.set("limit", "100");
    if (selectedAddressId) {
      companyParams.set("officialAddressId", selectedAddressId);
    }

    setAvailability("LOADING");
    setCoverage(null);
    setCompanyList(null);
    Promise.all([
      fetchData<CoverageData>(
        `/api/company-map/coverage?${coverageParams}`,
        controller.signal,
      ),
      fetchData<CompanyListData>(
        `/api/company-map/companies?${companyParams}`,
        controller.signal,
      ),
    ])
      .then(([nextCoverage, nextCompanies]) => {
        setCoverage(nextCoverage);
        setCompanyList(nextCompanies);
        setAvailability("READY");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setAvailability(
          error instanceof ApiError && error.status === 503
            ? "UNPUBLISHED"
            : "ERROR",
        );
      });

    return () => controller.abort();
  }, [
    organisationForms,
    companyStatuses,
    statementScope,
    metric,
    selectedAddressId,
  ]);

  React.useEffect(() => {
    const controller = new AbortController();
    setMapDataState("LOADING");
    const timeout = window.setTimeout(() => {
      const params = buildFilterParams({ organisationForms, companyStatuses });
      for (const [key, value] of Object.entries(viewport)) {
        params.set(key, String(value));
      }
      params.set("limit", "1000");
      fetchData<{
        features: CompanyMapFeature[];
        page: { truncated: boolean };
      }>(
        `/api/company-map/viewport?${params}`,
        controller.signal,
      )
        .then((data) => {
          setFeatures(data.features);
          setMapTruncated(data.page.truncated);
          setMapDataState("READY");
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          if (error instanceof ApiError && error.status === 503) {
            setFeatures([]);
            setMapTruncated(false);
            setMapDataState("UNPUBLISHED");
          } else {
            setFeatures([]);
            setMapTruncated(false);
            setMapDataState("ERROR");
            setAvailability("ERROR");
          }
        });
    }, 250);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [organisationForms, companyStatuses, viewport]);

  const loadMore = React.useCallback(() => {
    if (
      !companyList?.page.hasMore ||
      loadingMore ||
      loadMoreAbortRef.current
    ) {
      return;
    }
    const controller = new AbortController();
    loadMoreAbortRef.current = controller;
    const requestKey = currentListRequestKey;
    const params = buildFilterParams({ organisationForms, companyStatuses });
    params.set("statementScope", statementScope);
    params.set("currency", "NOK");
    params.set("limit", "100");
    params.set("offset", String(companyList.companies.length));
    if (selectedAddressId) params.set("officialAddressId", selectedAddressId);

    setLoadingMore(true);
    void fetchData<CompanyListData>(
      `/api/company-map/companies?${params}`,
      controller.signal,
    )
      .then((next) => {
        if (
          loadMoreAbortRef.current !== controller ||
          currentListRequestKeyRef.current !== requestKey
        ) {
          return;
        }
        setCompanyList((current) =>
          current
              ? {
                  companies: [...current.companies, ...next.companies],
                  page: next.page,
                  provenance: next.provenance,
                }
            : next,
        );
      })
      .catch(() => {
        if (!controller.signal.aborted) setAvailability("ERROR");
      })
      .finally(() => {
        if (loadMoreAbortRef.current === controller) {
          loadMoreAbortRef.current = null;
          setLoadingMore(false);
        }
      });
  }, [
    companyList,
    organisationForms,
    companyStatuses,
    statementScope,
    selectedAddressId,
    loadingMore,
    currentListRequestKey,
  ]);

  React.useEffect(
    () => () => {
      loadMoreAbortRef.current?.abort();
    },
    [],
  );

  return (
    <main id="main-content" className="mx-auto max-w-[1480px] px-4 py-8 sm:px-6 lg:px-10">
      <div className="flex flex-col gap-8">
        <header className="max-w-4xl">
          <p className="data-label text-xs uppercase text-[var(--px-accent)]">
            Free public company data
          </p>
          <h1 className="editorial-display mt-3 text-4xl font-semibold text-[var(--px-text)] sm:text-5xl">
            Norwegian companies on the map
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-[var(--px-muted)]">
            Explore registered legal entities by their business registered
            address. Compare the latest published company accounts, employees,
            and group affiliation without creating an account.
          </p>
        </header>

        <section
          aria-labelledby="company-map-filters-heading"
          className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-5"
        >
          <h2 id="company-map-filters-heading" className="text-lg font-semibold">
            Filters
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm font-medium text-[var(--px-text)]">
              Organisation forms
              <select
                value={organisationForms}
                onChange={(event) =>
                  setOrganisationForms(event.target.value as "AS,ASA" | "ALL")
                }
                className="mt-2 min-h-11 w-full rounded-xl border border-[var(--px-border)] bg-[var(--px-surface)] px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--px-accent)]"
              >
                <option value="AS,ASA">AS and ASA</option>
                <option value="ALL">All registered entities</option>
              </select>
            </label>
            <label className="text-sm font-medium text-[var(--px-text)]">
              Registration status
              <select
                value={companyStatuses}
                onChange={(event) =>
                  setCompanyStatuses(
                    event.target.value as
                      | "ACTIVE"
                      | "ACTIVE,DISSOLVED,BANKRUPT",
                  )
                }
                className="mt-2 min-h-11 w-full rounded-xl border border-[var(--px-border)] bg-[var(--px-surface)] px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--px-accent)]"
              >
                <option value="ACTIVE">Active</option>
                <option value="ACTIVE,DISSOLVED,BANKRUPT">All statuses</option>
              </select>
            </label>
            <label className="text-sm font-medium text-[var(--px-text)]">
              Coverage metric
              <select
                value={metric}
                onChange={(event) =>
                  setMetric(
                    event.target.value as (typeof metricOptions)[number][0],
                  )
                }
                className="mt-2 min-h-11 w-full rounded-xl border border-[var(--px-border)] bg-[var(--px-surface)] px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--px-accent)]"
              >
                {metricOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <span className="block text-sm font-medium text-[var(--px-text)]">
                Financial scope
              </span>
              <button
                type="button"
                aria-pressed={statementScope === "CONSOLIDATED"}
                onClick={() =>
                  setStatementScope((scope) =>
                    scope === "COMPANY" ? "CONSOLIDATED" : "COMPANY",
                  )
                }
                className="mt-2 min-h-11 w-full rounded-full bg-[var(--px-action)] px-4 text-sm font-semibold text-[var(--px-surface)] hover:bg-[var(--px-action-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--px-accent)] focus-visible:ring-offset-2"
              >
                {statementScope === "COMPANY"
                  ? "See consolidated"
                  : "See company accounts"}
              </button>
            </div>
          </div>
        </section>

        {availability === "UNPUBLISHED" ? (
          <section
            role="status"
            className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-950"
          >
            <h2 className="text-lg font-semibold">The map is being prepared</h2>
            <p className="mt-2 text-sm leading-6">
              The public dataset remains closed until the address, reported
              financial, and Skatteetaten group snapshots pass the publication
              checks. No incomplete group relationships are shown.
            </p>
          </section>
        ) : null}

        {availability === "ERROR" ? (
          <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-900">
            The company map could not be loaded. Please try again later.
          </p>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(24rem,0.65fr)]">
          <section aria-labelledby="map-heading">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <h2 id="map-heading" className="text-xl font-semibold">
                  Business registered addresses
                </h2>
                <p id="company-map-instructions" className="mt-1 text-sm text-[var(--px-muted)]">
                  Select a cluster to zoom in. Select an address point to filter
                  the company list. The list provides the same information
                  without requiring map interaction.
                </p>
              </div>
              <a
                href="#company-results"
                className="shrink-0 rounded-full px-3 py-2 text-sm font-semibold text-[var(--px-accent)] hover:bg-[var(--px-accent-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--px-accent)]"
              >
                Skip to list
              </a>
            </div>
            <CompanyMapMap
              features={features}
              selectedAddressId={selectedAddressId}
              dataState={mapDataState}
              onSelectAddress={setSelectedAddressId}
              onViewportChange={setViewport}
            />
            {mapTruncated ? (
              <p role="status" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                This view contains more than 1,000 address clusters or points.
                Zoom in to display the omitted points; the ranked list remains
                independently pageable.
              </p>
            ) : null}
            <p className="mt-3 text-xs leading-5 text-[var(--px-muted)]">
              Map points represent official addresses, not financial totals.
              Low-zoom circle size represents legal-entity counts only, so
              co-located companies are never financially combined.
            </p>
          </section>

          <aside aria-labelledby="coverage-heading" className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-5">
            <h2 id="coverage-heading" className="text-xl font-semibold">
              Address coverage
            </h2>
            {availability === "LOADING" ? (
              <p role="status" className="mt-4 text-sm text-[var(--px-muted)]">
                Loading official coverage…
              </p>
            ) : coverage ? (
              <>
                <dl className="mt-5 grid grid-cols-2 gap-4">
                  <CoverageValue label="Eligible" value={coverage.coverage.eligible} />
                  <CoverageValue label="Mapped" value={coverage.coverage.plotted} />
                  <CoverageValue label="Omitted" value={coverage.coverage.omitted} />
                  <CoverageValue
                    label="Mapped share"
                    value={`${coverage.coverage.coveragePercent}%`}
                  />
                </dl>
                <div className="mt-6 border-t border-[var(--px-border)] pt-5">
                  <p className="data-label text-xs uppercase text-[var(--px-muted)]">
                    Why entities are omitted
                  </p>
                  {coverage.coverage.omissions.length ? (
                    <ul className="mt-3 space-y-3 text-sm">
                      {coverage.coverage.omissions.map((omission) => (
                        <li key={omission.reason} className="flex justify-between gap-4">
                          <span>{omissionLabels[omission.reason] ?? omission.reason}</span>
                          <span className="font-mono tabular-nums">
                            {formatNumber(omission.count)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-sm text-[var(--px-muted)]">No omissions.</p>
                  )}
                </div>
                <p className="mt-6 border-t border-[var(--px-border)] pt-5 text-sm text-[var(--px-muted)]">
                  {formatNumber(coverage.coverage.financialCoverage.withMetric)}
                  {" of "}
                  {formatNumber(coverage.coverage.eligible)} entities have the
                  selected metric ({coverage.coverage.financialCoverage.eligibleCoveragePercent}%).
                </p>
              </>
            ) : (
              <p className="mt-4 text-sm leading-6 text-[var(--px-muted)]">
                Coverage and omission counts will appear when the complete
                public snapshot has been published.
              </p>
            )}
          </aside>
        </div>

        <section id="company-results" aria-labelledby="company-results-heading" tabIndex={-1}>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="data-label text-xs uppercase text-[var(--px-muted)]">
                Latest published · {statementScope === "COMPANY" ? "Company accounts" : "Consolidated accounts"} · NOK · Revenue descending
              </p>
              <h2 id="company-results-heading" className="mt-2 text-2xl font-semibold">
                {selectedAddressId ? "Companies at selected address" : "Company ranking"}
              </h2>
            </div>
            {selectedAddressId ? (
              <button
                type="button"
                onClick={() => setSelectedAddressId(null)}
                className="min-h-11 rounded-full border border-[var(--px-border)] px-4 text-sm font-semibold hover:bg-[var(--px-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--px-accent)]"
              >
                Clear address filter
              </button>
            ) : null}
          </div>

          <div className="mt-4 overflow-x-auto border-y border-[var(--px-border)] bg-[var(--px-surface)]">
            <table className="w-full min-w-[1120px] border-collapse text-left text-sm">
              <caption className="sr-only">
                Registered companies ordered by revenue, with their latest
                published key financial metrics and employee count.
              </caption>
              <thead>
                <tr className="border-b border-[var(--px-border)] text-[var(--px-muted)]">
                  {[
                    "Company",
                    "Revenue",
                    "EBIT",
                    "Pre-tax profit",
                    "Net income",
                    "Equity",
                    "Total assets",
                    "Employees",
                  ].map((heading) => (
                    <th key={heading} scope="col" className="data-label px-3 py-3 text-xs uppercase">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {companyList?.companies.map((company) => (
                  <tr key={company.orgNumber} className="border-b border-[var(--px-border)] last:border-0">
                    <th scope="row" className="px-3 py-4 font-normal">
                      <Link
                        href={company.profileHref as never}
                        className="font-semibold text-[var(--px-accent)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--px-accent)]"
                      >
                        {company.name}
                      </Link>
                      <span className="mt-1 block text-xs text-[var(--px-muted)]">
                        {company.orgNumber}
                        {company.organisationForm ? ` · ${company.organisationForm}` : ""}
                        {company.municipality ? ` · ${company.municipality}` : ""}
                      </span>
                      {company.groupLabel ? (
                        <span className="mt-1 block text-xs text-[var(--px-muted)]">
                          {company.groupLabel}. Ownership structure as of 31
                          December {companyList.provenance.groupTaxYear}.
                        </span>
                      ) : null}
                      {company.fiscalYear && company.financialSource ? (
                        <span className="mt-1 block text-xs text-[var(--px-muted)]">
                          {company.statementScope === "CONSOLIDATED"
                            ? "Consolidated accounts"
                            : "Company accounts"}
                          {` · ${company.fiscalYear} · ${company.currency ?? "Currency unavailable"}`}
                          {` · Source: ${company.financialSource.sourceSystem === "BRREG" ? "Brønnøysundregistrene" : company.financialSource.sourceSystem}`}
                          {company.financialSource.publishedAt
                            ? ` · Published ${formatSourceDate(company.financialSource.publishedAt)}`
                            : ""}
                          {` · Retrieved ${formatSourceDate(company.financialSource.fetchedAt)}`}
                        </span>
                      ) : (
                        <span className="mt-1 block text-xs text-[var(--px-muted)]">
                          Financial figures not available for this scope.
                        </span>
                      )}
                    </th>
                    <FinancialCell value={company.revenue} currency={company.currency} />
                    <FinancialCell value={company.ebit} currency={company.currency} />
                    <FinancialCell
                      value={company.preTaxProfit}
                      currency={company.currency}
                      unavailableLabel={
                        company.preTaxProfitStatus === "AMBIGUOUS"
                          ? "Ambiguous source lines"
                          : undefined
                      }
                    />
                    <FinancialCell value={company.netIncome} currency={company.currency} />
                    <FinancialCell value={company.equity} currency={company.currency} />
                    <FinancialCell value={company.totalAssets} currency={company.currency} />
                    <td className="px-3 py-4 font-mono tabular-nums">
                      {company.employeeCount === null
                        ? "Not available"
                        : formatNumber(company.employeeCount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {availability === "LOADING" ? (
              <p role="status" className="p-5 text-sm text-[var(--px-muted)]">
                Loading companies…
              </p>
            ) : companyList?.companies.length === 0 ? (
              <p className="p-5 text-sm text-[var(--px-muted)]">
                No mapped companies match these filters.
              </p>
            ) : null}
          </div>
          {companyList?.page.hasMore ? (
            <div className="mt-5 text-center">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="min-h-11 rounded-full bg-[var(--px-action)] px-5 text-sm font-semibold text-[var(--px-surface)] hover:bg-[var(--px-action-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--px-accent)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingMore ? "Loading…" : "Load 100 more"}
              </button>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function CoverageValue({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl bg-[var(--px-subtle)] p-4">
      <dt className="data-label text-xs uppercase text-[var(--px-muted)]">{label}</dt>
      <dd className="mt-2 text-xl font-semibold tabular-nums">
        {typeof value === "number" ? formatNumber(value) : value}
      </dd>
    </div>
  );
}

function FinancialCell({
  value,
  currency,
  unavailableLabel,
}: {
  value: string | null;
  currency: string | null;
  unavailableLabel?: string;
}) {
  return (
    <td className="whitespace-nowrap px-3 py-4 font-mono tabular-nums">
      {value ? formatMoney(value, currency) : (unavailableLabel ?? "Not available")}
    </td>
  );
}
