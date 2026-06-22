"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import type { ShareholdingGraphSnapshot } from "@/lib/types";

type ShareholderSnapshot = Omit<ShareholdingGraphSnapshot, "sourceImportedAt"> & {
  sourceImportedAt: Date | string;
};

export type ShareholdersOverview = {
  snapshot: ShareholderSnapshot;
  availableYears: number[];
  latestExpectedYear: number;
};

const numberFormat = new Intl.NumberFormat("nb-NO");
const percentFormat = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 2 });

function formatPercent(value?: number | null) {
  if (value === null || value === undefined) return "Ikke oppgitt";
  return `${percentFormat.format(value)} %`;
}

function formatShares(value: string) {
  try {
    return numberFormat.format(BigInt(value));
  } catch {
    return value;
  }
}

function formatDate(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "ukjent tidspunkt";
  return new Intl.DateTimeFormat("nb-NO", { dateStyle: "medium" }).format(date);
}

export function ShareholdersTab({
  slug,
  initial,
}: {
  slug: string;
  initial: ShareholdersOverview;
}) {
  const [overview, setOverview] = useState<ShareholdersOverview>(initial);
  const [loading, setLoading] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  useEffect(() => {
    setOverview(initial);
    setRequestError(null);
  }, [initial]);

  async function selectYear(year: number) {
    if (year === overview.snapshot.taxYear || loading) return;
    setLoading(true);
    setRequestError(null);
    try {
      const response = await fetch(`/api/companies/${slug}/ownership?year=${year}`);
      if (!response.ok) {
        setRequestError("Kunne ikke hente aksjonærregister-snapshot for valgt år.");
        return;
      }
      const payload = (await response.json()) as { data: ShareholdersOverview };
      setOverview(payload.data);
    } finally {
      setLoading(false);
    }
  }

  const shareholderById = useMemo(
    () => new Map(overview.snapshot.shareholders.map((shareholder) => [shareholder.id, shareholder])),
    [overview.snapshot.shareholders],
  );
  const hasAvailableSnapshot =
    !overview.snapshot.snapshotId.startsWith("unavailable:") &&
    overview.availableYears.includes(overview.snapshot.taxYear);

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <div>
          <h2 className="editorial-display text-3xl font-semibold text-[var(--px-text)]">
            Aksjonærer
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--px-muted)]">
            Aksjonærlisten viser et årlig snapshot fra Skatteetatens aksjonærregister. Dette er
            direkte aksjonærer i selskapet for valgt år, ikke en rekonstruert konsernstruktur.
          </p>
        </div>

        <div className="flex flex-col gap-3 border-y border-[var(--px-border)] py-3 sm:flex-row sm:items-center sm:justify-between">
          {overview.availableYears.length > 0 ? (
            <label className="flex items-center gap-2 text-sm text-[var(--px-muted)]">
              <span className="data-label text-[11px] font-semibold uppercase">År</span>
              <select
                value={overview.snapshot.taxYear}
                disabled={loading}
                onChange={(event) => selectYear(Number(event.target.value))}
                className="rounded-xl border border-[var(--px-border)] bg-[var(--px-surface)] px-3 py-2 text-sm font-semibold tabular-nums text-[var(--px-text)] outline-none transition-colors hover:border-[var(--px-accent)] disabled:opacity-50"
              >
                {overview.availableYears.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <span className="text-sm text-[var(--px-muted)]">
              Ingen importerte snapshot-år er tilgjengelige.
            </span>
          )}
          <span className="text-xs text-[var(--px-muted)]">
            {hasAvailableSnapshot
              ? `Valgt år: aksjonærregister-snapshot ${overview.snapshot.taxYear}`
              : "Snapshot ikke tilgjengelig for dette selskapet"}
          </span>
        </div>
      </section>

      {requestError ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {requestError}
        </p>
      ) : null}

      {overview.snapshot.availabilityMessage ? (
        <p className="rounded-xl border border-dashed border-[var(--px-border)] bg-[var(--px-subtle)] px-4 py-3 text-sm leading-6 text-[var(--px-muted)]">
          {overview.snapshot.availabilityMessage}
        </p>
      ) : null}

      {overview.snapshot.ownerships.length > 0 ? (
        <div className="overflow-x-auto border-y border-[var(--px-border)]">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--px-border)] text-left">
                <th className="data-label py-2 pr-4 text-[10px] font-semibold uppercase text-[var(--px-muted)]">
                  Aksjonær
                </th>
                <th className="data-label py-2 pr-4 text-[10px] font-semibold uppercase text-[var(--px-muted)]">
                  Type
                </th>
                <th className="data-label py-2 pr-4 text-right text-[10px] font-semibold uppercase text-[var(--px-muted)]">
                  Aksjer
                </th>
                <th className="data-label py-2 text-right text-[10px] font-semibold uppercase text-[var(--px-muted)]">
                  Eierandel
                </th>
              </tr>
            </thead>
            <tbody>
              {overview.snapshot.ownerships.map((ownership) => {
                const shareholder = shareholderById.get(ownership.shareholderId);
                const orgNumber = shareholder?.linkedCompanyOrgNumber ?? null;
                return (
                  <tr
                    key={ownership.id}
                    className="border-b border-[rgba(15,23,42,0.06)] transition-colors hover:bg-[var(--px-subtle)]"
                  >
                    <td className="py-2 pr-4">
                      {orgNumber ? (
                        <Link
                          href={`/companies/${orgNumber}?tab=konsern`}
                          className="font-semibold text-[var(--px-text)] hover:underline"
                        >
                          {shareholder?.name ?? ownership.shareholderId}
                        </Link>
                      ) : (
                        <span className="font-semibold text-[var(--px-text)]">
                          {shareholder?.name ?? ownership.shareholderId}
                        </span>
                      )}
                      <div className="text-xs text-[var(--px-muted)]">
                        {orgNumber ? `Org.nr. ${orgNumber}` : shareholder?.birthYear ? `Født ${shareholder.birthYear}` : ""}
                        {shareholder?.postalPlace ? ` · ${shareholder.postalPlace}` : ""}
                      </div>
                    </td>
                    <td className="py-2 pr-4 text-[var(--px-muted)]">
                      {shareholder?.type === "PERSON"
                        ? "Person"
                        : shareholder?.type === "COMPANY"
                          ? "Selskap"
                          : "Uavklart"}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums text-[var(--px-text)]">
                      {formatShares(ownership.numberOfShares)}
                    </td>
                    <td className="py-2 text-right font-semibold tabular-nums text-[var(--px-text)]">
                      {formatPercent(ownership.ownershipPercent)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-[var(--px-border)] bg-[var(--px-subtle)] px-4 py-3 text-sm leading-6 text-[var(--px-muted)]">
          Ingen aksjonærposter er tilgjengelige for valgt år.
        </p>
      )}

      <p className="border-t border-[var(--px-border)] pt-3 text-xs leading-5 text-[var(--px-muted)]">
        Kilde: Skatteetatens aksjonærregister.{" "}
        {hasAvailableSnapshot
          ? `Snapshot-år ${overview.snapshot.taxYear}; importert ${formatDate(
              overview.snapshot.sourceImportedAt,
            )}.`
          : "Ingen importert snapshot er tilgjengelig for valgt selskap."}{" "}
        Siste forventede tilgjengelige år er {overview.latestExpectedYear}.
      </p>
    </div>
  );
}
