import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getAnnualReportManualReviewCandidate } from "@/server/services/annual-report-manual-review-round-service";

import { saveGoldSetManualReviewDecisionAction } from "./actions";

function formatTimestamp(value: string | null | undefined) {
  if (!value) {
    return "—";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Ukjent";
  }
  return parsed.toLocaleString("nb-NO");
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  return `${(value * 100).toFixed(1)}%`;
}

function formatInteger(value: string | null | undefined) {
  if (!value) {
    return "—";
  }
  const sign = value.startsWith("-") ? "-" : "";
  const digits = sign ? value.slice(1) : value;
  if (!/^\d+$/.test(digits)) {
    return value;
  }
  return `${sign}${digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ")}`;
}

const DECISION_VALUES = [
  "LEGACY_CORRECT",
  "UNIFIED_CORRECT",
  "BOTH_CORRECT",
  "BOTH_WRONG",
  "AMBIGUOUS",
  "NEEDS_EXTRACTION_FIX",
  "BLOCK_PUBLISH",
] as const;

export default async function GoldSetManualReviewCandidatePage({
  params,
  searchParams,
}: {
  params: Promise<{ candidateId: string }>;
  searchParams: Promise<{ runId?: string; ok?: string; error?: string }>;
}) {
  const { candidateId } = await params;
  const { runId, ok, error } = await searchParams;

  if (!runId) {
    notFound();
  }

  const result = await getAnnualReportManualReviewCandidate(candidateId, runId);
  if (!result) {
    notFound();
  }

  const { round, candidate } = result;
  const issueClassOptions = candidate.issueClasses.length > 0 ? candidate.issueClasses : ["manual_review_round"];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link href="/admin/annual-report-reviews" className="hover:text-slate-700">
          ← Tilbake til review-kø
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#162233]">
            {candidate.companyName ?? candidate.filingId}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Org.nr {candidate.orgNumber ?? "—"} · Regnskapsår {candidate.accountingYear ?? "—"} · Filing {candidate.filingId}
          </p>
          <p className="mt-1 text-xs font-mono text-slate-400">
            Review round {round.reviewRoundId} · Candidate {candidate.candidateId}
          </p>
        </div>
        <div className="flex gap-2">
          <span className="rounded border border-[rgba(15,23,42,0.12)] px-3 py-1 text-sm text-slate-700">
            {candidate.status}
          </span>
          <span className="rounded border border-[rgba(15,23,42,0.12)] px-3 py-1 text-sm text-slate-700">
            {candidate.severity}
          </span>
        </div>
      </div>

      {ok ? (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {ok}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white p-6 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
              Reviewgrunnlag
            </h2>
            <dl className="mt-4 grid gap-4 text-sm md:grid-cols-2">
              <div>
                <dt className="text-slate-500">Confidence gate</dt>
                <dd className="mt-1 text-slate-700">{candidate.confidenceGateResult ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">First divergence stage</dt>
                <dd className="mt-1 text-slate-700">{candidate.firstDivergenceStage ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Tags</dt>
                <dd className="mt-1 text-slate-700">{candidate.tags.join(", ") || "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Evidence</dt>
                <dd className="mt-1 text-slate-700">
                  {(candidate.evidenceType ?? "Ukjent")} · {(candidate.evidenceQuality ?? "Ukjent")}
                </dd>
              </div>
            </dl>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div>
                <h3 className="text-sm font-semibold text-[#162233]">Review reasons</h3>
                <ul className="mt-2 space-y-2 text-sm text-slate-700">
                  {candidate.reviewReasons.map((reason) => (
                    <li key={reason} className="rounded-lg bg-[#f9f9f7] px-3 py-2">
                      {reason}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[#162233]">Issue classes</h3>
                <ul className="mt-2 space-y-2 text-sm text-slate-700">
                  {candidate.issueClasses.map((issueClass) => (
                    <li key={issueClass} className="rounded-lg bg-[#f9f9f7] px-3 py-2 font-mono text-xs">
                      {issueClass}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white p-6 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
              Artifact references
            </h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[rgba(15,23,42,0.08)] bg-[#f9f9f7]">
                    <th className="px-3 py-2 text-left font-medium text-slate-500">Artifact</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-500">Status</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-500">Reference</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-500">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {candidate.artifactRefs.map((artifact) => (
                    <tr key={artifact.key} className="border-b border-[rgba(15,23,42,0.06)] last:border-0">
                      <td className="px-3 py-2 text-slate-700">{artifact.label}</td>
                      <td className="px-3 py-2 text-slate-700">{artifact.status}</td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-600">
                        {artifact.href ? (
                          <a href={artifact.href} className="underline" target="_blank" rel="noreferrer">
                            {artifact.artifactId ?? artifact.storageKey ?? artifact.href}
                          </a>
                        ) : (
                          artifact.artifactId ?? artifact.storageKey ?? "—"
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-600">{artifact.note ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white p-6 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
              Financial comparison table
            </h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[rgba(15,23,42,0.08)] bg-[#f9f9f7]">
                    <th className="px-3 py-2 text-left font-medium text-slate-500">Canonical key</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-500">Year</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-500">Legacy label</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-500">Unified label</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-500">Legacy value NOK</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-500">Unified value NOK</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-500">Delta NOK</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-500">Relative deviation</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-500">Match status</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-500">Unit scale info</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-500">Review required</th>
                  </tr>
                </thead>
                <tbody>
                  {candidate.financialComparisons.map((comparison) => (
                    <tr
                      key={`${comparison.canonicalKey}-${comparison.fiscalYear}-${comparison.match}`}
                      className="border-b border-[rgba(15,23,42,0.06)] last:border-0"
                    >
                      <td className="px-3 py-2 font-mono text-xs text-slate-700">{comparison.canonicalKey}</td>
                      <td className="px-3 py-2 text-slate-700">{comparison.fiscalYear ?? "—"}</td>
                      <td className="px-3 py-2 text-slate-700">{comparison.legacyLabel ?? "—"}</td>
                      <td className="px-3 py-2 text-slate-700">{comparison.unifiedLabel ?? "—"}</td>
                      <td className="px-3 py-2 text-slate-700">{formatInteger(comparison.legacyValueNok)}</td>
                      <td className="px-3 py-2 text-slate-700">{formatInteger(comparison.unifiedValueNok)}</td>
                      <td className="px-3 py-2 text-slate-700">{formatInteger(comparison.deltaNok)}</td>
                      <td className="px-3 py-2 text-slate-700">{formatPercent(comparison.relativeDeviation)}</td>
                      <td className="px-3 py-2 text-slate-700">{comparison.match ?? "—"}</td>
                      <td className="px-3 py-2 text-slate-700">
                        {comparison.legacyUnitScale ?? "—"} / {comparison.unifiedUnitScale ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-slate-700">{comparison.reviewRequired ? "Ja" : "Nei"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white p-6 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
              Narrative comparison table
            </h2>
            {candidate.narrativeComparisons.length === 0 ? (
              <div className="mt-4 text-sm text-slate-400">Ingen narrative comparison data tilgjengelig.</div>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[rgba(15,23,42,0.08)] bg-[#f9f9f7]">
                      <th className="px-3 py-2 text-left font-medium text-slate-500">Kind</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-500">Legacy found</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-500">Unified found</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-500">Unified section kind</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-500">Text similarity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidate.narrativeComparisons.map((comparison, index) => (
                      <tr key={`${String(comparison.kind)}-${index}`} className="border-b border-[rgba(15,23,42,0.06)] last:border-0">
                        <td className="px-3 py-2 text-slate-700">{String(comparison.kind ?? "—")}</td>
                        <td className="px-3 py-2 text-slate-700">{comparison.legacyFound === true ? "Ja" : "Nei"}</td>
                        <td className="px-3 py-2 text-slate-700">{comparison.unifiedFound === true ? "Ja" : "Nei"}</td>
                        <td className="px-3 py-2 text-slate-700">{String(comparison.unifiedSectionKind ?? "—")}</td>
                        <td className="px-3 py-2 text-slate-700">{formatPercent(Number(comparison.textSimilarity ?? NaN))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white p-6 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
              Candidate summary
            </h2>
            <dl className="mt-4 grid gap-3 text-sm">
              <div>
                <dt className="text-slate-500">Updated/reviewed</dt>
                <dd className="mt-1 text-slate-700">{formatTimestamp(candidate.updatedAt)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Mismatch count</dt>
                <dd className="mt-1 text-slate-700">{candidate.comparisonResult.mismatchCount}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Narrative mismatch count</dt>
                <dd className="mt-1 text-slate-700">{candidate.comparisonResult.narrativeMismatchCount}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Match rate</dt>
                <dd className="mt-1 text-slate-700">{formatPercent(candidate.comparisonResult.matchRate)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Latest decision</dt>
                <dd className="mt-1 text-slate-700">{candidate.latestDecision?.decision ?? "—"}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white p-6 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
              Confidence gate diagnostics
            </h2>
            {candidate.confidenceGateDiagnostics.length === 0 ? (
              <div className="mt-4 text-sm text-slate-400">Ingen WARN/FAIL diagnostics tilgjengelig.</div>
            ) : (
              <div className="mt-4 space-y-3">
                {candidate.confidenceGateDiagnostics.map((diagnostic) => (
                  <div key={diagnostic.checkCode} className="rounded-xl bg-[#f9f9f7] px-4 py-3">
                    <div className="font-mono text-xs text-slate-500">{diagnostic.checkCode}</div>
                    <div className="mt-1 text-sm font-medium text-[#162233]">{diagnostic.verdict}</div>
                    <div className="mt-1 text-sm text-slate-700">{diagnostic.message}</div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white p-6 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
              Reviewer decision
            </h2>
            <form action={saveGoldSetManualReviewDecisionAction} className="mt-4 space-y-4">
              <input type="hidden" name="runId" value={round.reviewRoundId} />
              <input type="hidden" name="candidateId" value={candidate.candidateId} />

              <label className="block text-sm text-slate-600">
                Decision
                <select
                  name="decision"
                  defaultValue={candidate.latestDecision?.decision ?? "LEGACY_CORRECT"}
                  className="mt-1 w-full rounded border border-slate-200 px-3 py-2 text-sm"
                >
                  {DECISION_VALUES.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>

              <div>
                <div className="text-sm text-slate-600">Issue classes</div>
                <div className="mt-2 space-y-2">
                  {issueClassOptions.map((issueClass) => (
                    <label key={issueClass} className="flex items-start gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        name="issueClasses"
                        value={issueClass}
                        defaultChecked={candidate.latestDecision?.issueClasses.includes(issueClass) ?? true}
                      />
                      <span className="font-mono text-xs">{issueClass}</span>
                    </label>
                  ))}
                </div>
              </div>

              <label className="block text-sm text-slate-600">
                Severity override
                <select
                  name="severityOverride"
                  defaultValue={candidate.latestDecision?.severityOverride ?? ""}
                  className="mt-1 w-full rounded border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="">Ingen override</option>
                  <option value="HIGH">HIGH</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="LOW">LOW</option>
                </select>
              </label>

              <label className="block text-sm text-slate-600">
                Reviewer notes
                <textarea
                  name="reviewerNotes"
                  rows={6}
                  defaultValue={candidate.latestDecision?.reviewerNotes ?? ""}
                  className="mt-1 w-full rounded border border-slate-200 px-3 py-2 text-sm"
                  placeholder="Skriv hva du så i PDF-en, hvorfor du valgte denne beslutningen, og hva som bør brukes videre i PR77–PR79."
                />
              </label>

              <button className="rounded bg-[#162233] px-4 py-2 text-sm font-medium text-white hover:bg-[#223246]">
                Save decision
              </button>
            </form>

            {candidate.latestDecision ? (
              <div className="mt-4 rounded-xl bg-[#f9f9f7] px-4 py-3 text-sm text-slate-700">
                Sist vurdert av <span className="font-medium">{candidate.latestDecision.reviewedBy}</span>{" "}
                {formatTimestamp(candidate.latestDecision.reviewedAt)}.
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}
