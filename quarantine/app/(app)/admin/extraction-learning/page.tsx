import { redirect } from "next/navigation";

import { getFinancialReviewerOrNull } from "@/lib/admin-auth";
import {
  getActiveThresholdVersion,
  listPendingThresholdProposals,
  listRecentThresholdVersions,
  type ConfidenceThresholdVersionSummary,
} from "@/server/services/confidence-threshold-version-service";
import {
  getActivePatternReport,
  type ExtractionPatternReportSummary,
  type ExtractionPatternSummary,
} from "@/server/services/extraction-pattern-analysis-service";
import {
  FEW_SHOT_MILESTONE_THRESHOLD,
  getFewShotLibraryInventory,
  type IndustryLibraryEntry,
} from "@/server/services/extraction-fewshot-retrieval-service";
import {
  listAllActiveModels,
  listPendingModelProposals,
  type MlModelVersionSummary,
} from "@/server/services/ml-model-version-service";
import { pingInferenceService } from "@/server/ml/ml-inference-client";

import {
  applyModelProposalAction,
  applyThresholdProposalAction,
  exportUnitScaleTrainingDataAction,
  rejectModelProposalAction,
  rejectThresholdProposalAction,
  triggerCalibrationRunAction,
  triggerPatternAnalysisAction,
} from "./actions";

const TASK_TYPE_LABELS: Record<MlModelVersionSummary["taskType"], string> = {
  UNIT_SCALE_CLASSIFIER: "Enhetsskala-klassifikator",
  PAGE_TYPE_CLASSIFIER: "Sidetype-klassifikator",
  YEAR_COLUMN_DETECTOR: "År-kolonne-detektor",
  OTHER: "Annet",
};

const ERROR_CLASS_LABELS: Record<ExtractionPatternSummary["errorClass"], string> = {
  UNIT_SCALE_MISS: "Enhetsskala-feil",
  OCR_NOISE: "OCR-støy",
  MISSING_VALUE: "Manglende verdi",
  WRONG_PAGE: "Feil side",
  OTHER: "Annet",
};

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

function PatternRow({ pattern }: { pattern: ExtractionPatternSummary }) {
  return (
    <li className="rounded border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="rounded bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white">
              {pattern.metricKey ?? "—"}
            </span>
            <span className="text-xs font-semibold uppercase tracking-wider text-rose-700">
              {ERROR_CLASS_LABELS[pattern.errorClass]}
            </span>
            <span className="text-xs text-slate-500">
              {pattern.occurrenceCount} forekomster
            </span>
            <span className="text-xs text-slate-400">
              severity {pattern.severityScore.toFixed(1)}
            </span>
          </div>
          {pattern.suggestedFix ? (
            <p className="mt-2 text-sm text-slate-700">{pattern.suggestedFix}</p>
          ) : null}
          <details className="mt-2 text-xs">
            <summary className="cursor-pointer text-slate-500 hover:text-slate-700">
              Vis {pattern.affectedFilings.length} berørte filings
            </summary>
            <ul className="mt-2 max-h-32 overflow-y-auto rounded bg-slate-50 p-2">
              {pattern.affectedFilings.map((id) => (
                <li key={id} className="font-mono text-[11px] text-slate-600">
                  {id}
                </li>
              ))}
            </ul>
          </details>
        </div>
      </div>
    </li>
  );
}

function PatternSection({ report }: { report: ExtractionPatternReportSummary | null }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <header className="mb-3 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Feilmønstre</h2>
          <p className="mt-1 text-sm text-slate-500">
            Systematiske feil i ekstraksjonen, basert på hva reviewere har
            korrigert. Bruk denne listen til å prioritere forbedringer i parseren.
          </p>
        </div>
        <form action={triggerPatternAnalysisAction} className="flex items-center gap-2">
          <select
            name="lookbackDays"
            defaultValue="30"
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="7">Siste 7 dager</option>
            <option value="30">Siste 30 dager</option>
            <option value="90">Siste 90 dager</option>
            <option value="180">Siste 180 dager</option>
          </select>
          <button
            type="submit"
            className="rounded bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Kjør analyse
          </button>
        </form>
      </header>

      {!report ? (
        <p className="rounded border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
          Ingen mønsteranalyse er kjørt ennå. Trykk &quot;Kjør analyse&quot; for å lage en.
        </p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-slate-500">
            <span>
              Periode: {formatNorwegianDate(report.periodStart)} –{" "}
              {formatNorwegianDate(report.periodEnd)}
            </span>
            <span>·</span>
            <span>Korreksjoner totalt: {report.totalCorrections}</span>
            <span>·</span>
            <span>Signifikante mønstre: {report.patterns.length}</span>
          </div>

          {report.patterns.length === 0 ? (
            <p className="rounded border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              {report.notes ?? "Ingen mønstre over signifikans-terskelen."}
            </p>
          ) : (
            <ul className="space-y-2">
              {report.patterns.map((pattern) => (
                <PatternRow key={pattern.id} pattern={pattern} />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function FewShotLibrarySection({ inventory }: { inventory: IndustryLibraryEntry[] }) {
  const totalExamples = inventory.reduce((sum, entry) => sum + entry.exampleCount, 0);
  const withMilestone = inventory.filter((e) => e.hasMilestone).length;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <header className="mb-3">
        <h2 className="text-lg font-semibold text-slate-900">Few-shot bibliotek</h2>
        <p className="mt-1 text-sm text-slate-500">
          Antall reviewer-godkjente eksempler per bransje. Disse brukes når
          ekstraksjonen trenger sammenlignbare referansecase. Bransjer over{" "}
          {FEW_SHOT_MILESTONE_THRESHOLD} eksempler regnes som godt dekket.
        </p>
      </header>

      <div className="mb-4 flex flex-wrap gap-6 rounded border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
        <div>
          <dt className="text-xs uppercase tracking-wider text-slate-400">Totalt</dt>
          <dd className="text-base font-semibold text-slate-900">
            {totalExamples} eksempler
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wider text-slate-400">Bransjer dekket</dt>
          <dd className="text-base font-semibold text-slate-900">
            {inventory.length} ({withMilestone} over terskel)
          </dd>
        </div>
      </div>

      {inventory.length === 0 ? (
        <p className="rounded border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
          Ingen eksempler i biblioteket ennå. Eksempler legges til automatisk
          når reviewere godkjenner eller korrigerer ekstraksjonen.
        </p>
      ) : (
        <div className="overflow-hidden rounded border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Bransje
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Kode
                </th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Eksempler
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {inventory.slice(0, 25).map((entry) => (
                <tr key={entry.industryCode}>
                  <td className="px-3 py-2 text-slate-800">{entry.industryTitle}</td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-500">
                    {entry.industryCode}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold text-slate-900">
                    {entry.exampleCount}
                  </td>
                  <td className="px-3 py-2">
                    {entry.hasMilestone ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-900">
                        Dekket
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-900">
                        Under terskel
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function MlModelsSection({
  activeModels,
  pendingModels,
  inferenceHealth,
}: {
  activeModels: MlModelVersionSummary[];
  pendingModels: MlModelVersionSummary[];
  inferenceHealth: { reachable: boolean; modelsLoaded: string[] };
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <header className="mb-3">
        <h2 className="text-lg font-semibold text-slate-900">Egne modeller</h2>
        <p className="mt-1 text-sm text-slate-500">
          In-house klassifikatorer som erstatter regler bit for bit. Ingen
          tredjeparts-LLM. Hver oppgavetype har sin egen versjonshistorikk;
          aktivering krever godkjenning her.
        </p>
      </header>

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="flex-1 min-w-[200px] rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
          <dt className="text-xs uppercase tracking-wider text-slate-400">Inferens-tjeneste</dt>
          <dd className="font-semibold text-slate-900">
            {inferenceHealth.reachable ? (
              <span className="text-emerald-700">Tilgjengelig</span>
            ) : (
              <span className="text-rose-700">Nede / ikke startet</span>
            )}
          </dd>
          <dd className="mt-1 text-xs text-slate-500">
            Lastede modeller: {inferenceHealth.modelsLoaded.length === 0
              ? "ingen"
              : inferenceHealth.modelsLoaded.join(", ")}
          </dd>
        </div>
        <div className="flex-1 min-w-[200px] rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
          <dt className="text-xs uppercase tracking-wider text-slate-400">Aktive modeller</dt>
          <dd className="font-semibold text-slate-900">{activeModels.length}</dd>
        </div>
        <div className="flex-1 min-w-[200px] rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
          <dt className="text-xs uppercase tracking-wider text-slate-400">Forslag som venter</dt>
          <dd className="font-semibold text-slate-900">{pendingModels.length}</dd>
        </div>
      </div>

      <div className="mb-4 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
        <p className="font-semibold text-amber-900">Trene en ny modell</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-amber-900">
          <li>Trykk &quot;Eksporter treningsdata&quot; under for å lage JSONL-filer.</li>
          <li>
            Kjør Python-skriptet fra <code>docker/ml-inference/</code>:
            <pre className="mt-1 overflow-x-auto rounded bg-white p-2 text-xs">
{`python train_unit_scale.py \\
  --train  output/ml-datasets/unit-scale/train.jsonl \\
  --val    output/ml-datasets/unit-scale/validation.jsonl \\
  --test   output/ml-datasets/unit-scale/test.jsonl \\
  --out    docker/ml-inference/models/unit_scale_classifier.joblib`}
            </pre>
          </li>
          <li>
            Restart inferens-containeren slik at den laster den nye modellen,
            registrer den her med en CLI-kommando, og godkjenn forslaget under.
          </li>
        </ol>
        <form action={exportUnitScaleTrainingDataAction} className="mt-3">
          <button
            type="submit"
            className="rounded bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Eksporter treningsdata (enhetsskala)
          </button>
        </form>
      </div>

      {pendingModels.length > 0 ? (
        <div className="mb-4 space-y-3">
          <h3 className="text-sm font-semibold text-slate-900">
            Forslag som venter ({pendingModels.length})
          </h3>
          {pendingModels.map((model) => (
            <article key={model.id} className="rounded border border-amber-300 bg-amber-50 p-4">
              <header className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-900">
                    {TASK_TYPE_LABELS[model.taskType]} v{model.taskVersion}
                  </p>
                  <p className="text-xs text-slate-500">
                    {model.algorithm} · foreslått{" "}
                    {formatNorwegianDate(model.proposedAt)}
                  </p>
                </div>
              </header>
              {model.summary ? (
                <p className="mb-2 text-sm text-slate-700">{model.summary}</p>
              ) : null}
              {model.evaluationMetrics ? (
                <details className="mb-3 text-xs">
                  <summary className="cursor-pointer font-semibold text-slate-700">
                    Vis evalueringsmetrikker
                  </summary>
                  <pre className="mt-2 overflow-x-auto rounded bg-slate-900 p-2 text-slate-100">
                    {JSON.stringify(model.evaluationMetrics, null, 2)}
                  </pre>
                </details>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <form action={applyModelProposalAction}>
                  <input type="hidden" name="versionId" value={model.id} />
                  <button
                    type="submit"
                    className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700"
                  >
                    Godkjenn og aktiver
                  </button>
                </form>
                <form action={rejectModelProposalAction} className="flex items-center gap-2">
                  <input type="hidden" name="versionId" value={model.id} />
                  <input
                    type="text"
                    name="reason"
                    placeholder="Begrunnelse (valgfritt)"
                    className="rounded border border-slate-300 px-2 py-1 text-sm"
                  />
                  <button
                    type="submit"
                    className="rounded border border-rose-300 bg-white px-3 py-1.5 text-sm font-semibold text-rose-700 hover:bg-rose-50"
                  >
                    Avvis
                  </button>
                </form>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {activeModels.length > 0 ? (
        <div className="overflow-hidden rounded border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Oppgave
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Versjon
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Algoritme
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Aktivert
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {activeModels.map((model) => (
                <tr key={model.id}>
                  <td className="px-3 py-2 text-slate-800">
                    {TASK_TYPE_LABELS[model.taskType]}
                  </td>
                  <td className="px-3 py-2 font-semibold text-slate-900">
                    v{model.taskVersion}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-500">
                    {model.algorithm}
                  </td>
                  <td className="px-3 py-2 text-slate-600">
                    {model.appliedAt ? formatNorwegianDate(model.appliedAt) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
          Ingen aktive modeller ennå. Inntil en modell er aktivert bruker
          pipelinen de eksisterende regelbaserte detektorene.
        </p>
      )}
    </section>
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
  const [
    active,
    pending,
    history,
    patternReport,
    libraryInventory,
    activeModels,
    pendingModels,
    inferenceHealth,
  ] = await Promise.all([
    getActiveThresholdVersion(),
    listPendingThresholdProposals(),
    listRecentThresholdVersions(15),
    getActivePatternReport(),
    getFewShotLibraryInventory(),
    listAllActiveModels(),
    listPendingModelProposals(),
    pingInferenceService(),
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

      {/* Pattern analysis */}
      <PatternSection report={patternReport} />

      {/* Few-shot library */}
      <FewShotLibrarySection inventory={libraryInventory} />

      {/* In-house ML models */}
      <MlModelsSection
        activeModels={activeModels}
        pendingModels={pendingModels}
        inferenceHealth={inferenceHealth}
      />

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
