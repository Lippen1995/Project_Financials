import React from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Users } from "lucide-react";

import { Card } from "@/components/ui/card";
import type { CompanyNameHistory, NameChangeContextKind } from "@/lib/company-history";
import type { RelatedNameHolder } from "@/server/registry/related-name-holders";
import { cn, formatDate } from "@/lib/utils";

const DAY_MS = 24 * 60 * 60 * 1000;

const STATUS_LABELS: Record<RelatedNameHolder["status"], string> = {
  ACTIVE: "Aktivt",
  BANKRUPT: "Konkurs",
  DISSOLVED: "Oppløst",
};

const STATUS_STYLES: Record<RelatedNameHolder["status"], string> = {
  ACTIVE: "border-[rgba(52,101,77,0.16)] bg-[rgba(233,245,236,0.9)] text-[#36564a]",
  BANKRUPT: "border-[rgba(159,47,47,0.18)] bg-[rgba(253,240,240,0.9)] text-[#8a2b2b]",
  DISSOLVED: "border-[rgba(146,91,33,0.18)] bg-[rgba(255,246,236,0.9)] text-[#8a5b21]",
};

const CONTEXT_STYLES: Record<NameChangeContextKind, string> = {
  fusjon: "border-[rgba(47,93,159,0.2)] bg-[rgba(238,244,252,0.9)] text-[#28527f]",
  fisjon: "border-[rgba(47,93,159,0.2)] bg-[rgba(238,244,252,0.9)] text-[#28527f]",
  konkurs: "border-[rgba(159,47,47,0.18)] bg-[rgba(253,240,240,0.9)] text-[#8a2b2b]",
  avvikling: "border-[rgba(146,91,33,0.18)] bg-[rgba(255,246,236,0.9)] text-[#8a5b21]",
  omlegging: "border-[rgba(146,91,33,0.18)] bg-[rgba(255,246,236,0.9)] text-[#8a5b21]",
  "navn-alene": "border-[rgba(15,23,42,0.1)] bg-[rgba(248,249,250,0.9)] text-slate-600",
  "samtidige-endringer": "border-[rgba(15,23,42,0.1)] bg-[rgba(248,249,250,0.9)] text-slate-600",
  "ingen-kunngjoring": "border-[rgba(15,23,42,0.1)] bg-[rgba(248,249,250,0.9)] text-slate-500",
};

const CONTEXT_TAGS: Record<NameChangeContextKind, string> = {
  fusjon: "Fusjon",
  fisjon: "Fisjon",
  konkurs: "Konkursbehandling",
  avvikling: "Avvikling",
  omlegging: "Større omlegging",
  "navn-alene": "Kun navneendring",
  "samtidige-endringer": "Andre endringer samme dag",
  "ingen-kunngjoring": "Uten kunngjøring",
};

function formatPeriod(fromDate: Date | null, toDate: Date | null) {
  const from = fromDate ? formatDate(fromDate) : "ukjent";
  return toDate ? `${from} – ${formatDate(toDate)}` : `${from} – i dag`;
}

/**
 * States how the other entity's start relates to this company's bankruptcy — the two dates,
 * and nothing read into them. A company set up shortly before a bankruptcy is a lawful and
 * common thing; the register records the sequence, not the intent.
 */
function describeTimingAgainstBankruptcy(holder: RelatedNameHolder, bankruptcyOpenedAt: Date | null) {
  const started = holder.foundedAt ?? holder.registeredAt;
  if (!bankruptcyOpenedAt || !started) {
    return null;
  }

  const days = Math.round((started.getTime() - bankruptcyOpenedAt.getTime()) / DAY_MS);
  const magnitude = Math.abs(days);
  if (magnitude > 730) {
    return null;
  }

  const label = holder.foundedAt ? "stiftet" : "registrert";
  if (days < 0) {
    return `${holder.name} ble ${label} ${magnitude} dager før konkursåpningen i dette foretaket.`;
  }
  if (days > 0) {
    return `${holder.name} ble ${label} ${days} dager etter konkursåpningen i dette foretaket.`;
  }
  return `${holder.name} ble ${label} samme dag som konkursen ble åpnet her.`;
}

/**
 * Other organisation numbers that have carried one of this company's names. The section says
 * what is registered — the shared name and period, people with roles in both, whether they sit
 * in the same municipality — and leaves the conclusion to the reader.
 */
export function RelatedNameHoldersSection({
  holders,
  companyName,
  bankruptcyOpenedAt,
}: {
  holders: RelatedNameHolder[];
  companyName: string;
  bankruptcyOpenedAt?: Date | null;
}) {
  if (holders.length === 0) {
    return null;
  }

  return (
    <Card className="border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.86)] shadow-[0_8px_20px_rgba(15,23,42,0.03)]">
      <div className="border-b border-[rgba(15,23,42,0.08)] pb-4">
        <div className="data-label text-[11px] font-semibold uppercase text-slate-500">
          Andre foretak med samme navn
        </div>
        <h3 className="mt-2 text-[1.55rem] font-semibold tracking-tight text-slate-950">
          {holders.length === 1 ? "Ett annet foretak" : `${holders.length} andre foretak`} har båret et
          navn {companyName} har hatt
        </h3>
        <p className="mt-1.5 max-w-3xl text-sm leading-6 text-slate-600">
          Et foretaksnavn frigis når det endres eller foretaket slettes, og kan da tas i bruk av et
          annet organisasjonsnummer. Under vises det registeret faktisk sier: hvem som har hatt navnet
          når, hvem som har roller begge steder, og hvor de er registrert.
        </p>
      </div>

      <div className="mt-5 space-y-3">
        {holders.map((holder) => {
          const timing = describeTimingAgainstBankruptcy(holder, bankruptcyOpenedAt ?? null);
          return (
            <div
              key={holder.orgNumber}
              className="rounded-xl border border-[rgba(15,23,42,0.08)] bg-[rgba(248,249,250,0.72)] p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "data-label rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase",
                    STATUS_STYLES[holder.status],
                  )}
                >
                  {STATUS_LABELS[holder.status]}
                </span>
                <span className="data-label rounded-full border border-[rgba(15,23,42,0.08)] bg-white px-2.5 py-1 text-[11px] font-semibold uppercase text-slate-500">
                  Org.nr {holder.orgNumber}
                </span>
                {holder.sameMunicipality && holder.municipality ? (
                  <span className="data-label rounded-full border border-[rgba(15,23,42,0.08)] bg-white px-2.5 py-1 text-[11px] font-semibold uppercase text-slate-500">
                    Samme kommune · {holder.municipality}
                  </span>
                ) : null}
              </div>

              <Link
                href={`/companies/${holder.orgNumber}`}
                className="mt-3 inline-block text-[1.05rem] font-semibold tracking-tight text-slate-950 hover:text-[#2f5d9f]"
              >
                {holder.name}
              </Link>

              <p className="mt-1.5 text-sm leading-6 text-slate-600">
                Delt navn: <span className="font-medium text-slate-800">{holder.sharedName}</span>
                {holder.sharedNameIsTheirCurrent
                  ? " — som foretaket bruker i dag"
                  : ` — som foretaket hadde ${formatPeriod(holder.theirPeriod.from, holder.theirPeriod.to)}`}
                {holder.sharedNameIsOurCurrent
                  ? ". Det er navnet dette foretaket bruker i dag."
                  : `. ${companyName} hadde det ${formatPeriod(holder.ourPeriod.from, holder.ourPeriod.to)}.`}
              </p>

              {holder.sharedRoleHolders.length > 0 ? (
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-[rgba(15,23,42,0.08)] bg-white px-3 py-2">
                  <Users className="size-4 shrink-0 text-[#2f5d9f]" />
                  <span className="text-sm text-slate-700">
                    Roller begge steder:{" "}
                    <span className="font-medium text-slate-900">
                      {holder.sharedRoleHolders.join(", ")}
                    </span>
                  </span>
                </div>
              ) : null}

              {timing ? <p className="mt-2 text-sm leading-6 text-slate-600">{timing}</p> : null}

              {holder.foundedAt || holder.registeredAt ? (
                <p className="mt-2 text-xs text-slate-500">
                  {holder.foundedAt ? `Stiftet ${formatDate(holder.foundedAt)}` : null}
                  {holder.foundedAt && holder.registeredAt ? " · " : null}
                  {holder.registeredAt ? `Registrert ${formatDate(holder.registeredAt)}` : null}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/**
 * The name lineage read as a story: every change is shown with the announcement that
 * registered it and with the other filings from the same day, which is what tells a merger
 * apart from a bankruptcy or a plain rebranding.
 */
export function CompanyNameHistorySection({
  history,
  orgNumber,
}: {
  history: CompanyNameHistory;
  orgNumber: string;
}) {
  if (history.segments.length <= 1) {
    return null;
  }

  return (
    <Card className="border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.86)] shadow-[0_8px_20px_rgba(15,23,42,0.03)]">
      <div className="border-b border-[rgba(15,23,42,0.08)] pb-4">
        <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Navnehistorikk</div>
        <h3 className="mt-2 text-[1.55rem] font-semibold tracking-tight text-slate-950">
          Foretaket har hatt {history.segments.length} navn
        </h3>
        <p className="mt-1.5 max-w-3xl text-sm leading-6 text-slate-600">
          Kunngjøringer er knyttet til organisasjonsnummeret {orgNumber}, ikke til navnet. Kunngjøringer fra
          tiden under tidligere navn ligger derfor i den samme tidslinjen nedenfor.
        </p>
      </div>

      <ol className="mt-5 space-y-2">
        {[...history.segments].reverse().map((segment) => (
          <li
            key={`${segment.name}-${segment.fromDate?.toISOString() ?? "start"}`}
            className={cn(
              "flex flex-col gap-1 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between",
              segment.isCurrent
                ? "border-[rgba(52,101,77,0.18)] bg-[rgba(233,245,236,0.75)]"
                : "border-[rgba(15,23,42,0.08)] bg-[rgba(248,249,250,0.72)]",
            )}
          >
            <span className="text-[0.95rem] font-semibold text-slate-950">{segment.name}</span>
            <span className="flex items-center gap-2 text-sm text-slate-600">
              {formatPeriod(segment.fromDate, segment.toDate)}
              {segment.isCurrent ? (
                <span className="data-label rounded-full border border-[rgba(52,101,77,0.16)] bg-white px-2.5 py-1 text-[10px] font-semibold uppercase text-[#36564a]">
                  Gjeldende
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ol>

      {history.changes.length > 0 ? (
        <div className="mt-6 space-y-3">
          <div className="data-label text-[11px] font-semibold uppercase text-slate-500">
            Hva skjedde ved hvert navnebytte
          </div>
          {history.changes.map((change) => (
            <div
              key={`${change.fromName}-${change.toName}`}
              className="rounded-xl border border-[rgba(15,23,42,0.08)] bg-white p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="data-label rounded-full border border-[rgba(15,23,42,0.08)] bg-[rgba(248,249,250,0.9)] px-2.5 py-1 text-[11px] font-semibold uppercase text-slate-500">
                  {change.changedAt ? formatDate(change.changedAt) : "Dato ikke oppgitt"}
                </span>
                <span
                  className={cn(
                    "data-label rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase",
                    CONTEXT_STYLES[change.contextKind],
                  )}
                >
                  {CONTEXT_TAGS[change.contextKind]}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 text-[1.05rem] font-semibold tracking-tight text-slate-950">
                <span>{change.fromName}</span>
                <ArrowRight className="size-4 text-slate-400" />
                <span>{change.toName}</span>
              </div>

              <p className="mt-1.5 text-sm leading-6 text-slate-600">{change.contextLabel}</p>

              {change.context.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {change.context.map((item) => (
                    <span
                      key={item.id}
                      className="rounded-full border border-[rgba(15,23,42,0.08)] bg-[rgba(248,249,250,0.9)] px-2.5 py-1 text-xs text-slate-600"
                    >
                      {item.title}
                    </span>
                  ))}
                </div>
              ) : null}

              {change.announcement ? (
                <a
                  href={change.announcement.detailUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-[#2f5d9f] transition hover:text-[#1f4578]"
                >
                  Åpne kunngjøringen om navneendringen
                  <ArrowUpRight className="size-3.5" />
                </a>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  );
}
