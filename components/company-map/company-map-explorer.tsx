"use client";

import Link from "next/link";
import * as React from "react";

import {
  buildCompanyMapFilterParams,
  countActiveCompanyMapFilters,
  createDefaultCompanyMapFilters,
  COMPANY_MAP_METRIC_OPTIONS,
  type CompanyMapFilterState,
  type CompanyMapMetric,
} from "@/components/company-map/company-map-filter-state";
import { formatCount, formatPercent } from "@/components/company-map/company-map-format";
import { CompanyMapDetailCard } from "@/components/company-map/company-map-detail-card";
import {
  CompanyMapMap,
  type CompanyMapFeature,
  type CompanyMapViewport,
} from "@/components/company-map/company-map-map";
import {
  CompanyMapResultsStrip,
  type CompanyMapResultView,
} from "@/components/company-map/company-map-results-strip";
import {
  CompanyMapSignalRail,
  type CompanyMapSignal,
} from "@/components/company-map/company-map-signal-rail";
import { CompanyMapToolbar } from "@/components/company-map/company-map-toolbar";
import {
  COMPANY_MAP_OMISSION_LABELS,
  type CompanyMapCompany,
  type CompanyMapCoverageData,
  type CompanyMapListData,
} from "@/components/company-map/company-map-types";

type ApiEnvelope<T> = { data: T } | { error: string };
type Availability = "LOADING" | "READY" | "UNPUBLISHED" | "ERROR";

const INITIAL_VIEWPORT: CompanyMapViewport = {
  west: 3,
  south: 57,
  east: 32,
  north: 72,
  zoom: 4,
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

function metricLabel(metric: CompanyMapMetric) {
  return (
    COMPANY_MAP_METRIC_OPTIONS.find(([value]) => value === metric)?.[1] ??
    metric
  );
}

export function CompanyMapExplorer({
  isAuthenticated = false,
}: {
  isAuthenticated?: boolean;
}) {
  const [filters, setFilters] = React.useState<CompanyMapFilterState>(
    createDefaultCompanyMapFilters,
  );
  const [statementScope, setStatementScope] = React.useState<
    "COMPANY" | "CONSOLIDATED"
  >("COMPANY");
  const [metric, setMetric] = React.useState<CompanyMapMetric>("revenue");
  const [viewport, setViewport] =
    React.useState<CompanyMapViewport>(INITIAL_VIEWPORT);
  const [features, setFeatures] = React.useState<CompanyMapFeature[]>([]);
  const [mapDataState, setMapDataState] = React.useState<Availability>(
    "LOADING",
  );
  const [mapTruncated, setMapTruncated] = React.useState(false);
  const [selectedAddressId, setSelectedAddressId] = React.useState<
    string | null
  >(null);
  const [selectedOrgNumber, setSelectedOrgNumber] = React.useState<
    string | null
  >(null);
  const [coverage, setCoverage] = React.useState<CompanyMapCoverageData | null>(
    null,
  );
  const [companyList, setCompanyList] =
    React.useState<CompanyMapListData | null>(null);
  const [availability, setAvailability] =
    React.useState<Availability>("LOADING");
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [panelOpen, setPanelOpen] = React.useState(false);
  const [railOpen, setRailOpen] = React.useState(true);
  const [stripOpen, setStripOpen] = React.useState(true);
  const [resultView, setResultView] =
    React.useState<CompanyMapResultView>("CARDS");
  const [showSignInPrompt, setShowSignInPrompt] = React.useState(false);
  const loadMoreAbortRef = React.useRef<AbortController | null>(null);

  const filterKey = React.useMemo(
    () => buildCompanyMapFilterParams(filters).toString(),
    [filters],
  );
  const [appliedFilterKey, setAppliedFilterKey] = React.useState(filterKey);
  const activeFilterCount = countActiveCompanyMapFilters(filters);
  const viewportKey = `${viewport.west},${viewport.south},${viewport.east},${viewport.north},${viewport.zoom}`;

  // Typing in the search box must not fire a request per keystroke; the map and the list settle
  // together once the filter set has stopped changing.
  React.useEffect(() => {
    const timeout = window.setTimeout(
      () => setAppliedFilterKey(filterKey),
      300,
    );
    return () => window.clearTimeout(timeout);
  }, [filterKey]);

  React.useEffect(() => {
    setSelectedAddressId(null);
    setSelectedOrgNumber(null);
  }, [appliedFilterKey]);

  const listRequestKey = [
    appliedFilterKey,
    statementScope,
    selectedAddressId ?? "ALL_ADDRESSES",
    viewportKey,
  ].join("|");
  const listRequestKeyRef = React.useRef(listRequestKey);
  listRequestKeyRef.current = listRequestKey;

  React.useEffect(() => {
    const controller = new AbortController();
    loadMoreAbortRef.current?.abort();
    loadMoreAbortRef.current = null;
    setLoadingMore(false);

    const timeout = window.setTimeout(() => {
      const base = new URLSearchParams(appliedFilterKey);
      base.set("statementScope", statementScope);
      base.set("currency", "NOK");

      const coverageParams = new URLSearchParams(base);
      coverageParams.set("metric", metric);

      const companyParams = new URLSearchParams(base);
      companyParams.set("limit", "100");
      companyParams.set("west", String(viewport.west));
      companyParams.set("south", String(viewport.south));
      companyParams.set("east", String(viewport.east));
      companyParams.set("north", String(viewport.north));
      if (selectedAddressId) {
        companyParams.set("officialAddressId", selectedAddressId);
      }

      setAvailability("LOADING");
      Promise.all([
        fetchData<CompanyMapCoverageData>(
          `/api/company-map/coverage?${coverageParams}`,
          controller.signal,
        ),
        fetchData<CompanyMapListData>(
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
          setCoverage(null);
          setCompanyList(null);
          setAvailability(
            error instanceof ApiError && error.status === 503
              ? "UNPUBLISHED"
              : "ERROR",
          );
        });
    }, 250);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedFilterKey, statementScope, metric, selectedAddressId, viewportKey]);

  React.useEffect(() => {
    const controller = new AbortController();
    setMapDataState("LOADING");
    const timeout = window.setTimeout(() => {
      const params = new URLSearchParams(appliedFilterKey);
      params.set("statementScope", statementScope);
      params.set("currency", "NOK");
      params.set("west", String(viewport.west));
      params.set("south", String(viewport.south));
      params.set("east", String(viewport.east));
      params.set("north", String(viewport.north));
      params.set("zoom", String(viewport.zoom));
      params.set("limit", "1000");
      fetchData<{
        features: CompanyMapFeature[];
        page: { truncated: boolean };
      }>(`/api/company-map/viewport?${params}`, controller.signal)
        .then((data) => {
          setFeatures(data.features);
          setMapTruncated(data.page.truncated);
          setMapDataState("READY");
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setFeatures([]);
          setMapTruncated(false);
          setMapDataState(
            error instanceof ApiError && error.status === 503
              ? "UNPUBLISHED"
              : "ERROR",
          );
        });
    }, 250);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedFilterKey, statementScope, viewportKey]);

  const loadMore = React.useCallback(() => {
    if (!companyList?.page.hasMore || loadingMore || loadMoreAbortRef.current) {
      return;
    }
    const controller = new AbortController();
    loadMoreAbortRef.current = controller;
    const requestKey = listRequestKey;
    const params = new URLSearchParams(appliedFilterKey);
    params.set("statementScope", statementScope);
    params.set("currency", "NOK");
    params.set("limit", "100");
    params.set("offset", String(companyList.companies.length));
    params.set("west", String(viewport.west));
    params.set("south", String(viewport.south));
    params.set("east", String(viewport.east));
    params.set("north", String(viewport.north));
    if (selectedAddressId) params.set("officialAddressId", selectedAddressId);

    setLoadingMore(true);
    void fetchData<CompanyMapListData>(
      `/api/company-map/companies?${params}`,
      controller.signal,
    )
      .then((next) => {
        if (
          loadMoreAbortRef.current !== controller ||
          listRequestKeyRef.current !== requestKey
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
    appliedFilterKey,
    companyList,
    listRequestKey,
    loadingMore,
    selectedAddressId,
    statementScope,
    viewport,
  ]);

  React.useEffect(
    () => () => {
      loadMoreAbortRef.current?.abort();
    },
    [],
  );

  const selectedCompany =
    companyList?.companies.find(
      (company) => company.orgNumber === selectedOrgNumber,
    ) ?? null;

  const signals: CompanyMapSignal[] = coverage
    ? [
        {
          label: "Selskaper i filteret",
          value: formatCount(coverage.coverage.eligible),
        },
        {
          label: "Kartfestet",
          value: formatCount(coverage.coverage.plotted),
        },
        {
          label: "Kartdekning",
          value: formatPercent(coverage.coverage.coveragePercent),
          tone:
            coverage.coverage.coveragePercent >= 90 ? "positive" : "neutral",
        },
        {
          label: `Har ${metricLabel(metric).toLowerCase()}`,
          value: formatPercent(
            coverage.coverage.financialCoverage.eligibleCoveragePercent,
          ),
        },
        {
          label: "Utelatt fra kartet",
          value: formatCount(coverage.coverage.omitted),
          tone: coverage.coverage.omitted > 0 ? "negative" : "neutral",
        },
      ]
    : [];

  const topOmission = coverage?.coverage.omissions[0];
  const railFootnote = topOmission
    ? `Vanligste grunn til utelatelse: ${
        COMPANY_MAP_OMISSION_LABELS[topOmission.reason] ?? topOmission.reason
      } (${formatCount(topOmission.count)}).`
    : "Tallene gjelder hele filterutvalget, ikke bare kartutsnittet.";

  function selectCompany(company: CompanyMapCompany) {
    setSelectedOrgNumber((current) =>
      current === company.orgNumber ? null : company.orgNumber,
    );
  }

  return (
    <main id="main-content" className="flex min-h-0 flex-1 flex-col">
      <h1 className="sr-only">Selskapskart for norske foretak</h1>

      <CompanyMapToolbar
        filters={filters}
        onFiltersChange={setFilters}
        onReset={() => {
          setFilters(createDefaultCompanyMapFilters());
          setPanelOpen(false);
        }}
        panelOpen={panelOpen}
        onPanelOpenChange={setPanelOpen}
        activeFilterCount={activeFilterCount}
        totalLabel={
          coverage ? formatCount(coverage.coverage.eligible) : null
        }
        busy={availability === "LOADING"}
      />

      {availability === "UNPUBLISHED" ? (
        <p
          role="status"
          className="shrink-0 border-b border-[var(--px-warning-border)] bg-[var(--px-warning-soft)] px-5 py-2.5 text-[12.5px] text-[var(--px-warning)]"
        >
          Kartet klargjøres. Det offentlige datasettet åpnes først når adresse-,
          regnskaps- og konsernsnapshotene har bestått publiseringskontrollene.
        </p>
      ) : null}
      {availability === "ERROR" ? (
        <p
          role="alert"
          className="shrink-0 border-b border-[var(--px-error-border)] bg-[var(--px-error-soft)] px-5 py-2.5 text-[12.5px] text-[var(--px-error)]"
        >
          Selskapskartet kunne ikke lastes. Prøv igjen senere.
        </p>
      ) : null}

      <section
        aria-label="Kart over forretningsadresser"
        className="relative min-h-[260px] flex-1 bg-[var(--px-subtle)]"
      >
        <CompanyMapMap
          features={features}
          selectedAddressId={selectedAddressId}
          dataState={mapDataState}
          onSelectAddress={(addressId) => {
            setSelectedAddressId(addressId);
            setSelectedOrgNumber(null);
          }}
          onViewportChange={setViewport}
        />

        <p id="company-map-instructions" className="sr-only">
          Velg en klynge for å zoome inn. Velg et adressepunkt for å filtrere
          selskapslisten. Listen under kartet gir den samme informasjonen uten
          kartinteraksjon.
        </p>

        <div className="pointer-events-none absolute left-4 top-4 z-[5] flex max-w-[calc(100%-14rem)] flex-wrap items-center gap-2.5">
          <div className="pointer-events-auto flex items-center gap-2.5 rounded-xl border border-[var(--px-border)] bg-[var(--px-surface-strong)]/95 px-3.5 py-2.5 shadow-sm backdrop-blur">
            <span
              aria-hidden
              className="material-symbols-outlined text-[20px] text-[var(--px-accent)]"
            >
              location_on
            </span>
            <span className="block leading-tight">
              <span className="block font-mono text-[16px] font-semibold tabular-nums text-[var(--px-text)]">
                {companyList ? formatCount(companyList.page.total) : "—"}
              </span>
              <span className="data-label block text-[9px] text-[var(--px-muted)]">
                I UTSNITTET
              </span>
            </span>
          </div>

          <div className="pointer-events-auto flex items-center gap-2 rounded-xl border border-[var(--px-border)] bg-[var(--px-surface-strong)]/95 py-1.5 pl-3 pr-2 shadow-sm backdrop-blur">
            <label
              htmlFor="company-map-metric"
              className="data-label text-[9px] text-[var(--px-muted)]"
            >
              DEKNINGSTALL
            </label>
            <select
              id="company-map-metric"
              value={metric}
              onChange={(event) =>
                setMetric(event.target.value as CompanyMapMetric)
              }
              className="h-8 cursor-pointer rounded-md border border-[var(--px-border)] bg-[var(--px-surface-strong)] px-2 text-[12px] font-semibold text-[var(--px-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--px-accent)]"
            >
              {COMPANY_MAP_METRIC_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="pointer-events-auto flex items-center gap-2 rounded-xl border border-[var(--px-border)] bg-[var(--px-surface-strong)]/95 py-1.5 pl-3 pr-2 shadow-sm backdrop-blur">
            <label
              htmlFor="company-map-scope"
              className="data-label text-[9px] text-[var(--px-muted)]"
            >
              OMFANG
            </label>
            <select
              id="company-map-scope"
              value={statementScope}
              onChange={(event) =>
                setStatementScope(
                  event.target.value as "COMPANY" | "CONSOLIDATED",
                )
              }
              className="h-8 cursor-pointer rounded-md border border-[var(--px-border)] bg-[var(--px-surface-strong)] px-2 text-[12px] font-semibold text-[var(--px-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--px-accent)]"
            >
              <option value="COMPANY">Selskapsregnskap</option>
              <option value="CONSOLIDATED">Konsernregnskap</option>
            </select>
          </div>
        </div>

        {mapDataState === "LOADING" && features.length > 0 ? (
          <p
            role="status"
            className="absolute left-1/2 top-4 z-[6] flex -translate-x-1/2 items-center gap-2 rounded-full bg-[var(--px-panel)] px-4 py-2 text-[12.5px] text-white shadow-md"
          >
            <span aria-hidden className="material-symbols-outlined text-[16px]">
              sync
            </span>
            Oppdaterer kart …
          </p>
        ) : null}

        <div className="absolute bottom-[46px] left-4 z-[5] rounded-xl border border-[var(--px-border)] bg-[var(--px-surface-strong)]/95 px-3 py-2.5 shadow-sm backdrop-blur">
          <p className="data-label text-[9px] text-[var(--px-muted)]">
            STØRRELSE = ANTALL SELSKAPER PÅ ADRESSEN
          </p>
          <div className="mt-2 flex items-center gap-3.5">
            {[
              ["h-1.5 w-1.5", "1–9"],
              ["h-2.5 w-2.5", "10–99"],
              ["h-4 w-4", "100+"],
            ].map(([size, label]) => (
              <span key={label} className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className={`${size} rounded-full border-2 border-white bg-[var(--px-accent)] ring-1 ring-[var(--px-border)]`}
                />
                <span className="text-[11.5px] text-[var(--px-text)]">
                  {label}
                </span>
              </span>
            ))}
          </div>
          {mapTruncated ? (
            <p role="status" className="mt-2 text-[11px] text-[var(--px-warning)]">
              Utsnittet har flere enn 1 000 punkter. Zoom inn for å se resten.
            </p>
          ) : null}
        </div>

        <CompanyMapSignalRail
          open={railOpen}
          onOpenChange={setRailOpen}
          signals={signals}
          loading={availability === "LOADING" && !coverage}
          footnote={railFootnote}
        />

        {selectedCompany ? (
          <CompanyMapDetailCard
            company={selectedCompany}
            groupTaxYear={companyList?.provenance.groupTaxYear ?? null}
            isAuthenticated={isAuthenticated}
            onClose={() => setSelectedOrgNumber(null)}
            onRequestSignIn={() => setShowSignInPrompt(true)}
          />
        ) : null}

        {selectedAddressId ? (
          <button
            type="button"
            onClick={() => setSelectedAddressId(null)}
            className="absolute bottom-4 left-1/2 z-[6] flex -translate-x-1/2 items-center gap-2 rounded-full border border-[var(--px-border)] bg-[var(--px-surface-strong)] px-4 py-2.5 text-[12.5px] font-semibold text-[var(--px-text)] shadow-md hover:bg-[var(--px-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--px-accent)]"
          >
            <span aria-hidden className="material-symbols-outlined text-[17px]">
              filter_alt_off
            </span>
            Fjern adressefilter
          </button>
        ) : null}
      </section>

      <CompanyMapResultsStrip
        data={companyList}
        loading={availability === "LOADING" && !companyList}
        open={stripOpen}
        onOpenChange={setStripOpen}
        view={resultView}
        onViewChange={setResultView}
        selectedOrgNumber={selectedOrgNumber}
        onSelectCompany={selectCompany}
        onLoadMore={loadMore}
        loadingMore={loadingMore}
        scopeLabel={
          selectedAddressId
            ? "Selskaper på valgt adresse"
            : "Selskaper i utsnittet"
        }
      />

      {showSignInPrompt ? (
        <div
          role="dialog"
          aria-label="Innlogging kreves"
          className="absolute bottom-[22px] left-1/2 z-[60] flex max-w-[520px] -translate-x-1/2 items-center gap-4 rounded-2xl bg-[var(--px-panel)] py-3.5 pl-[18px] pr-4 text-white shadow-[0_12px_32px_rgba(15,23,42,0.28)]"
        >
          <span
            aria-hidden
            className="material-symbols-outlined text-[24px] text-[var(--px-watch)]"
          >
            lock
          </span>
          <span className="block leading-snug">
            <span className="block text-[13.5px] font-semibold">
              Å følge selskaper krever innlogging
            </span>
            <span className="block text-[12px] text-white/70">
              Opprett en gratis konto for overvåkning, lister og varsler.
            </span>
          </span>
          <span className="ml-1.5 flex gap-2">
            <Link
              href="/login"
              className="whitespace-nowrap rounded-full bg-white px-4 py-2 text-[12.5px] font-semibold text-[var(--px-panel)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              Logg inn
            </Link>
            <button
              type="button"
              onClick={() => setShowSignInPrompt(false)}
              className="flex rounded-md p-1 text-white/70 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <span aria-hidden className="material-symbols-outlined text-[20px]">
                close
              </span>
              <span className="sr-only">Lukk</span>
            </button>
          </span>
        </div>
      ) : null}
    </main>
  );
}
