import Link from "next/link";

import { getOverviewMetricSeries } from "@/lib/overview-metrics";
import { DataAvailability, NormalizedCompany, NormalizedFinancialStatement, NormalizedRole } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";

import { CardLabel } from "./earnings-trends";

type Signal = { ok: boolean | null; label: string };

function SignalRow({ ok, label }: Signal) {
  const color = ok === null ? "var(--px-muted)" : ok ? "var(--px-success)" : "var(--px-error)";
  const icon = ok === null ? "remove" : ok ? "check_circle" : "cancel";
  return (
    <div className="flex items-center gap-2.5 border-t border-[var(--px-border-subtle)] py-2.5 first:border-t-0">
      <span className="material-symbols-outlined text-[19px]" style={{ color, fontVariationSettings: "'FILL' 1" }} aria-hidden="true">
        {icon}
      </span>
      <span className="text-[13.5px] leading-snug text-[var(--px-text)]">{label}</span>
    </div>
  );
}

function lastTwo(values: (number | null)[]) {
  const defined: Array<{ value: number; index: number }> = [];
  values.forEach((v, index) => {
    if (v !== null && Number.isFinite(v)) defined.push({ value: v, index });
  });
  return { last: defined.at(-1) ?? null, prev: defined.at(-2) ?? null };
}

export function OverviewAside({
  company,
  roles,
  statements,
  financialsAvailability,
}: {
  company: NormalizedCompany;
  roles: NormalizedRole[];
  statements: NormalizedFinancialStatement[];
  financialsAvailability: DataAvailability;
}) {
  const { metrics } = getOverviewMetricSeries(statements);
  const ebit = metrics.find((m) => m.key === "ebit");
  const rev = metrics.find((m) => m.key === "rev");
  const eqPct = metrics.find((m) => m.key === "eqPct");

  const ebitLast = ebit ? lastTwo(ebit.values).last : null;
  const revPair = rev ? lastTwo(rev.values) : { last: null, prev: null };
  const eqPctLast = eqPct ? lastTwo(eqPct.values).last : null;

  const signals: Signal[] = [
    { ok: ebitLast ? ebitLast.value > 0 : null, label: "Positivt driftsresultat siste regnskapsår" },
    {
      ok: revPair.last && revPair.prev ? revPair.last.value > revPair.prev.value : null,
      label: "Voksende driftsinntekter mot forrige år",
    },
    { ok: eqPctLast ? eqPctLast.value > 30 : null, label: "Egenkapitalandel over 30 %" },
    { ok: company.status === "ACTIVE", label: "Registrert og aktiv i Foretaksregisteret" },
    { ok: company.status !== "BANKRUPT" && company.status !== "DISSOLVED", label: "Ingen konkurs- eller avviklingsvarsler" },
  ];

  const dagligLeder = roles.find((r) => /daglig leder/i.test(r.title))?.person.fullName ?? null;
  const facts: Array<[string, string | null]> = [
    ["Organisasjonsform", company.legalForm ?? null],
    [
      "Næringskode",
      company.industryCode?.code
        ? `${company.industryCode.code}${company.industryCode.title ? ` · ${company.industryCode.title}` : ""}`
        : null,
    ],
    ["Stiftet", company.foundedAt ? String(new Date(company.foundedAt).getFullYear()) : null],
    ["Forretningsadresse", company.municipality ?? company.addresses[0]?.city ?? null],
    ["Daglig leder", dagligLeder],
  ];
  const presentFacts = facts.filter(([, v]) => v) as Array<[string, string]>;

  const linkClass =
    "flex items-center gap-2.5 rounded-md border border-[var(--px-border-subtle)] bg-[var(--px-subtle)] px-3.5 py-2.5 text-sm font-semibold text-[var(--px-text)] transition-colors hover:border-[var(--px-accent)]";

  return (
    <aside className="flex flex-col gap-4 lg:sticky lg:top-[8.75rem]">
      <div className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface-strong)] p-5">
        <CardLabel icon="fact_check">Driftssignaler</CardLabel>
        <p className="mb-1 mt-1 text-[13px] leading-relaxed text-[var(--px-muted)]">
          Kontrollspørsmål for rask vurdering.
        </p>
        <div className="mt-1">
          {signals.map((s) => (
            <SignalRow key={s.label} ok={s.ok} label={s.label} />
          ))}
        </div>
      </div>

      {presentFacts.length > 0 ? (
        <div className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface-strong)] p-5">
          <CardLabel icon="business">Selskapsfakta</CardLabel>
          <div className="mt-1">
            {presentFacts.map(([label, value]) => (
              <div key={label} className="flex flex-col gap-0.5 border-t border-[var(--px-border-subtle)] py-2.5 first:border-t-0">
                <span className="data-label text-[10px] uppercase text-[var(--px-muted)]">{label}</span>
                <span className="text-sm leading-snug text-[var(--px-text)]">{value}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface-strong)] p-4">
        <CardLabel>Snarlenker</CardLabel>
        <div className="mt-2 flex flex-col gap-2">
          <a
            href={`https://virksomhet.brreg.no/nb/oppslag/enheter/${company.orgNumber}`}
            target="_blank"
            rel="noopener noreferrer"
            className={linkClass}
          >
            Brønnøysundregistrene
            <span className="material-symbols-outlined ml-auto text-[16px] text-[var(--px-muted)]" aria-hidden="true">
              open_in_new
            </span>
          </a>
          <Link href={`/companies/${company.slug}?tab=kunngjoringer`} className={linkClass}>
            Kunngjøringer
            <span className="material-symbols-outlined ml-auto text-[16px] text-[var(--px-muted)]" aria-hidden="true">
              campaign
            </span>
          </Link>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-subtle)] p-4">
        <div className="data-label text-[10px] uppercase text-[var(--px-muted)]">Datakilde</div>
        <div className="mt-1.5 text-[13px] leading-relaxed text-[var(--px-muted)]">
          {company.sourceSystem}
          {company.fetchedAt ? ` · sist oppdatert ${formatDate(company.fetchedAt)}` : ""}.{" "}
          {financialsAvailability.available ? "Regnskap er tilgjengelig." : "Regnskap er delvis tilgjengelig."}
        </div>
      </div>
    </aside>
  );
}
