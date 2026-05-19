import { redirect } from "next/navigation";

import { getFinancialReviewerOrNull } from "@/lib/admin-auth";
import {
  getActiveThresholdVersion,
  listPendingThresholdProposals,
  listRecentThresholdVersions,
  type ConfidenceThresholdVersionSummary,
} from "@/server/services/confidence-threshold-version-service";

import {
  applyThresholdProposalAction,
  rejectThresholdProposalAction,
  triggerCalibrationRunAction,
} from "./actions";

export const dynamic = "force-dynamic";

function formatNorwegianDate(date: Date): string {
  return date.toLocaleString("nb-NO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatPercentage(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${value.toFixed(1)} %`;
}

function ImpactCard({ impact }: { impact: unknown }) {
  if (!impact || typeof impact !== "object") return null;
  const record = impact as {
    sampleSize?: number;
    autoPublishRateBefore?: number | null;
    autoPublishRateAfter?: number | null;
    manualReviewRateBefore?: number | null;
    manualReviewRateAfter?: number | null;
    falsePassRate?: number | null;
    falsePassCount?: number;
    highSeverityMissCount?: number;
  };

  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
      <div>
        <dt className="text-xs uppercase tracking-wider text-slate-400">Grunnlag</dt>
        <dd className="font-semibold text-slate-900">{record.sampleSize ?? "—"} reviews</dd>
      </div>
      <div>
        <dt className="text-xs uppercase tracking-wider text-slate-400">Auto-publisert</dt>
        <dd className="font-semibold text-slate-900">
          {formatPercentage(record.autoPublishRateBefore)} → {formatPercentage(record.autoPublishRateAfter)}
        </dd>
      </div>
      <div>
        <dt className="text-xs uppercase tracking-wider text-slate-400">Manuell kontroll</dt>
        <dd className="font-semibold text-slate-900">
          {formatPercentage(record.manualReviewRateBefore)} → {formatPercentage(record.manualReviewRateAfter)}
        </dd>
      </div>
      <div>
        <dt className="text-xs uppercase tracking-wider text-slate-400">Falske godkjenninger</dt>
        <dd className="font-semibold text-slate-900">
          {record.falsePassCount ?? 0}
          {record.falsePassRate !== null && record.falsePassRate !== undefined
            ? ` (${formatPercentage(record.falsePassRate * 100)})`
            : ""}
        </dd>
      </div>
      <div className="col-span-2">
        <dt className="text-xs uppercase tracking-wider text-slate-400">
          Høyrisiko-feil som slapp gjennom
        </dt>
        <dd className="font-semibold text-slate-900">{record.highSeverityMissCount ?? 0}</dd>
      </div>
    </dl>
  );
}

function ProposalCard({ proposal }: { proposal: ConfidenceThresholdVersionSummary }) {
  return (
    <article className="rounded-lg border border-amber-300 bg-amber-50 p-5">
      <header className="mb-3 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900">
            Forslag v{proposal.version}
          </h3>
          <p className="text-xs text-slate-500">
            Foreslått {formatNorwegianDate(proposal.proposedAt)}
          </p>
        </div>
        <span className="rounded-full bg-amber-200 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-900">
          Venter på godkjenning
        </span>
      </header>

      {proposal.summary ? (
        <p className="mb-4 text-sm text-slate-700">{proposal.summary}</p>
      ) : null}

      <div className="mb-4 rounded border border-amber-200 bg-white p-4">
        <ImpactCard impact={proposal.impactEstimate} />
      </div>

      <details className="mb-4 text-sm">
        <summary className="cursor-pointer font-semibold text-slate-700 hover:text-slate-900">
          Vis alle terskler i forslaget
        </summary>
        <pre className="mt-2 overflow-x-auto rounded bg-slate-900 p-3 text-xs text-slate-100">
          {JSON.stringify(proposal.configBlob, null, 2)}
        </pre>
      </details>

      <div className="flex flex-wrap items-center gap-3">
        <form action={applyThresholdProposalAction}>
          <input type="hidden" name="versionId" value={proposal.id} />
          <button
            type="submit"
            className="rounded bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Godkjenn og aktiver
          </button>
        </form>
        <form action={rejectThresholdProposalAction} className="flex items-center gap-2">
          <input type="hidden" name="versionId" value={proposal.id} />
          <input
            type="text"
            name="reason"
            placeholder="Begrunnelse (valgfritt)"
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50"
          >
            Avvis
          </button>
        </form>
      </div>
    </article>
  );
}

function StatusBadge({ status }: { status: ConfidenceThresholdVersionSummary["status"] }) {
  const styles: Record<ConfidenceThresholdVersionSummary["status"], string> = {
    PROPOSED: "bg-amber-100 text-amber-900",
    ACTIVE: "bg-emerald-100 text-emerald-900",
    RETIRED: "bg-slate-200 text-slate-700",
    REJECTED: "bg-rose-100 text-rose-900",
  };
  const labels: Record<ConfidenceThresholdVersionSummary["status"], string> = {
    PROPOSED: "Foreslått",
    ACTIVE: "Aktiv",
    RETIRED: "Pensjonert",
    REJECTED: "Avvist",
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}

export default async function ExtractionLearningPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const reviewer = await getFinancialReviewerOrNull();
  if (!reviewer) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const [active, pending, history] = await Promise.all([
    getActiveThresholdVersion(),
    listPendingThresholdProposals(),
    listRecentThresholdVersions(15),
  ]);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Læring og kalibrering</h1>
        <p className="mt-1 text-sm text-slate-500">
          Her ser du hvordan systemet justerer terskler basert på hva reviewere
          godkjenner og korrigerer. Endringer aktiveres aldri uten din godkjenning.
        </p>
      </header>

      {params.ok ? (
        <div className="rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {params.ok}
        </div>
      ) : null}
      {params.error ? (
        <div className="rounded border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {params.error}
        </div>
      ) : null}

      {/* Active version */}
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <header className="mb-3 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Aktiv versjon</h2>
            {active ? (
              <p className="text-xs text-slate-500">
                v{active.version} aktivert {formatNorwegianDate(active.appliedAt ?? active.proposedAt)}
              </p>
            ) : (
              <p className="text-xs text-slate-500">
                Ingen versjon i database — systemet bruker innebygde standardverdier.
              </p>
            )}
          </div>
          {active ? <StatusBadge status={active.status} /> : null}
        </header>

        {active?.summary ? (
          <p className="text-sm text-slate-700">{active.summary}</p>
        ) : null}

        {active ? (
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer font-semibold text-slate-700 hover:text-slate-900">
              Vis konfigurasjon
            </summary>
            <pre className="mt-2 overflow-x-auto rounded bg-slate-900 p-3 text-xs text-slate-100">
              {JSON.stringify(active.configBlob, null, 2)}
            </pre>
          </details>
        ) : null}
      </section>

      {/* Trigger calibration */}
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <header className="mb-2 flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-slate-900">Kjør kalibrering</h2>
        </header>
        <p className="mb-3 text-sm text-slate-600">
          Kjører analysen mot nylige reviews og oppretter et nytt forslag hvis
          dataene tyder på at tersklene bør justeres. Ingen endring aktiveres
          før du godkjenner forslaget.
        </p>
        <form action={triggerCalibrationRunAction}>
          <button
            type="submit"
            className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Kjør kalibrering nå
          </button>
        </form>
      </section>

      {/* Pending proposals */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">
          Forslag som venter ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <p className="rounded border border-slate-200 bg-white p-5 text-sm text-slate-500">
            Ingen forslag venter på godkjenning.
          </p>
        ) : (
          <div className="space-y-4">
            {pending.map((proposal) => (
              <ProposalCard key={proposal.id} proposal={proposal} />
            ))}
          </div>
        )}
      </section>

      {/* History */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Historikk</h2>
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Versjon
                </th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Status
                </th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Foreslått
                </th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Aktivert
                </th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Sammendrag
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {history.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-4 text-center text-slate-400">
                    Ingen historikk ennå.
                  </td>
                </tr>
              ) : (
                history.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-2 font-semibold text-slate-900">v{row.version}</td>
                    <td className="px-4 py-2">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="px-4 py-2 text-slate-600">
                      {formatNorwegianDate(row.proposedAt)}
                    </td>
                    <td className="px-4 py-2 text-slate-600">
                      {row.appliedAt ? formatNorwegianDate(row.appliedAt) : "—"}
                    </td>
                    <td className="px-4 py-2 text-slate-700">
                      {row.summary ?? row.rejectionReason ?? "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
