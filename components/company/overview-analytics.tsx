import Link from "next/link";

import {
  DataAvailability,
  NormalizedAnnouncement,
  NormalizedCompany,
  NormalizedFinancialLineItem,
  NormalizedFinancialStatement,
  NormalizedRole,
} from "@/lib/types";
import type { FinancialDisclosure } from "@/lib/financial-simulation-disclosure";
import type { HealthScoreResult } from "@/lib/health-score";
import { formatCompactNok, getReportingCurrency } from "@/lib/overview-chart";
import { formatMetricPercent, getOverviewMetricSeries, OverviewMetric } from "@/lib/overview-metrics";
import { combineFinancialValueOrigins } from "@/lib/financial-value-origin";
import { formatCurrency, formatNumber } from "@/lib/utils";

import {
  SimulatedChartCaption,
  SimulatedFinancialsBanner,
  SimulatedValueMarker,
} from "./simulated-financials-notice";
import { FinancialHealthSection } from "./overview/financial-health-section";
import { OverviewCharts } from "./overview/overview-charts";

const NDASH = "–";

/** A single owner slice for the compact "Eierskap" strip on the overview. */
export type OverviewOwner = { name: string; type: string; pct: number };

/* deterministic ownership palette — accent-led, sober */
const OWNER_FILLS = [
  "var(--px-chart-1)",
  "#3f7f9c",
  "var(--px-chart-2)",
  "#6a97a8",
  "#a9863f",
  "#8ba0ae",
  "var(--px-border)",
];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="data-label mb-3.5 text-[11px] uppercase text-[var(--px-muted)]">{children}</div>;
}

function byKeyMap(metrics: OverviewMetric[]) {
  return new Map(metrics.map((m) => [m.key, m]));
}

function lastTwo(values: (number | null)[]): { last: number; prev: number | null; lastIdx: number; prevIdx: number } | null {
  let last: number | null = null;
  let lastIdx = -1;
  for (let i = values.length - 1; i >= 0; i -= 1) {
    if (values[i] !== null && Number.isFinite(values[i] as number)) {
      last = values[i] as number;
      lastIdx = i;
      break;
    }
  }
  if (last === null) return null;
  let prev: number | null = null;
  let prevIdx = -1;
  for (let i = lastIdx - 1; i >= 0; i -= 1) {
    if (values[i] !== null && Number.isFinite(values[i] as number)) {
      prev = values[i] as number;
      prevIdx = i;
      break;
    }
  }
  return { last, prev, lastIdx, prevIdx };
}

/* ── AI-vurdering — surface chrome only; no synthetic prose (product rule) ── */
function AiAssessment({
  company,
  hasFinancials,
}: {
  company: NormalizedCompany;
  hasFinancials: boolean;
}) {
  const lead = hasFinancials
    ? "En automatisk KI-vurdering av selskapets finansielle stilling og risiko kommer her. Inntil kilden er koblet på viser vi ingen vurdering — tallene og signalene nedenfor er hentet direkte fra offentlige registre og regnskapene."
    : "Det finnes ikke tilstrekkelig registrert regnskapsgrunnlag til å produsere en KI-vurdering for dette foretaket ennå.";

  return (
    <div className="border-b border-[var(--px-border)] pb-7 pt-7">
      <div className="mb-3 flex items-center gap-2">
        <span className="material-symbols-outlined text-[18px] text-[var(--px-accent)]">auto_awesome</span>
        <span className="data-label text-[11px] text-[var(--px-accent)]">AI-vurdering</span>
      </div>
      <p className="m-0 max-w-[92ch] border-l-[3px] border-[var(--px-accent)] pl-5 font-serif text-[21px] leading-relaxed tracking-[-0.01em] text-[var(--px-text)] [text-wrap:pretty]">
        {lead}
      </p>
    </div>
  );
}

/* ── Nøkkeltall strip ───────────────────────────────────────────────────── */
function KeyFiguresStrip({
  metrics,
  latestYear,
  currency,
}: {
  metrics: OverviewMetric[];
  latestYear: number | null;
  currency: string;
}) {
  const byKey = byKeyMap(metrics);
  const defs = ["rev", "ebit", "net", "ebitM", "eqPct", "roe"];
  const cells = defs
    .map((key) => byKey.get(key))
    .filter((m): m is OverviewMetric => Boolean(m))
    .map((m) => {
      const pair = lastTwo(m.values);
      if (!pair) return null;
      const isPct = m.type === "mar";
      const value = isPct ? formatMetricPercent(pair.last) : (formatCompactNok(pair.last, currency) ?? NDASH);
      let delta: { text: string; positive: boolean } | null = null;
      if (pair.prev !== null) {
        if (isPct) {
          const pp = pair.last - pair.prev;
          delta = {
            text: `${pp >= 0 ? "+" : "−"}${new Intl.NumberFormat("nb-NO", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Math.abs(pp))} pp`,
            positive: pp >= 0,
          };
        } else if (pair.prev !== 0) {
          const g = (pair.last / pair.prev - 1) * 100;
          delta = {
            text: `${g >= 0 ? "+" : "−"}${new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 1 }).format(Math.abs(g))} % Y/Y`,
            positive: g >= 0,
          };
        }
      }
      const origin = m.origins[pair.lastIdx] ?? null;
      const deltaOrigin = pair.prevIdx >= 0
        ? combineFinancialValueOrigins(origin, m.origins[pair.prevIdx])
        : null;
      return { label: m.label, value, delta, origin, deltaOrigin };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);

  if (cells.length === 0) return null;

  return (
    <div className="border-b border-[var(--px-border)] py-6">
      <SectionLabel>Nøkkeltall{latestYear ? ` ${latestYear}` : ""}</SectionLabel>
      <div className="flex flex-wrap">
        {cells.map((c, i) => (
          <div
            key={c.label}
            className={i === 0 ? "flex-1 px-5 pl-0" : "flex-1 border-l border-[var(--px-border-subtle)] px-5"}
            style={{ minWidth: 150 }}
          >
            <div className="data-label text-[9px] text-[var(--px-muted)]">{c.label}</div>
            <div className="mt-1.5 whitespace-nowrap text-[23px] font-semibold tracking-[-0.02em] tabular-nums text-[var(--px-text)]">
              {c.value}
              {c.origin === "synthetic" ? <SimulatedValueMarker /> : null}
            </div>
            {c.delta ? (
              <div
                className="mt-0.5 whitespace-nowrap text-[11px] tabular-nums"
                style={{ color: c.delta.positive ? "var(--px-success)" : "var(--px-error)" }}
              >
                {c.delta.text}
                {c.deltaOrigin === "synthetic" ? <SimulatedValueMarker /> : null}
              </div>
            ) : (
              <div className="mt-0.5 text-[11px] text-[var(--px-muted)]">{NDASH}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Eierskap + Seneste kunngjøringer ───────────────────────────────────── */
function OwnershipAndAnnouncements({
  owners,
  ownersTaxYear,
  announcements,
  slug,
}: {
  owners: OverviewOwner[];
  ownersTaxYear: number | null;
  announcements: NormalizedAnnouncement[];
  slug: string;
}) {
  const dateFmt = new Intl.DateTimeFormat("nb-NO", { day: "2-digit", month: "short", year: "numeric" });
  const hasOwners = owners.length > 0;
  const hasAnns = announcements.length > 0;
  if (!hasOwners && !hasAnns) return null;

  return (
    <div className="grid grid-cols-1 gap-x-14 gap-y-8 border-b border-[var(--px-border)] py-6 lg:grid-cols-[1.5fr_1fr]">
      <div>
        <SectionLabel>Eierskap{ownersTaxYear ? ` · ${ownersTaxYear}` : ""}</SectionLabel>
        {hasOwners ? (
          <>
            <div className="mb-4 flex h-3 overflow-hidden rounded-full">
              {owners.map((o, i) => (
                <div key={o.name + i} style={{ width: `${o.pct}%`, background: OWNER_FILLS[i % OWNER_FILLS.length] }} />
              ))}
            </div>
            {owners.map((o, i) => (
              <div
                key={o.name + i}
                className="flex items-center gap-2.5 border-b border-[var(--px-border-subtle)] py-2"
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ background: OWNER_FILLS[i % OWNER_FILLS.length] }}
                />
                <span className="flex-1 truncate text-[13px] text-[var(--px-text)]">{o.name}</span>
                <span className="data-label text-[9px] text-[var(--px-muted)]">{o.type}</span>
                <span className="w-14 text-right font-mono text-[13px] font-semibold tabular-nums text-[var(--px-text)]">
                  {new Intl.NumberFormat("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(o.pct)} %
                </span>
              </div>
            ))}
            <Link
              href={`/companies/${slug}?tab=aksjonaerer`}
              className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[var(--px-accent)]"
            >
              Se alle aksjonærer
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </Link>
          </>
        ) : (
          <p className="rounded-md border border-dashed border-[var(--px-border)] bg-[var(--px-subtle)] px-3.5 py-3 text-[13px] leading-relaxed text-[var(--px-muted)]">
            Aksjonærdata er ikke tilgjengelig for dette foretaket.
          </p>
        )}
      </div>

      <div>
        <SectionLabel>Seneste kunngjøringer</SectionLabel>
        {hasAnns ? (
          <>
            {announcements.slice(0, 4).map((a) => (
              <div key={a.id} className="border-b border-[var(--px-border-subtle)] py-2.5">
                <div className="data-label tabular-nums text-[9px] text-[var(--px-muted)]">
                  {a.publishedAt ? dateFmt.format(new Date(a.publishedAt)) : a.year ?? ""} · BRREG
                </div>
                <div className="mt-1 text-[13px] leading-snug text-[var(--px-text)]">{a.title}</div>
              </div>
            ))}
            <Link
              href={`/companies/${slug}?tab=kunngjoringer`}
              className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[var(--px-accent)]"
            >
              Alle kunngjøringer
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </Link>
          </>
        ) : (
          <p className="rounded-md border border-dashed border-[var(--px-border)] bg-[var(--px-subtle)] px-3.5 py-3 text-[13px] leading-relaxed text-[var(--px-muted)]">
            Ingen registrerte kunngjøringer.
          </p>
        )}
      </div>
    </div>
  );
}

/* ── Generelt om selskapet ──────────────────────────────────────────────── */
function GeneralInfo({ company, roles }: { company: NormalizedCompany; roles: NormalizedRole[] }) {
  const address = company.addresses[0] ?? null;
  const foundedYear = company.foundedAt
    ? new Date(company.foundedAt).getFullYear()
    : company.registeredAt
      ? new Date(company.registeredAt).getFullYear()
      : null;
  const findRole = (pattern: RegExp) => roles.find((r) => pattern.test(r.title))?.person.fullName ?? null;

  const facts: Array<[string, string | null]> = [
    ["Organisasjonsform", company.legalForm ?? null],
    ["Stiftet", foundedYear ? String(foundedYear) : null],
    [
      "Næringskode (NACE)",
      company.industryCode?.code
        ? `${company.industryCode.code}${company.industryCode.title ? ` — ${company.industryCode.title}` : ""}`
        : null,
    ],
    ["Antall ansatte", company.employeeCount != null ? formatNumber(company.employeeCount) : null],
    ["Aksjekapital", company.shareCapital != null ? formatCurrency(company.shareCapital) : null],
    ["Antall aksjer", company.shareCount != null ? formatNumber(company.shareCount) : null],
    ["Daglig leder", findRole(/daglig leder/i)],
    ["Styreleder", findRole(/styre(ts)?\s*leder/i)],
    [
      "Forretningsadresse",
      address
        ? [address.line1, [address.postalCode, address.city].filter(Boolean).join(" ")]
            .filter((p) => p && p.trim() !== "")
            .join(", ")
        : null,
    ],
    ["Kommune", company.municipality ?? address?.city ?? null],
  ];
  const present = facts.filter(([, v]) => v !== null && v !== "") as Array<[string, string]>;

  const registrations: string[] = [];
  if (company.status === "ACTIVE") registrations.push("Aktivt foretak");
  if (company.vatRegistered) registrations.push("Registrert i MVA-registeret");
  if (company.lastSubmittedAnnualReportYear)
    registrations.push(`Regnskap levert ${company.lastSubmittedAnnualReportYear}`);
  if (company.registeredAt) registrations.push("Registrert i Enhetsregisteret");

  if (present.length === 0 && registrations.length === 0) return null;

  return (
    <div className="border-b border-[var(--px-border)] py-6">
      <SectionLabel>Generelt om selskapet</SectionLabel>
      <div className="grid grid-cols-1 gap-x-14 md:grid-cols-2">
        {present.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-5 border-b border-[var(--px-border-subtle)] py-2.5">
            <span className="shrink-0 text-[13px] text-[var(--px-muted)]">{k}</span>
            <span className="text-right text-[13px] text-[var(--px-text)]">{v}</span>
          </div>
        ))}
      </div>
      {registrations.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {registrations.map((r) => (
            <span
              key={r}
              className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-[var(--px-success)]"
              style={{ borderColor: "var(--px-success-border)" }}
            >
              <span className="material-symbols-outlined text-[13px]">check_circle</span>
              {r}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ── Hendelsesforløp — derived from register milestones we actually hold ─── */
type Milestone = { year: number; tag: string; title: string; text: string; dot: string };

function EventTimeline({ company }: { company: NormalizedCompany }) {
  const events: Milestone[] = [];
  const foundedYear = company.foundedAt ? new Date(company.foundedAt).getFullYear() : null;
  const registeredYear = company.registeredAt ? new Date(company.registeredAt).getFullYear() : null;

  if (foundedYear) {
    events.push({
      year: foundedYear,
      tag: "STIFTELSE",
      title: "Selskapet stiftet",
      text: `${company.legalForm ?? "Foretaket"} ble stiftet.`,
      dot: "var(--px-accent)",
    });
  }
  if (registeredYear && registeredYear !== foundedYear) {
    events.push({
      year: registeredYear,
      tag: "REGISTER",
      title: "Registrert i Enhetsregisteret",
      text: "Foretaket ble registrert i Enhetsregisteret.",
      dot: "var(--px-chart-2)",
    });
  }
  if (company.vatRegistered) {
    events.push({
      year: registeredYear ?? foundedYear ?? 0,
      tag: "MVA",
      title: "Registrert i MVA-registeret",
      text: "Foretaket er registrert for merverdiavgift.",
      dot: "var(--px-chart-2)",
    });
  }
  if (company.lastSubmittedAnnualReportYear) {
    events.push({
      year: company.lastSubmittedAnnualReportYear,
      tag: "REGNSKAP",
      title: "Siste leverte årsregnskap",
      text: `Regnskap for ${company.lastSubmittedAnnualReportYear} er levert til Regnskapsregisteret.`,
      dot: "var(--px-accent)",
    });
  }
  if (company.status === "BANKRUPT") {
    events.push({ year: registeredYear ?? 0, tag: "STATUS", title: "Konkurs", text: "Foretaket er registrert som konkurs.", dot: "var(--px-error)" });
  } else if (company.status === "DISSOLVED") {
    events.push({ year: registeredYear ?? 0, tag: "STATUS", title: "Oppløst", text: "Foretaket er registrert som oppløst.", dot: "var(--px-error)" });
  }

  const ordered = events.filter((e) => e.year > 0).sort((a, b) => a.year - b.year);
  if (ordered.length === 0) return null;

  return (
    <div className="pb-1.5 pt-6">
      <SectionLabel>Hendelsesforløp · vesentlige endringer</SectionLabel>
      <div className="flex flex-wrap gap-y-8">
        {ordered.map((e, i) => (
          <div key={`${e.tag}-${e.year}-${i}`} className="relative box-border basis-full pr-6 sm:basis-1/2 lg:basis-1/4">
            <div className="absolute left-0 right-0 top-1.5 h-0.5 bg-[var(--px-border)]" />
            <span
              className="absolute left-0 top-px h-3 w-3 rounded-full border-2 border-[var(--px-bg)]"
              style={{ background: e.dot, boxShadow: "0 0 0 1px var(--px-border)" }}
            />
            <div className="pt-6">
              <div className="flex items-baseline gap-2.5">
                <span className="data-label tabular-nums text-[11px] text-[var(--px-accent)]">{e.year}</span>
                <span className="data-label text-[8px] text-[var(--px-muted)]">{e.tag}</span>
              </div>
              <div className="mt-1 text-[13.5px] font-semibold leading-tight text-[var(--px-text)] [text-wrap:pretty]">
                {e.title}
              </div>
              <div className="mt-0.5 text-[12px] leading-snug text-[var(--px-muted)] [text-wrap:pretty]">{e.text}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function OverviewAnalytics({
  company,
  roles,
  statements,
  lineItems,
  financialsAvailability,
  disclosure,
  health,
  healthModelName,
  healthMatchedNacePrefix = null,
  owners = [],
  ownersTaxYear = null,
  announcements = [],
}: {
  company: NormalizedCompany;
  roles: NormalizedRole[];
  statements: NormalizedFinancialStatement[];
  lineItems: NormalizedFinancialLineItem[];
  financialsAvailability: DataAvailability;
  /** Says whether the figures behind these key numbers and graphs are generated. */
  disclosure?: FinancialDisclosure;
  /** Scored against the admin-owned model; the same result the page header shows. */
  health?: HealthScoreResult;
  healthModelName?: string;
  healthMatchedNacePrefix?: string | null;
  owners?: OverviewOwner[];
  ownersTaxYear?: number | null;
  announcements?: NormalizedAnnouncement[];
}) {
  const { years, metrics } = getOverviewMetricSeries(statements, lineItems);
  const currency = getReportingCurrency(statements);
  const latestYear = years.at(-1) ?? null;
  const firstYear = years[0] ?? null;

  return (
    <div className="min-w-0">
      <AiAssessment company={company} hasFinancials={financialsAvailability.available && metrics.length > 0} />

      {disclosure?.simulated ? (
        <SimulatedFinancialsBanner disclosure={disclosure} className="mt-4" />
      ) : null}

      <KeyFiguresStrip
        metrics={metrics}
        latestYear={latestYear}
        currency={currency}
      />

      {health && financialsAvailability.available ? (
        <FinancialHealthSection
          result={health}
          modelName={healthModelName ?? "Standardmodell"}
          matchedNacePrefix={healthMatchedNacePrefix}
        />
      ) : null}

      <div className="border-b border-[var(--px-border)] py-6">
        <SectionLabel>
          Utvikling{firstYear && latestYear ? ` · ${firstYear}–${latestYear}` : ""}
        </SectionLabel>
        <p className="mb-5 text-[12px] text-[var(--px-muted)]">
          Trykk på en graf for å velge den, og velg deretter en linje i listen til høyre for å bytte hvilket tall grafen
          viser.
        </p>
        <OverviewCharts statements={statements} lineItems={lineItems} disclosure={disclosure} />
        {disclosure?.simulated ? <SimulatedChartCaption disclosure={disclosure} /> : null}
      </div>

      <OwnershipAndAnnouncements
        owners={owners}
        ownersTaxYear={ownersTaxYear}
        announcements={announcements}
        slug={company.slug || company.orgNumber}
      />

      <GeneralInfo company={company} roles={roles} />

      <EventTimeline company={company} />
    </div>
  );
}
