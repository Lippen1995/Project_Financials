"use client";

import { useEffect, useId, useRef, useState } from "react";

import {
  DASHBOARD_SEARCH_SCOPES,
  type DashboardSearchScope,
} from "@/lib/dashboard-search";
import {
  canShowNavSearchSuggestions,
  type NavSearchSuggestion,
} from "@/lib/nav-search";
import {
  filterDashboardSearchSuggestions,
  scheduleDashboardSuggestionSearch,
} from "@/lib/dashboard-search-suggestions";
import {
  DashboardSearchSuggestionList,
  dashboardSuggestionOptionId,
} from "@/components/dashboard/dashboard-search-suggestion-list";
import {
  SimulatedFinancialsBanner,
  SimulatedValueMarker,
} from "@/components/company/simulated-financials-notice";
import type { FinancialDisclosure } from "@/lib/financial-simulation-disclosure";
import { combineFinancialValueOrigins } from "@/lib/financial-value-origin";
import type {
  OversiktBankruptcyRow,
  OversiktNewsRow,
  OversiktWatchRow,
} from "@/server/services/oversikt-dashboard-service";

// ── Sparkline model ──────────────────────────────────────────────────────────
// Each bar is positioned in a 62×22 viewBox: the most recent period renders at
// full opacity, prior periods are dimmed.
type Bar = { x: number; y: number; h: number; fill: string; op: number };

const SEARCH_SUGGESTION_DEBOUNCE_MS = 120;
const MAX_SEARCH_SUGGESTIONS = 8;

const UP = "#10b981";
const DOWN = "#ef4444";
const REVENUE_FILL = "#00668a";

const fmtPct = (n: number) =>
  (n >= 0 ? "+" : "−") + Math.abs(n).toFixed(1).replace(".", ",") + " %";

const yoy = (s: number[]) => (s[s.length - 1] / s[s.length - 2] - 1) * 100;
const cagr = (s: number[]) => (Math.pow(s[s.length - 1] / s[0], 1 / (s.length - 1)) - 1) * 100;

function fmtRevenue(nok: number) {
  const abs = Math.abs(nok);
  if (abs >= 1e9) return (nok / 1e9).toFixed(1).replace(".", ",") + " mrd";
  if (abs >= 1e6) return (nok / 1e6).toFixed(1).replace(".", ",") + " mill";
  return Math.round(nok / 1e3).toLocaleString("nb-NO") + " k";
}

// Positive-only magnitude bars — grow from the bottom, tallest = largest value.
function mkBars(values: number[], color: string): Bar[] {
  const max = Math.max(...values.map(Math.abs), 1);
  return values.map((v, i) => {
    const h = Math.max(2, Math.round((Math.abs(v) / max) * 20));
    return { x: i * 14, h, y: 22 - h, fill: color, op: i < values.length - 1 ? 0.32 : 1 };
  });
}

// Signed bars grow from a zero baseline: positive values rise above it,
// negative values hang below.
function mkSignedBars(values: number[], colorPos: string, colorNeg: string): Bar[] {
  const max = Math.max(...values.map(Math.abs), 1);
  const baseline = 11;
  return values.map((v, i) => {
    const h = Math.max(2, Math.round((Math.abs(v) / max) * (baseline - 1)));
    return {
      x: i * 14,
      y: v >= 0 ? baseline - h : baseline,
      h,
      fill: v >= 0 ? colorPos : colorNeg,
      op: i < values.length - 1 ? 0.32 : 1,
    };
  });
}

function Sparkline({ bars, baseline = false }: { bars: Bar[]; baseline?: boolean }) {
  return (
    <svg viewBox="0 0 62 22" width="52" height="18" style={{ overflow: "visible", justifySelf: "end" }}>
      {baseline ? (
        <line x1="0" y1="11" x2="62" y2="11" stroke="var(--px-border)" strokeWidth="1" />
      ) : null}
      {bars.map((b, i) => (
        <rect key={i} x={b.x} y={b.y} width="9" height={b.h} rx="1.5" fill={b.fill} opacity={b.op} />
      ))}
    </svg>
  );
}

const BANKRUPTCY_COLS = "2.1fr 0.9fr 1.1fr 0.85fr 1.1fr 0.85fr";

function changeColor(positive: boolean) {
  return positive ? "var(--px-success)" : "var(--px-error)";
}

// ── Component ────────────────────────────────────────────────────────────────
export function OversiktDashboard({
  firstName,
  dateLabel,
  watch,
  news,
  bankruptcies,
  bankruptciesLastWeek,
  financialDisclosure,
}: {
  firstName: string;
  dateLabel: string;
  watch: OversiktWatchRow[];
  news: OversiktNewsRow[];
  bankruptcies: OversiktBankruptcyRow[];
  bankruptciesLastWeek: number;
  financialDisclosure?: FinancialDisclosure;
}) {
  const [newsExpanded, setNewsExpanded] = useState(false);
  const visibleNews = newsExpanded ? news : news.slice(0, 4);
  const canExpandNews = news.length > 4;

  // AI search is opt-in: off by default, and only enabled by the current button press.
  const [aiEnabled, setAiEnabled] = useState(false);
  const [searchScope, setSearchScope] = useState<DashboardSearchScope>("all");
  const [searchEventId] = useState(() => crypto.randomUUID());
  const [searchQuery, setSearchQuery] = useState("");
  const [searchSuggestions, setSearchSuggestions] = useState<NavSearchSuggestion[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);
  const [highlightedSuggestion, setHighlightedSuggestion] = useState(-1);
  const suggestionsId = useId();
  const searchFormRef = useRef<HTMLFormElement | null>(null);

  const canSuggest = canShowNavSearchSuggestions(searchQuery, aiEnabled);

  useEffect(() => {
    if (!canSuggest) {
      setSearchSuggestions([]);
      setSuggestionsLoading(false);
      setSuggestionsError(null);
      setHighlightedSuggestion(-1);
      return;
    }

    return scheduleDashboardSuggestionSearch({
      query: searchQuery,
      scope: searchScope,
      aiEnabled,
      delayMs: SEARCH_SUGGESTION_DEBOUNCE_MS,
      onStart: () => {
        setSuggestionsLoading(true);
        setSearchSuggestions([]);
        setSuggestionsError(null);
        setHighlightedSuggestion(-1);
        setSuggestionsOpen(true);
      },
      onResult: (payload) => {
        const scopedSuggestions = filterDashboardSearchSuggestions(payload.data, searchScope);
        setSearchSuggestions(scopedSuggestions.slice(0, MAX_SEARCH_SUGGESTIONS));

        const unavailableLabels = payload.meta.unavailableSources
          .filter((source) => searchScope === "all" || source === searchScope)
          .map((source) =>
            source === "companies"
              ? "Selskapsøk"
              : source === "persons"
                ? "Personsøk"
                : source === "roles"
                  ? "Rollesøk"
                  : source === "industries"
                    ? "Bransjesøk"
                    : "Konkurssøk",
          );
        setSuggestionsError(
          unavailableLabels.length > 0
            ? `${unavailableLabels.join(" og ")} er midlertidig utilgjengelig.`
            : null,
        );
      },
      onError: () => {
        setSearchSuggestions([]);
        setSuggestionsError("Forslagssøket er midlertidig utilgjengelig.");
      },
      onSettled: () => setSuggestionsLoading(false),
    });
  }, [aiEnabled, canSuggest, searchQuery, searchScope]);

  useEffect(() => {
    if (!suggestionsOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && !searchFormRef.current?.contains(target)) setSuggestionsOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [suggestionsOpen]);

  function toggleAi(next: boolean) {
    setAiEnabled(next);
    setSuggestionsOpen(false);
    setSearchSuggestions([]);
    setSuggestionsError(null);
    setHighlightedSuggestion(-1);
  }

  function openSuggestion(suggestion: NavSearchSuggestion) {
    window.location.assign(suggestion.href);
  }

  function onSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!suggestionsOpen || searchSuggestions.length === 0) {
      if (event.key === "Escape") setSuggestionsOpen(false);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedSuggestion((current) => (current + 1) % searchSuggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedSuggestion((current) =>
        current <= 0 ? searchSuggestions.length - 1 : current - 1,
      );
    } else if (event.key === "Enter" && highlightedSuggestion >= 0) {
      event.preventDefault();
      openSuggestion(searchSuggestions[highlightedSuggestion]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setSuggestionsOpen(false);
      setHighlightedSuggestion(-1);
    }
  }

  return (
    <div className="pt-12 pb-10 sm:pt-16 lg:px-10 lg:pt-[72px]">
      {financialDisclosure?.simulated ? (
        <div className="mx-auto mb-8 max-w-[1160px]">
          <SimulatedFinancialsBanner disclosure={financialDisclosure} />
        </div>
      ) : null}
      {/* Greeting + search */}
      <div className="mx-auto mb-[52px] max-w-[760px] text-center">
        <p className="data-label mb-[18px] text-xs text-[var(--px-accent)]">
          HEI {firstName.toUpperCase()} · {dateLabel}
        </p>
        <h2 className="editorial-display mb-3.5 text-4xl leading-[1.05] text-[var(--px-text)] sm:text-[48px]">
          Hva skal vi analysere i dag?
        </h2>
        <p className="mb-[34px] text-[15px] text-[var(--px-muted)]">
          Søk på &gt;1,2 millioner norske selskaper — regnskap, eierskap, roller, eiendommer,
          patenter og kunngjøringer. Få den informerte innsikten du trenger.
        </p>

        <form
          ref={searchFormRef}
          action="/search/resolve"
          method="GET"
          className="relative flex items-center gap-3.5 border-b-2 border-[var(--px-accent)] py-1.5"
        >
          <span className="material-symbols-outlined text-2xl text-[var(--px-muted)]">search</span>
          <input
            name="query"
            required
            maxLength={200}
            role={aiEnabled ? "searchbox" : "combobox"}
            aria-label={aiEnabled ? "AI-søk" : "Søk etter selskaper, personer og roller"}
            aria-autocomplete={aiEnabled ? undefined : "list"}
            aria-controls={aiEnabled ? undefined : suggestionsId}
            aria-expanded={aiEnabled ? undefined : suggestionsOpen && canSuggest}
            aria-activedescendant={
              !aiEnabled && highlightedSuggestion >= 0
                ? dashboardSuggestionOptionId(suggestionsId, highlightedSuggestion)
                : undefined
            }
            value={searchQuery}
            placeholder={aiEnabled ? "Beskriv hva du vil finne…" : "Søk etter selskap, person eller rolle…"}
            onChange={(event) => {
              setSearchQuery(event.target.value);
              setSuggestionsOpen(true);
            }}
            onFocus={() => {
              if (canSuggest) setSuggestionsOpen(true);
            }}
            onKeyDown={onSearchKeyDown}
            className="min-w-0 flex-1 border-none bg-transparent py-3 text-[19px] text-[var(--px-text)] outline-none placeholder:text-[var(--px-muted)]"
          />
          {aiEnabled ? <input type="hidden" name="ai" value="1" /> : null}
          <input type="hidden" name="searchEventId" value={searchEventId} />
          <input type="hidden" name="scope" value={searchScope} />
          <button
            type="button"
            role="switch"
            aria-checked={aiEnabled}
            onClick={() => toggleAi(!aiEnabled)}
            title={
              aiEnabled
                ? "AI-søk på – diskuter og finjuster søket med AI"
                : "Slå på AI-søk for analytiske søk (konkurrenter, oppkjøp, kjeder)"
            }
            className={`data-label flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold transition-all ${
              aiEnabled
                ? "bg-[var(--px-accent)] text-[var(--px-bg)]"
                : "text-[var(--px-accent)] opacity-50 hover:opacity-80"
            }`}
          >
            <span className="material-symbols-outlined text-[14px]">auto_awesome</span>
            AI
          </button>
          <button type="submit" aria-label="Søk" className="flex items-center">
            <span className="material-symbols-outlined text-2xl text-[var(--px-accent)]">
              arrow_forward
            </span>
          </button>

          <DashboardSearchSuggestionList
            id={suggestionsId}
            visible={!aiEnabled && suggestionsOpen && canSuggest}
            suggestions={searchSuggestions}
            loading={suggestionsLoading}
            error={suggestionsError}
            highlightedIndex={highlightedSuggestion}
            onHighlight={setHighlightedSuggestion}
          />
        </form>

        <div
          role="group"
          aria-label="Avgrens søket"
          className="mt-6 flex flex-wrap justify-center gap-6"
        >
          {DASHBOARD_SEARCH_SCOPES.map((scope) => (
            <button
              key={scope.value}
              type="button"
              aria-pressed={searchScope === scope.value}
              onClick={() => setSearchScope(scope.value)}
              className={`data-label cursor-pointer border-b-2 pb-[3px] text-[11px] transition-colors ${
                searchScope === scope.value
                  ? "border-[var(--px-accent)] text-[var(--px-accent)]"
                  : "border-transparent text-[var(--px-muted)] hover:text-[var(--px-text)]"
              }`}
            >
              {scope.label}
            </button>
          ))}
        </div>
      </div>

      {/* Watchlist */}
      <div className="mx-auto max-w-[560px]">
        <div className="mb-1.5 flex items-center justify-between">
          <p className="data-label text-[11px] text-[var(--px-muted)]">DIN OVERVÅKNING</p>
          <a href="/watchlist" className="data-label cursor-pointer text-[10px] text-[var(--px-accent)]">
            SE ALLE →
          </a>
        </div>

        {watch.length === 0 ? (
          <div className="mt-1.5 rounded-[var(--radius-md)] border border-dashed border-[var(--px-border)] px-[22px] py-7 text-center">
            <span className="material-symbols-outlined text-[26px] text-[var(--px-muted)]">star</span>
            <p className="mb-1 mt-2 text-[15px] font-medium text-[var(--px-text)]">
              Du følger ingen selskaper ennå
            </p>
            <p className="mb-3.5 text-[13px] text-[var(--px-muted)]">
              Legg til selskaper for å bygge overvåkningslisten din.
            </p>
            <a href="/search" className="data-label cursor-pointer text-[11px] text-[var(--px-accent)]">
              SØK OG LEGG TIL →
            </a>
          </div>
        ) : (
          watch.map((c, i) => {
            const hasTrend = c.revenueSeries.length >= 2;
            const change = hasTrend ? yoy(c.revenueSeries) : null;
            const meta = hasTrend
              ? `${c.revenueSeries.length - 1}-års omsetnings-CAGR ${fmtPct(cagr(c.revenueSeries))}`
              : "Ingen regnskapstall tilgjengelig";
            const cagrOrigin = hasTrend
              ? combineFinancialValueOrigins(c.revenueOrigins[0], c.revenueOrigins.at(-1))
              : null;
            const yoyOrigin = hasTrend
              ? combineFinancialValueOrigins(c.revenueOrigins.at(-2), c.revenueOrigins.at(-1))
              : null;
            return (
              <a
                key={c.slug}
                href={`/companies/${c.slug}`}
                className={`flex items-center justify-between gap-3.5 rounded-md px-2 py-1.5 transition-colors hover:bg-[rgba(248,249,250,0.7)] ${
                  i < watch.length - 1 ? "border-b border-[var(--px-border-subtle)]" : ""
                }`}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[var(--px-text)]">{c.name}</p>
                  <p className="data-label mt-px text-[9px] text-[var(--px-muted)]">
                    {meta}
                    {cagrOrigin === "synthetic" ? <SimulatedValueMarker /> : null}
                  </p>
                </div>
                {change != null ? (
                  <div className="flex flex-shrink-0 items-center gap-2.5">
                    <Sparkline bars={mkBars(c.revenueSeries, change >= 0 ? UP : DOWN)} />
                    <span
                      className="data-label w-12 text-right text-[11px]"
                      style={{ color: changeColor(change >= 0) }}
                    >
                      {fmtPct(change)}
                      {yoyOrigin === "synthetic" ? <SimulatedValueMarker /> : null}
                    </span>
                  </div>
                ) : (
                  <span className="data-label text-[10px] text-[var(--px-muted)]">—</span>
                )}
              </a>
            );
          })
        )}
      </div>

      {/* News feed */}
      <div className="mx-auto mt-14 max-w-[920px]">
        <p className="data-label mb-1.5 text-[11px] text-[var(--px-muted)]">NYHETSSTRØM</p>
        {news.length === 0 ? (
          <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--px-border)] px-[22px] py-7 text-center">
            <span className="material-symbols-outlined text-[26px] text-[var(--px-muted)]">newspaper</span>
            <p className="mb-1 mt-2 text-[15px] font-medium text-[var(--px-text)]">
              Ingen nyheter akkurat nå
            </p>
            <p className="text-[13px] text-[var(--px-muted)]">
              Følg selskaper for å få en skreddersydd nyhetsstrøm.
            </p>
          </div>
        ) : (
          <>
            {visibleNews.map((n) => (
              <a
                key={n.id}
                href={n.href}
                target={n.external ? "_blank" : undefined}
                rel={n.external ? "noopener noreferrer" : undefined}
                className="group relative flex items-baseline gap-[18px] rounded-md border-b border-[var(--px-border-subtle)] px-2 py-3.5 transition-colors hover:z-20 hover:bg-[rgba(248,249,250,0.7)]"
              >
                <span className="data-label w-[150px] flex-shrink-0 text-[10px] text-[var(--px-accent)]">
                  {n.tag}
                </span>
                <span className="flex-1 text-[15px] leading-[1.4] text-[var(--px-text)]">{n.head}</span>
                <span className="data-label flex-shrink-0 whitespace-nowrap text-[10px] text-[var(--px-muted)]">
                  {n.source ? `${n.source} · ` : ""}
                  {n.time}
                </span>
                <div className="pointer-events-none invisible absolute left-[168px] top-[calc(100%-5px)] z-30 w-[440px] translate-y-1 rounded-[var(--radius-md)] border border-[var(--px-border)] bg-[var(--px-surface-strong)] p-4 text-left opacity-0 shadow-[var(--shadow-md)] transition-[opacity,transform,visibility] duration-150 ease-[cubic-bezier(0.2,0,0,1)] group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
                  <p className="mb-3 text-sm leading-[1.55] text-[var(--px-text)]">{n.summary}</p>
                  <div className="flex items-center justify-between border-t border-[var(--px-border-subtle)] pt-2.5">
                    <span className="data-label text-[10px] text-[var(--px-muted)]">
                      {n.source ? `${n.source} · ` : ""}
                      {n.time}
                    </span>
                    <span className="data-label text-[10px] text-[var(--px-accent)]">LES HELE SAKEN →</span>
                  </div>
                </div>
              </a>
            ))}
            {canExpandNews ? (
              <div className="flex justify-center pt-2">
                <button
                  type="button"
                  onClick={() => setNewsExpanded((v) => !v)}
                  className="data-label inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-[var(--px-accent)]"
                >
                  {newsExpanded ? "VIS FÆRRE" : "SE MER"}
                  <span className="material-symbols-outlined text-base">
                    {newsExpanded ? "expand_less" : "expand_more"}
                  </span>
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>

      {/* Largest bankruptcies */}
      {bankruptcies.length > 0 ? (
        <div className="mx-auto mt-14 max-w-[1160px]">
          <div className="mb-2.5 flex items-center justify-between">
            <p className="data-label text-[11px] text-[var(--px-muted)]">
              STØRSTE KONKURSER · SISTE 60 DAGER
            </p>
            <a
              href="/market/distress"
              className="data-label cursor-pointer text-[10px] text-[var(--px-accent)]"
            >
              SE ALLE KONKURSER →
            </a>
          </div>

          <div
            className="grid items-center gap-x-5 border-b border-[var(--px-text)] px-2 pb-2"
            style={{ gridTemplateColumns: BANKRUPTCY_COLS }}
          >
            <span className="data-label text-[9px] text-[var(--px-muted)]">SELSKAP</span>
            <span className="data-label text-[9px] text-[var(--px-muted)]">BEGJÆRT</span>
            <span className="data-label text-[9px] text-[var(--px-muted)]">OMSETNING</span>
            <span className="data-label text-right text-[9px] text-[var(--px-muted)]">TREND</span>
            <span className="data-label text-[9px] text-[var(--px-muted)]">EBIT-MARGIN</span>
            <span className="data-label text-right text-[9px] text-[var(--px-muted)]">TREND</span>
          </div>

          {bankruptcies.map((k) => {
            const revTrend = k.revenueSeries.length >= 2;
            const revChange = revTrend ? yoy(k.revenueSeries) : null;
            const ebit = k.ebitMarginSeries;
            const ebitTrend = ebit.length >= 2;
            const ebitDelta = ebitTrend ? ebit[ebit.length - 1] - ebit[ebit.length - 2] : null;
            const revDeltaOrigin = combineFinancialValueOrigins(
              k.revenueOrigins.at(-2),
              k.revenueOrigins.at(-1),
            );
            const ebitDeltaOrigin = combineFinancialValueOrigins(
              k.ebitMarginOrigins.at(-2),
              k.ebitMarginOrigins.at(-1),
            );
            return (
              <a
                key={k.slug}
                href={`/companies/${k.slug}`}
                className="grid items-center gap-x-5 rounded-md border-b border-[var(--px-border-subtle)] px-2 py-3 transition-colors hover:bg-[rgba(248,249,250,0.7)]"
                style={{ gridTemplateColumns: BANKRUPTCY_COLS }}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[var(--px-text)]">{k.name}</p>
                  <p className="data-label mt-px text-[9px] text-[var(--px-muted)]">{k.sector}</p>
                </div>
                <span className="text-[13px] text-[var(--px-muted)]">
                  {k.filedDaysAgo == null ? "—" : `${k.filedDaysAgo} dager siden`}
                </span>
                <div>
                  <p className="text-sm tabular-nums text-[var(--px-text)]">
                    {k.latestRevenue == null ? "—" : fmtRevenue(k.latestRevenue)}
                    {k.latestRevenue != null && k.latestRevenueOrigin === "synthetic" ? (
                      <SimulatedValueMarker />
                    ) : null}
                  </p>
                  {revChange != null ? (
                    <p className="data-label mt-px text-[9px]" style={{ color: changeColor(revChange >= 0) }}>
                      {fmtPct(revChange)}
                      {revDeltaOrigin === "synthetic" ? <SimulatedValueMarker /> : null}
                    </p>
                  ) : null}
                </div>
                {revTrend ? (
                  <Sparkline bars={mkBars(k.revenueSeries, REVENUE_FILL)} />
                ) : (
                  <span />
                )}
                <div>
                  <p className="text-sm tabular-nums text-[var(--px-text)]">
                    {ebit.length > 0 ? fmtPct(ebit[ebit.length - 1]) : "—"}
                    {ebit.length > 0 && k.ebitMarginOrigins.at(-1) === "synthetic" ? (
                      <SimulatedValueMarker />
                    ) : null}
                  </p>
                  {ebitDelta != null ? (
                    <p className="data-label mt-px text-[9px]" style={{ color: changeColor(ebitDelta >= 0) }}>
                      {fmtPct(ebitDelta)} p.e.
                      {ebitDeltaOrigin === "synthetic" ? <SimulatedValueMarker /> : null}
                    </p>
                  ) : null}
                </div>
                {ebitTrend ? (
                  <Sparkline bars={mkSignedBars(ebit, UP, DOWN)} baseline />
                ) : (
                  <span />
                )}
              </a>
            );
          })}
        </div>
      ) : null}

      {/* Status ticker */}
      <div className="mt-14 flex flex-wrap items-center gap-3.5 border-t border-[var(--px-border)] py-4">
        <span className="inline-block h-[7px] w-[7px] rounded-full bg-[var(--px-success)]" />
        <span className="data-label text-[10px] text-[var(--px-muted)]">SYSTEM STATUS: NOMINAL</span>
        <span className="data-label text-[10px] text-[var(--px-muted)]">
          ·&nbsp;&nbsp;{bankruptciesLastWeek} KONKURSER DENNE UKEN
        </span>
        <span className="data-label text-[10px] text-[var(--px-muted)] sm:ml-auto">
          SISTE OPPDATERING {dateLabel}
        </span>
      </div>
    </div>
  );
}
