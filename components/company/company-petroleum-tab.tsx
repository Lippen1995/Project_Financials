import Link from "next/link";

import { Card } from "@/components/ui/card";
import {
  CompanyPetroleumDiscoveryRow,
  CompanyPetroleumFieldRow,
  CompanyPetroleumInfrastructureRow,
  CompanyPetroleumLicenceRow,
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
            {rows.map((row) => (
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
    </Card>
  );
}

export function CompanyPetroleumTab({ petroleum }: { petroleum: CompanyPetroleumProfile }) {
  if (!petroleum.snapshot) {
    return null;
  }

  return (
    <div className="space-y-6">
      <Card className="border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.86)]">
        <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Sokkeleksponering</div>
        <h2 className="mt-2 text-[1.55rem] font-semibold text-slate-950">Executive snapshot</h2>
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
        <p className="mt-4 text-sm text-slate-600">
          Selskapet har {petroleum.snapshot.operatorFieldCount > 0 ? "operatør" : "licensee"}-eksponering på norsk sokkel,
          med hovedvekt i {petroleum.snapshot.mainAreas[0] ?? "ikke spesifisert område"}.
        </p>
        {petroleum.marketModuleUrl ? (
          <div className="mt-4">
            <Link href={petroleum.marketModuleUrl} className="inline-flex rounded-full border px-4 py-2 text-sm font-semibold">
              Åpne i markedsmodulen
            </Link>
          </div>
        ) : null}
      </Card>

      <PortfolioTable<CompanyPetroleumFieldRow>
        title="Felt"
        rows={petroleum.fields}
        columns={[
          { label: "Rolle", render: (row) => row.role },
          { label: "Område", render: (row) => row.area },
          { label: "Status", render: (row) => row.status },
          { label: "Hydrokarbon", render: (row) => row.hcType },
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
          { label: "Relatert felt", render: (row) => row.relatedFieldName },
        ]}
      />

      <PortfolioTable<CompanyPetroleumInfrastructureRow>
        title="Infrastruktur"
        rows={petroleum.infrastructure}
        columns={[
          { label: "Type", render: (row) => row.entityType },
          { label: "Rolle", render: (row) => row.role },
          { label: "Område", render: (row) => row.area },
          { label: "Status", render: (row) => row.status },
        ]}
      />

      {petroleum.topExposure.length > 0 ? (
        <Card className="border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.86)]">
          <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Eksponeringsfordeling</div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {petroleum.topExposure.map((row) => (
              <div key={`${row.type}-${row.label}`} className="rounded-[0.85rem] border px-3 py-2">
                <div className="text-xs uppercase text-slate-500">{row.label}</div>
                <div className="mt-1 font-semibold text-slate-900">{row.valuePrimary}</div>
                {row.valueSecondary ? <div className="text-sm text-slate-500">{row.valueSecondary}</div> : null}
              </div>
            ))}
          </div>
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
    </div>
  );
}
