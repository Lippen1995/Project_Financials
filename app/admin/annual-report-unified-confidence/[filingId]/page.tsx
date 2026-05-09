import Link from "next/link";
import { notFound } from "next/navigation";

import { getUnifiedConfidenceGateResultForAdmin } from "@/server/services/annual-report-unified-confidence-admin-service";

import {
  VerdictBadge,
  StatusBadge,
  formatCount,
  formatDuration,
  formatPercent,
  formatTimestamp,
  summarizeCodes,
} from "../ui";

export default async function AnnualReportUnifiedConfidenceDetailPage({
  params,
}: {
  params: Promise<{ filingId: string }>;
}) {
  const { filingId } = await params;
  const detail = await getUnifiedConfidenceGateResultForAdmin(filingId);

  if (!detail) {
    notFound();
  }

  return (
    <div>
      <div className="mb-6">
        <Link
          href={"/admin/annual-report-unified-confidence" as never}
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          ← Tilbake til Unified Confidence
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[#162233]">
              {detail.companyName ?? "Ukjent selskap"}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Org.nr {detail.orgNumber ?? "—"} · Regnskapsår {detail.fiscalYear ?? "—"} · Filing {detail.filingId}
            </p>
          </div>
          <div className="flex gap-2">
            <StatusBadge status={detail.status} />
            <VerdictBadge verdict={detail.gateVerdict} />
          </div>
        </div>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-[rgba(15,23,42,0.08)] bg-white p-4">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
            Safety invariants
          </h2>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-slate-500">canUseForProductionRouting</dt>
              <dd className="mt-1 font-mono text-slate-700">{String(detail.safety.canUseForProductionRouting)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">productionRoutingChanged</dt>
              <dd className="mt-1 font-mono text-slate-700">{String(detail.safety.productionRoutingChanged)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">productionFactsMutated</dt>
              <dd className="mt-1 font-mono text-slate-700">{String(detail.safety.productionFactsMutated)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">publishAffected</dt>
              <dd className="mt-1 font-mono text-slate-700">{String(detail.safety.publishAffected)}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-lg border border-[rgba(15,23,42,0.08)] bg-white p-4">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
            Gate summary
          </h2>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-slate-500">Pass / Warn / Fail / Insufficient</dt>
              <dd className="mt-1 font-mono text-slate-700">
                {detail.passCount}/{detail.warnCount}/{detail.failCount}/{detail.insufficientDataCount}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Generated at</dt>
              <dd className="mt-1 text-slate-700">{formatTimestamp(detail.generatedAt)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Blocking checks</dt>
              <dd className="mt-1 text-slate-700">{summarizeCodes(detail.blockingCheckCodes, 10)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Warning checks</dt>
              <dd className="mt-1 text-slate-700">{summarizeCodes(detail.warningCheckCodes, 10)}</dd>
            </div>
          </dl>
        </section>
      </div>

      <section className="mb-6 rounded-lg border border-[rgba(15,23,42,0.08)] bg-white p-4">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
          Shadow extraction summary
        </h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
          <div>
            <dt className="text-slate-500">Document page count</dt>
            <dd className="mt-1 text-slate-700">{formatCount(detail.shadowSummary.documentPageCount)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Financial statement count</dt>
            <dd className="mt-1 text-slate-700">{formatCount(detail.shadowSummary.financialStatementCount)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Financial line item count</dt>
            <dd className="mt-1 text-slate-700">{formatCount(detail.shadowSummary.financialLineItemCount)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Narrative section count</dt>
            <dd className="mt-1 text-slate-700">{formatCount(detail.shadowSummary.narrativeSectionCount)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Comparison fact count</dt>
            <dd className="mt-1 text-slate-700">{formatCount(detail.shadowSummary.comparisonFactCount)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Exact match count</dt>
            <dd className="mt-1 text-slate-700">{formatCount(detail.shadowSummary.comparisonExactMatchCount)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Mismatch count</dt>
            <dd className="mt-1 text-slate-700">{formatCount(detail.shadowSummary.comparisonMismatchCount)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Comparison match rate</dt>
            <dd className="mt-1 text-slate-700">{formatPercent(detail.shadowSummary.comparisonMatchRate)}</dd>
          </div>
        </dl>
      </section>

      <section className="mb-6 rounded-lg border border-[rgba(15,23,42,0.08)] bg-white p-4">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
          Full check table
        </h2>
        {detail.fullChecks.length === 0 ? (
          <div className="mt-3 text-sm text-slate-400">Ingen validerte checks tilgjengelig for dette artifactet.</div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgba(15,23,42,0.08)] bg-[#f9f9f7]">
                  <th className="px-3 py-2 text-left font-medium text-slate-500">Check code</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500">Verdict</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500">Message</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500">Value</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500">Threshold</th>
                </tr>
              </thead>
              <tbody>
                {detail.fullChecks.map((check) => (
                  <tr key={check.checkCode} className="border-b border-[rgba(15,23,42,0.06)] last:border-0">
                    <td className="px-3 py-2 font-mono text-xs text-slate-600">{check.checkCode}</td>
                    <td className="px-3 py-2">
                      <VerdictBadge verdict={check.verdict} />
                    </td>
                    <td className="px-3 py-2 text-slate-700">{check.message}</td>
                    <td className="px-3 py-2 text-slate-700">{check.value ?? "—"}</td>
                    <td className="px-3 py-2 text-slate-700">{check.threshold ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-[rgba(15,23,42,0.08)] bg-white p-4">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
            Errors and warnings
          </h2>
          <div className="mt-3 grid gap-3 text-sm">
            <div>
              <div className="font-medium text-slate-600">Errors</div>
              {detail.errors.length === 0 ? (
                <div className="mt-1 text-slate-400">Ingen errors.</div>
              ) : (
                <ul className="mt-1 space-y-1 text-red-700">
                  {detail.errors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <div className="font-medium text-slate-600">Warnings</div>
              {detail.warnings.length === 0 ? (
                <div className="mt-1 text-slate-400">Ingen warnings.</div>
              ) : (
                <ul className="mt-1 space-y-1 text-amber-700">
                  {detail.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-[rgba(15,23,42,0.08)] bg-white p-4">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
            Artifact metadata
          </h2>
          <dl className="mt-3 grid gap-3 text-sm">
            <div>
              <dt className="text-slate-500">Artifact ID</dt>
              <dd className="mt-1 font-mono text-xs text-slate-700">{detail.artifactId}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Artifact kind</dt>
              <dd className="mt-1 text-slate-700">{detail.artifactKind}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Artifact status</dt>
              <dd className="mt-1 text-slate-700">{detail.artifactStatus}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Artifact created</dt>
              <dd className="mt-1 text-slate-700">{formatTimestamp(detail.artifactCreatedAt)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Source command</dt>
              <dd className="mt-1 font-mono text-xs text-slate-700">{detail.artifactSourceCommand ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Source commit</dt>
              <dd className="mt-1 font-mono text-xs text-slate-700">{detail.artifactSourceCommitSha ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Duration</dt>
              <dd className="mt-1 text-slate-700">{formatDuration(detail.durationMs)}</dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}
