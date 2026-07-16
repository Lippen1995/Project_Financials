import type { Route } from "next";
import Link from "next/link";

import { formatCompactAmount, formatScore, getHealthColor } from "@/lib/distress-presentation";
import { DistressModuleSectorRow } from "@/lib/types";

function buildSectorHref(
  workspaceId: string,
  searchParams: Record<string, string | string[] | undefined>,
  sectorCode: string,
): Route {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (key === "sectorCode" || key === "page") {
      continue;
    }

    if (typeof value === "string" && value.trim()) {
      params.set(key, value);
    }
  }

  params.set("sectorCode", sectorCode);
  return `/workspaces/${workspaceId}/distress?${params.toString()}` as Route;
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
      <span className="text-[11.5px] text-[var(--px-muted)]">{label}</span>
    </div>
  );
}

export function DistressSectorHealth({
  workspaceId,
  sectors,
  searchParams,
  activeSectorCode,
}: {
  workspaceId: string;
  sectors: DistressModuleSectorRow[];
  searchParams: Record<string, string | string[] | undefined>;
  activeSectorCode?: string;
}) {
  return (
    <section>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-5">
        <div>
          <div className="data-label text-[11px] text-[var(--px-accent)]">Sektoroversikt</div>
          <h2 className="editorial-display mt-2 text-[26px] leading-[1.05] text-[var(--px-text)]">
            Hvilke sektorer har flest konkurser?
          </h2>
          <p className="mt-2 max-w-[60ch] text-[13px] text-[var(--px-muted)]">
            Aggregert finansiell helse per sektor i utvalget (lav = svak). Klikk en sektor for å filtrere tabellen over.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Legend color="var(--px-error)" label="Svak helse" />
          <Legend color="var(--px-warning)" label="Sårbar" />
          <Legend color="var(--px-success)" label="God helse" />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--px-border-subtle)] bg-[var(--px-surface-strong)]">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--px-border-subtle)] bg-[#f1f3f9]">
              <th className="data-label whitespace-nowrap px-5 py-3 text-left text-[11px] text-[var(--px-muted)]">
                Sektor
              </th>
              <th className="data-label whitespace-nowrap px-4 py-3 text-right text-[11px] text-[var(--px-muted)]">
                Selskaper
              </th>
              <th className="data-label whitespace-nowrap px-4 py-3 text-right text-[11px] text-[var(--px-muted)]">
                Konkursåpn.
              </th>
              <th className="data-label w-[38%] whitespace-nowrap px-4 py-3 text-left text-[11px] text-[var(--px-muted)]">
                Snitt finansiell helse
              </th>
              <th className="data-label whitespace-nowrap px-5 py-3 text-right text-[11px] text-[var(--px-muted)]">
                Balanseførte eiendeler
              </th>
            </tr>
          </thead>
          <tbody>
            {sectors.map((sector) => {
              const color = getHealthColor(sector.avgHealthScore);
              const isActive = sector.sectorCode === activeSectorCode;

              return (
                <tr
                  key={sector.sectorCode}
                  className="border-b border-[rgba(15,23,42,0.06)] transition-colors hover:bg-[rgba(248,249,250,0.85)]"
                  style={{ borderLeft: `3px solid ${isActive ? "var(--px-accent)" : "transparent"}` }}
                >
                  <td className="px-5 py-3.5 align-middle text-[14.5px] font-semibold text-[var(--px-text)]">
                    <Link
                      href={buildSectorHref(workspaceId, searchParams, sector.sectorCode)}
                      scroll={false}
                      className="hover:text-[var(--px-accent)]"
                    >
                      {sector.sectorLabel ?? sector.sectorCode}
                    </Link>
                  </td>
                  <td className="px-4 py-3.5 text-right align-middle text-[13.5px] text-[var(--px-text)] tabular-nums">
                    {sector.companyCount.toLocaleString("nb-NO")}
                  </td>
                  <td
                    className="px-4 py-3.5 text-right align-middle text-[13.5px] font-semibold tabular-nums"
                    style={{ color: sector.bankruptcyCount > 0 ? "var(--px-error)" : "var(--px-muted)" }}
                  >
                    {sector.bankruptcyCount.toLocaleString("nb-NO")}
                  </td>
                  <td className="px-4 py-3.5 align-middle">
                    <div className="flex items-center gap-2.5">
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[rgba(15,23,42,0.06)]">
                        {sector.avgHealthScore !== null ? (
                          <span
                            className="block h-full rounded-full"
                            style={{ width: `${sector.avgHealthScore}%`, background: color }}
                          />
                        ) : null}
                      </span>
                      <span
                        className="w-6 text-right text-[13.5px] font-semibold tabular-nums"
                        style={{ color }}
                        title={sector.avgHealthScore === null ? "Ingen selskaper med regnskap i denne sektoren" : undefined}
                      >
                        {formatScore(sector.avgHealthScore)}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-right align-middle text-[13.5px] font-semibold text-[var(--px-accent)] tabular-nums">
                    {formatCompactAmount(sector.totalAssets)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {sectors.length === 0 ? (
          <div className="p-10 text-center text-sm text-[var(--px-muted)]">
            Ingen sektorer å vise for dette utvalget.
          </div>
        ) : null}
      </div>
    </section>
  );
}
