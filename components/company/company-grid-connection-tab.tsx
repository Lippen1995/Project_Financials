import { Zap } from "lucide-react";

import { Card } from "@/components/ui/card";
import { CompanyGridConnectionProfile, GridConnectionStatus } from "@/lib/types";
import { formatDate, formatNumber } from "@/lib/utils";

type Props = {
  profile: CompanyGridConnectionProfile;
};

function statusLabel(status: GridConnectionStatus) {
  if (status === "QUEUE") return "Nettkø";
  if (status === "RESERVED") return "Nettreservasjon";
  return "Nettilknytning";
}

function formatMw(value: number) {
  return `${formatNumber(Math.round(value * 10) / 10)} MW`;
}

export function CompanyGridConnectionTab({ profile }: Props) {
  const summary = [
    ["Totalt", profile.overview.totalCapacityMw, profile.records.length],
    ["Nettkø", profile.overview.queueCapacityMw, profile.overview.queueCount],
    ["Reservert", profile.overview.reservedCapacityMw, profile.overview.reservedCount],
    ["Tilknyttet", profile.overview.connectedCapacityMw, profile.overview.connectedCount],
  ] as const;

  return (
    <div className="space-y-6">
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {summary.map(([label, capacity, count]) => (
          <Card key={label} className="border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.86)] p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="data-label text-[11px] font-semibold uppercase text-slate-500">{label}</div>
                <div className="mt-2 text-2xl font-semibold tabular-nums text-slate-950">{formatMw(capacity)}</div>
              </div>
              <div className="rounded-full border border-[rgba(15,23,42,0.1)] bg-[rgba(248,249,250,0.8)] p-2 text-slate-600">
                <Zap className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 text-sm text-slate-500">{formatNumber(count)} saker</div>
          </Card>
        ))}
      </section>

      <Card className="border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.86)]">
        <div className="border-b border-[rgba(15,23,42,0.08)] pb-4">
          <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Nettilknytning</div>
          <h2 className="mt-2 text-[1.55rem] font-semibold text-slate-950">
            Kø, reservasjon og tilknyttet kapasitet
          </h2>
          <p className="mt-1.5 text-sm leading-6 text-slate-500">
            Alle kapasiteter vises i MW og bare når de kan knyttes til selskapet fra offentlig kilde.
          </p>
        </div>

        {profile.records.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-[rgba(15,23,42,0.14)] bg-[rgba(248,249,250,0.62)] p-6 text-sm leading-6 text-slate-600">
            {profile.availability.message}
          </div>
        ) : (
          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-[rgba(15,23,42,0.08)] text-left text-slate-500">
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 font-semibold">Prosjekt</th>
                  <th className="px-3 py-2 font-semibold">Kapasitet</th>
                  <th className="px-3 py-2 font-semibold">Område</th>
                  <th className="px-3 py-2 font-semibold">Tilknytningspunkt</th>
                  <th className="px-3 py-2 font-semibold">Dato</th>
                  <th className="px-3 py-2 font-semibold">Vilkår</th>
                </tr>
              </thead>
              <tbody>
                {profile.records.map((record) => (
                  <tr key={record.id} className="border-b border-[rgba(15,23,42,0.06)]">
                    <td className="px-3 py-3 font-medium text-slate-900">{statusLabel(record.status)}</td>
                    <td className="px-3 py-3">{record.projectName ?? record.companyName ?? "Ikke oppgitt"}</td>
                    <td className="px-3 py-3 tabular-nums">{formatMw(record.capacityMw)}</td>
                    <td className="px-3 py-3">
                      {[record.area, record.municipality, record.county].filter(Boolean).join(" · ") || "Ikke oppgitt"}
                    </td>
                    <td className="px-3 py-3">{record.connectionPoint ?? record.networkLevel ?? "Ikke oppgitt"}</td>
                    <td className="px-3 py-3">
                      {formatDate(record.connectedAt ?? record.reservedAt ?? record.expectedConnectionDate)}
                    </td>
                    <td className="px-3 py-3">
                      {record.specialTerms === null ? "Ikke oppgitt" : record.specialTerms ? "Særlige vilkår" : "Ordinært"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.86)] text-sm leading-6 text-slate-600">
        <p>
          Kilde: Statnett. Offentlig statistikk for tilknytningssaker kan være manuelt registrert og mangle enkelte saker.
        </p>
        <p className="mt-1">
          Fjord Insight viser ikke strømkontrakter eller ikke-offentlige reservasjoner uten verifiserbar kilde.
        </p>
      </Card>
    </div>
  );
}
