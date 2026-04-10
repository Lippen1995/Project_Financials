import Link from "next/link";

import { Card } from "@/components/ui/card";
import {
  CompanyPetroleumDiscoveryRow,
  CompanyPetroleumFieldRow,
  CompanyPetroleumInfrastructureRow,
  CompanyPetroleumLicenceRow,
  CompanyPetroleumPipelineAsset,
  CompanyPetroleumProfile,
} from "@/lib/types";
import { formatDate, formatNumber } from "@/lib/utils";

function formatCompactNok(value?: number | null) {
  if (value === null || value === undefined) return "Ikke tilgjengelig";
  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "NOK",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatOe(value?: number | null) {
  if (value === null || value === undefined) return "Ikke tilgjengelig";
  return `${new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 1 }).format(value)} mill. oe`;
}

function BreakdownBars({ title, rows }: { title: string; rows: CompanyPetroleumProfile["areaBreakdown"] }) {
  if (rows.length === 0) return null;
  return (
    <div>
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <div className="mt-3 space-y-2">
        {rows.slice(0, 5).map((row) => (
          <div key={row.label}>
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span>{row.label}</span>
              <span>{formatNumber(row.value)}</span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-slate-100">
              <div className="h-2 rounded-full bg-[#31495f]" style={{ width: `${Math.min(100, row.sharePercent ?? 0)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PipelineAssetList({ title, rows }: { title: string; rows: CompanyPetroleumPipelineAsset[] }) {
  if (rows.length === 0) return null;
  return (
    <div>
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <div className="mt-2 space-y-2">
        {rows.slice(0, 5).map((row) => (
          <div key={`${row.entityType}-${row.entityId}`} className="rounded-[0.85rem] border p-3 text-sm text-slate-700">
            <div className="font-semibold text-slate-900">{row.name}</div>
            <div className="text-xs uppercase text-slate-500">{row.entityType} · {row.status ?? "Status ukjent"}</div>
            {row.area ? <div className="mt-1">{row.area}</div> : null}
            {row.investmentNok ? <div className="mt-1">Investering: {formatCompactNok(row.investmentNok)}</div> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function PortfolioTable<T extends { entityId: string; name: string; detailUrl?: string | null }>(
  {
    title,
    rows,
    columns,
  }: {
    title: string;
    rows: T[];
    columns: Array<{ label: string; render: (row: T) => string | number | null | undefined }>;
  },
) {
  if (rows.length === 0) return null;

  return (
    <Card className="border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.86)]">
      <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Portefølje</div>
      <h3 className="mt-2 text-xl font-semibold text-slate-950">{title}</h3>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-[0.06em] text-slate-500">
            <tr>
              <th className="px-3 py-2">Objekt</th>
              {columns.map((column) => (
                <th key={column.label} className="px-3 py-2">{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 8).map((row) => (
              <tr key={row.entityId} className="border-t border-[rgba(15,23,42,0.06)] text-slate-700">
                <td className="px-3 py-2 font-semibold text-slate-900">
                  {row.detailUrl ? <Link href={row.detailUrl}>{row.name}</Link> : row.name}
                </td>
                {columns.map((column) => (
                  <td key={`${row.entityId}-${column.label}`} className="px-3 py-2">{column.render(row) ?? "-"}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 8 ? (
        <div className="mt-3 text-xs text-slate-500">Viser topp 8 av {rows.length} objekter.</div>
      ) : null}
    </Card>
  );
}

export function CompanyPetroleumTab({ petroleum }: { petroleum: CompanyPetroleumProfile }) {
  if (!petroleum.snapshot) return null;

  return (
    <div className="space-y-6">
      <Card className="border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.86)]">
        <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Sokkeleksponering</div>
        <h2 className="mt-2 text-[1.55rem] font-semibold text-slate-950">Snapshot</h2>
        <p className="mt-2 text-sm text-slate-600">Selskapsorientert oppsummering av upstream-eksponering basert på verifiserte petroleumdata.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div>Opererte felt: <strong>{formatNumber(petroleum.snapshot.operatorFieldCount)}</strong></div>
          <div>Lisenser: <strong>{formatNumber(petroleum.snapshot.licenceCount)}</strong></div>
          <div>Funn: <strong>{formatNumber(petroleum.snapshot.discoveryCount)}</strong></div>
          <div>Infrastruktur: <strong>{formatNumber(petroleum.snapshot.facilityCount + petroleum.snapshot.tufCount)}</strong></div>
          <div>Operert produksjon: <strong>{formatOe(petroleum.snapshot.operatedProductionOe)}</strong></div>
          <div>Gjenværende reserver: <strong>{formatOe(petroleum.snapshot.remainingReservesOe)}</strong></div>
          <div>Forventede investeringer: <strong>{formatCompactNok(petroleum.snapshot.expectedFutureInvestmentNok)}</strong></div>
          <div>Hovedområder: <strong>{petroleum.snapshot.mainAreas.slice(0, 3).join(", ") || "Ikke tilgjengelig"}</strong></div>
        </div>
        {petroleum.executiveSummary.length > 0 ? (
          <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-slate-700">
            {petroleum.executiveSummary.map((item) => <li key={item}>{item}</li>)}
          </ul>
        ) : null}
      </Card>

      <Card className="border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.86)]">
        <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Eksponeringsfordeling</div>
        <div className="mt-4 grid gap-6 lg:grid-cols-3">
          <BreakdownBars title="Områder" rows={petroleum.areaBreakdown} />
          <BreakdownBars title="Hydrokarbon" rows={petroleum.hydrocarbonBreakdown} />
          <BreakdownBars title="Rolle" rows={petroleum.roleBreakdown} />
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">Topp felt på produksjon</div>
            {petroleum.topAssetBreakdown.byProduction.slice(0, 5).map((row) => <div key={row.entityId} className="text-sm text-slate-700">{row.name}</div>)}
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-900">Topp felt på reserver</div>
            {petroleum.topAssetBreakdown.byReserves.slice(0, 5).map((row) => <div key={row.entityId} className="text-sm text-slate-700">{row.name}</div>)}
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-900">Topp felt på investering</div>
            {petroleum.topAssetBreakdown.byInvestment.slice(0, 5).map((row) => <div key={row.entityId} className="text-sm text-slate-700">{row.name}</div>)}
          </div>
        </div>
      </Card>

      <PortfolioTable<CompanyPetroleumFieldRow>
        title="Felt"
        rows={petroleum.fields}
        columns={[
          { label: "Rolle", render: (row) => row.role },
          { label: "Område", render: (row) => row.area },
          { label: "Status", render: (row) => row.status },
          { label: "Produksjon", render: (row) => row.latestProductionValue },
        ]}
      />
      <PortfolioTable<CompanyPetroleumLicenceRow>
        title="Lisenser"
        rows={petroleum.licences}
        columns={[
          { label: "Rolle", render: (row) => row.role },
          { label: "Område", render: (row) => row.area },
          { label: "Fase", render: (row) => row.currentPhase },
          { label: "Overføringer", render: (row) => row.transferCount },
        ]}
      />
      <PortfolioTable<CompanyPetroleumDiscoveryRow>
        title="Funn"
        rows={petroleum.discoveries}
        columns={[
          { label: "Rolle", render: (row) => row.role },
          { label: "Område", render: (row) => row.area },
          { label: "Hydrokarbon", render: (row) => row.hcType },
        ]}
      />
      <PortfolioTable<CompanyPetroleumInfrastructureRow>
        title="Infrastruktur"
        rows={petroleum.infrastructure}
        columns={[
          { label: "Type", render: (row) => row.entityType },
          { label: "Rolle", render: (row) => row.role },
          { label: "Status", render: (row) => row.status },
        ]}
      />

      {petroleum.pipeline ? (
        <Card className="border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.86)]">
          <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Utvikling og pipeline</div>
          <div className="mt-4 grid gap-6 lg:grid-cols-2">
            <PipelineAssetList title="Utviklingsassets" rows={petroleum.pipeline.developmentAssets} />
            <PipelineAssetList title="Investeringssignaler" rows={petroleum.pipeline.futureInvestmentSignals} />
          </div>
          {petroleum.pipeline.insights.length > 0 ? (
            <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-slate-700">
              {petroleum.pipeline.insights.map((insight) => <li key={insight}>{insight}</li>)}
            </ul>
          ) : null}
        </Card>
      ) : null}

      {petroleum.recentEvents.length > 0 ? (
        <Card className="border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.86)]">
          <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Hendelser</div>
          <div className="mt-4 space-y-3">
            {petroleum.recentEvents.slice(0, 10).map((event) => (
              <div key={event.id} className="rounded-[0.85rem] border p-3">
                <div className="font-semibold text-slate-900">{event.title}</div>
                <div className="text-xs uppercase text-slate-500">{event.source} · {event.eventType}</div>
                {event.summary ? <div className="mt-1 text-sm text-slate-600">{event.summary}</div> : null}
                {event.publishedAt ? <div className="mt-1 text-xs text-slate-500">{formatDate(event.publishedAt)}</div> : null}
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {petroleum.marketModuleUrl ? (
        <Card className="border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.86)]">
          <Link href={petroleum.marketModuleUrl} className="inline-flex rounded-full border px-4 py-2 text-sm font-semibold">
            Åpne full portefølje i markedsmodulen
          </Link>
        </Card>
      ) : null}
    </div>
  );
}
