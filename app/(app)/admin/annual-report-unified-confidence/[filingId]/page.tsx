import Link from "next/link";
import { notFound } from "next/navigation";
import { PdfModelArtifactKind } from "@prisma/client";

import { getUnifiedConfidenceFilingDrilldownForAdmin } from "@/server/services/annual-report-unified-confidence-drilldown-service";
import {
  listUnifiedConfidenceReviewFeedbackForFiling,
  summarizeUnifiedConfidenceReviewFeedback,
  UnifiedConfidenceReviewFeedbackActionValues,
  UnifiedConfidenceReviewTargetTypeValues,
} from "@/server/services/annual-report-unified-confidence-review-feedback-service";

import {
  acceptUnifiedConfidenceExtractionAction,
  addUnifiedConfidenceCorrectionAction,
  markUnifiedConfidenceNeedsReviewAction,
  rejectUnifiedConfidenceExtractionAction,
} from "./actions";

import {
  VerdictBadge,
  StatusBadge,
  formatCount,
  formatDuration,
  formatPercent,
  formatTimestamp,
  summarizeCodes,
} from "../ui";

function artifactLabel(kind: PdfModelArtifactKind) {
  switch (kind) {
    case PdfModelArtifactKind.UNIFIED_PARSER_DOCUMENT:
      return "Parser document";
    case PdfModelArtifactKind.UNIFIED_FINANCIAL_EXTRACTION:
      return "Financial extraction";
    case PdfModelArtifactKind.UNIFIED_NARRATIVE_EXTRACTION:
      return "Narrative extraction";
    case PdfModelArtifactKind.LEGACY_VS_UNIFIED_EXTRACTION_COMPARISON:
      return "Legacy vs unified comparison";
    case PdfModelArtifactKind.UNIFIED_EXTRACTION_CONFIDENCE_GATE:
      return "Confidence gate";
    default:
      return kind;
  }
}

function artifactStatusClass(status: "available" | "missing" | "malformed") {
  switch (status) {
    case "available":
      return "bg-green-50 text-green-700 border-green-200";
    case "missing":
      return "bg-slate-50 text-slate-600 border-slate-200";
    case "malformed":
      return "bg-red-50 text-red-700 border-red-200";
  }
}

function ArtifactStatusBadge({ status }: { status: "available" | "missing" | "malformed" }) {
  return (
    <span className={`rounded border px-2 py-0.5 text-xs font-semibold ${artifactStatusClass(status)}`}>
      {status}
    </span>
  );
}

export default async function AnnualReportUnifiedConfidenceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ filingId: string }>;
  searchParams?: Promise<{ ok?: string; error?: string }>;
}) {
  const { filingId } = await params;
  const flash = searchParams ? await searchParams : {};
  const drilldown = await getUnifiedConfidenceFilingDrilldownForAdmin(filingId);

  if (!drilldown) {
    notFound();
  }

  const { detail } = drilldown;
  const parserArtifact = drilldown.artifacts.parserDocument;
  const financialArtifact = drilldown.artifacts.financialExtraction;
  const narrativeArtifact = drilldown.artifacts.narrativeExtraction;
  const comparisonArtifact = drilldown.artifacts.comparison;
  const reviewSummary = await summarizeUnifiedConfidenceReviewFeedback(filingId);
  const reviewFeedback = await listUnifiedConfidenceReviewFeedbackForFiling(filingId);

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

      {flash?.ok ? (
        <div className="mb-6 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {flash.ok}
        </div>
      ) : null}
      {flash?.error ? (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {flash.error}
        </div>
      ) : null}

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
          Artifact availability
        </h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[rgba(15,23,42,0.08)] bg-[#f9f9f7]">
                <th className="px-3 py-2 text-left font-medium text-slate-500">Artifact</th>
                <th className="px-3 py-2 text-left font-medium text-slate-500">Status</th>
                <th className="px-3 py-2 text-left font-medium text-slate-500">Created</th>
                <th className="px-3 py-2 text-left font-medium text-slate-500">Issues</th>
              </tr>
            </thead>
            <tbody>
              {drilldown.artifacts.availability.map((artifact) => (
                <tr key={artifact.kind} className="border-b border-[rgba(15,23,42,0.06)] last:border-0">
                  <td className="px-3 py-2 text-slate-700">{artifactLabel(artifact.kind)}</td>
                  <td className="px-3 py-2">
                    <ArtifactStatusBadge status={artifact.status} />
                  </td>
                  <td className="px-3 py-2 text-slate-700">{formatTimestamp(artifact.createdAt)}</td>
                  <td className="px-3 py-2 text-slate-700">
                    {artifact.issues.length === 0 ? "—" : summarizeCodes(artifact.issues, 2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-6 rounded-lg border border-[rgba(15,23,42,0.08)] bg-white p-4">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
          Shadow extraction summary
        </h2>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
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

      <div className="mb-6 grid gap-4 xl:grid-cols-2">
        <section className="rounded-lg border border-[rgba(15,23,42,0.08)] bg-white p-4">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
            Provenance and parser sections
          </h2>
          {parserArtifact.data ? (
            <div className="mt-3 space-y-4">
              <div className="grid gap-3 text-sm sm:grid-cols-3">
                <div>
                  <div className="text-slate-500">Page summaries</div>
                  <div className="mt-1 text-slate-700">{parserArtifact.data.pageSummaries.length}</div>
                </div>
                <div>
                  <div className="text-slate-500">Section summaries</div>
                  <div className="mt-1 text-slate-700">{parserArtifact.data.sectionSummaries.length}</div>
                </div>
                <div>
                  <div className="text-slate-500">Table summaries</div>
                  <div className="mt-1 text-slate-700">{parserArtifact.data.tableSummaries.length}</div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[rgba(15,23,42,0.08)] bg-[#f9f9f7]">
                      <th className="px-3 py-2 text-left font-medium text-slate-500">Section</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-500">Pages</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-500">Confidence</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-500">Preview</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parserArtifact.data.sectionSummaries.map((section) => (
                      <tr
                        key={section.sectionId}
                        className="border-b border-[rgba(15,23,42,0.06)] last:border-0"
                      >
                        <td className="px-3 py-2 text-slate-700">
                          <div className="font-medium">{section.kind}</div>
                          <div className="font-mono text-xs text-slate-500">{section.sectionId}</div>
                        </td>
                        <td className="px-3 py-2 text-slate-700">
                          {section.pageStart ?? "—"}-{section.pageEnd ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-slate-700">{formatPercent(section.confidence)}</td>
                        <td className="px-3 py-2 text-slate-700">{section.textPreview || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="mt-3 text-sm text-slate-400">{parserArtifact.issues.join(" ")}</div>
          )}
        </section>

        <section className="rounded-lg border border-[rgba(15,23,42,0.08)] bg-white p-4">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
            Gate check context
          </h2>
          {drilldown.gateCheckContext.length === 0 ? (
            <div className="mt-3 text-sm text-slate-400">Ingen failed eller warned checks med ekstra kontekst.</div>
          ) : (
            <div className="mt-3 space-y-3">
              {drilldown.gateCheckContext.map((item) => (
                <div
                  key={item.checkCode}
                  className="rounded-md border border-[rgba(15,23,42,0.08)] p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-slate-600">{item.checkCode}</span>
                    <VerdictBadge verdict={item.verdict} />
                  </div>
                  <div className="mt-2 text-sm text-slate-700">{item.message}</div>
                  <ul className="mt-2 space-y-1 text-sm text-slate-600">
                    {item.context.map((entry) => (
                      <li key={entry}>{entry}</li>
                    ))}
                  </ul>
                  {item.relatedArtifacts.length > 0 ? (
                    <div className="mt-2 text-xs text-slate-500">
                      Artifacts: {item.relatedArtifacts.map((kind) => artifactLabel(kind)).join(", ")}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="mb-6 rounded-lg border border-[rgba(15,23,42,0.08)] bg-white p-4">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
          Financial line items
        </h2>
        {financialArtifact.data ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgba(15,23,42,0.08)] bg-[#f9f9f7]">
                  <th className="px-3 py-2 text-left font-medium text-slate-500">Statement</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500">Original / normalized</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500">Canonical key</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500">Year</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500">Value</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500">Scale / sign</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500">Page / row</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500">Confidence</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500">Warnings</th>
                </tr>
              </thead>
              <tbody>
                {financialArtifact.data.lineItems.map((item, index) => (
                  <tr key={`${item.canonicalKey ?? item.originalLabel}-${index}`} className="border-b border-[rgba(15,23,42,0.06)] last:border-0">
                    <td className="px-3 py-2 text-slate-700">{item.statementKind ?? "—"}</td>
                    <td className="px-3 py-2 text-slate-700">
                      <div>{item.originalLabel}</div>
                      <div className="text-xs text-slate-500">{item.normalizedLabel ?? "—"}</div>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-600">{item.canonicalKey ?? "—"}</td>
                    <td className="px-3 py-2 text-slate-700">{item.fiscalYear ?? "—"}</td>
                    <td className="px-3 py-2 text-slate-700">{item.value ?? "—"}</td>
                    <td className="px-3 py-2 text-slate-700">
                      {item.unitScale ?? "—"} / {item.sign ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      p.{item.pageNumber ?? "—"} · r.{item.rowIndex ?? "—"} · {item.tableId ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-slate-700">{formatPercent(item.confidence)}</td>
                    <td className="px-3 py-2 text-slate-700">
                      {item.warnings.length === 0 ? "—" : summarizeCodes(item.warnings, 2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-3 text-sm text-slate-400">{financialArtifact.issues.join(" ")}</div>
        )}
      </section>

      <section className="mb-6 rounded-lg border border-[rgba(15,23,42,0.08)] bg-white p-4">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
          Narrative sections
        </h2>
        {narrativeArtifact.data ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgba(15,23,42,0.08)] bg-[#f9f9f7]">
                  <th className="px-3 py-2 text-left font-medium text-slate-500">Kind</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500">Title</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500">Pages</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500">Confidence</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500">Provenance</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500">Preview</th>
                </tr>
              </thead>
              <tbody>
                {narrativeArtifact.data.sections.map((section) => (
                  <tr key={section.sectionId} className="border-b border-[rgba(15,23,42,0.06)] last:border-0">
                    <td className="px-3 py-2 text-slate-700">{section.kind ?? "—"}</td>
                    <td className="px-3 py-2 text-slate-700">{section.title ?? "—"}</td>
                    <td className="px-3 py-2 text-slate-700">
                      {section.pageStart ?? "—"}-{section.pageEnd ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-slate-700">{formatPercent(section.confidence)}</td>
                    <td className="px-3 py-2 text-slate-700">{section.provenance ?? "—"}</td>
                    <td className="px-3 py-2 text-slate-700">{section.textPreview || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-3 text-sm text-slate-400">{narrativeArtifact.issues.join(" ")}</div>
        )}
      </section>

      <section className="mb-6 rounded-lg border border-[rgba(15,23,42,0.08)] bg-white p-4">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
          Legacy-vs-unified comparison
        </h2>
        {comparisonArtifact.data ? (
          <div className="mt-3 space-y-4">
            <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-5">
              <div>
                <dt className="text-slate-500">Total compared</dt>
                <dd className="mt-1 text-slate-700">
                  {formatCount(Number(comparisonArtifact.data.summary.financialTotalCompared ?? 0))}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Exact matches</dt>
                <dd className="mt-1 text-slate-700">
                  {formatCount(Number(comparisonArtifact.data.summary.financialExactMatchCount ?? 0))}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Mismatches</dt>
                <dd className="mt-1 text-slate-700">
                  {formatCount(Number(comparisonArtifact.data.summary.financialMismatchCount ?? 0))}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Missing in unified</dt>
                <dd className="mt-1 text-slate-700">
                  {formatCount(Number(comparisonArtifact.data.summary.financialMissingInUnifiedCount ?? 0))}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Missing in legacy</dt>
                <dd className="mt-1 text-slate-700">
                  {formatCount(Number(comparisonArtifact.data.summary.financialMissingInLegacyCount ?? 0))}
                </dd>
              </div>
            </dl>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[rgba(15,23,42,0.08)] bg-[#f9f9f7]">
                    <th className="px-3 py-2 text-left font-medium text-slate-500">Metric</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-500">Year</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-500">Legacy</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-500">Unified</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-500">Delta</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-500">Rel. dev</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-500">Severity</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonArtifact.data.mismatches.map((mismatch) => (
                    <tr
                      key={`${mismatch.canonicalKey}-${mismatch.fiscalYear}-${mismatch.match}`}
                      className="border-b border-[rgba(15,23,42,0.06)] last:border-0"
                    >
                      <td className="px-3 py-2 font-mono text-xs text-slate-600">{mismatch.canonicalKey}</td>
                      <td className="px-3 py-2 text-slate-700">{mismatch.fiscalYear ?? "—"}</td>
                      <td className="px-3 py-2 text-slate-700">{mismatch.legacyValueNok ?? "—"}</td>
                      <td className="px-3 py-2 text-slate-700">{mismatch.unifiedValueNok ?? "—"}</td>
                      <td className="px-3 py-2 text-slate-700">{mismatch.deltaNok ?? "—"}</td>
                      <td className="px-3 py-2 text-slate-700">{formatPercent(mismatch.relativeDeviation)}</td>
                      <td className="px-3 py-2 text-slate-700">{mismatch.severity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="mt-3 text-sm text-slate-400">{comparisonArtifact.issues.join(" ")}</div>
        )}
      </section>

      <section className="mb-6 rounded-lg border border-[rgba(15,23,42,0.08)] bg-white p-4">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
          Manual review
        </h2>
        <div className="mt-3 grid gap-4 xl:grid-cols-2">
          <div className="space-y-4">
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <div className="text-slate-500">Latest decision</div>
                <div className="mt-1 text-slate-700">{reviewSummary.latestDecision?.action ?? "—"}</div>
              </div>
              <div>
                <div className="text-slate-500">Total feedback</div>
                <div className="mt-1 text-slate-700">{reviewSummary.totalFeedback}</div>
              </div>
              <div>
                <div className="text-slate-500">Accepted / rejected / follow-up</div>
                <div className="mt-1 text-slate-700">
                  {reviewSummary.acceptedCount}/{reviewSummary.rejectedCount}/{reviewSummary.needsReviewCount}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Corrections</div>
                <div className="mt-1 text-slate-700">{reviewSummary.correctionCount}</div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <form action={acceptUnifiedConfidenceExtractionAction} className="rounded-md border border-[rgba(15,23,42,0.08)] p-3">
                <input type="hidden" name="filingId" value={filingId} />
                <label className="block text-xs font-medium uppercase tracking-widest text-slate-400">
                  Accept
                </label>
                <textarea
                  name="notes"
                  rows={3}
                  className="mt-2 w-full rounded border border-slate-200 px-3 py-2 text-sm"
                  placeholder="Optional notes"
                />
                <button className="mt-3 rounded bg-green-600 px-3 py-2 text-sm font-medium text-white">
                  Accept extraction
                </button>
              </form>

              <form action={rejectUnifiedConfidenceExtractionAction} className="rounded-md border border-[rgba(15,23,42,0.08)] p-3">
                <input type="hidden" name="filingId" value={filingId} />
                <label className="block text-xs font-medium uppercase tracking-widest text-slate-400">
                  Reject
                </label>
                <textarea
                  name="reason"
                  required
                  rows={3}
                  className="mt-2 w-full rounded border border-slate-200 px-3 py-2 text-sm"
                  placeholder="Reason for rejection"
                />
                <textarea
                  name="notes"
                  rows={2}
                  className="mt-2 w-full rounded border border-slate-200 px-3 py-2 text-sm"
                  placeholder="Optional notes"
                />
                <button className="mt-3 rounded bg-red-600 px-3 py-2 text-sm font-medium text-white">
                  Reject extraction
                </button>
              </form>

              <form action={markUnifiedConfidenceNeedsReviewAction} className="rounded-md border border-[rgba(15,23,42,0.08)] p-3">
                <input type="hidden" name="filingId" value={filingId} />
                <label className="block text-xs font-medium uppercase tracking-widest text-slate-400">
                  Needs follow-up
                </label>
                <textarea
                  name="reason"
                  rows={3}
                  className="mt-2 w-full rounded border border-slate-200 px-3 py-2 text-sm"
                  placeholder="Why this needs follow-up"
                />
                <textarea
                  name="notes"
                  rows={2}
                  className="mt-2 w-full rounded border border-slate-200 px-3 py-2 text-sm"
                  placeholder="Optional notes"
                />
                <button className="mt-3 rounded bg-slate-700 px-3 py-2 text-sm font-medium text-white">
                  Mark needs review
                </button>
              </form>
            </div>
          </div>

          <div className="space-y-4">
            <form action={addUnifiedConfidenceCorrectionAction} className="rounded-md border border-[rgba(15,23,42,0.08)] p-3">
              <input type="hidden" name="filingId" value={filingId} />
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm text-slate-600">
                  Correction action
                  <select
                    name="action"
                    defaultValue={UnifiedConfidenceReviewFeedbackActionValues.CORRECT_LINE_ITEM}
                    className="mt-1 w-full rounded border border-slate-200 px-3 py-2 text-sm"
                  >
                    <option value={UnifiedConfidenceReviewFeedbackActionValues.CORRECT_LINE_ITEM}>CORRECT_LINE_ITEM</option>
                    <option value={UnifiedConfidenceReviewFeedbackActionValues.CORRECT_SECTION_CLASSIFICATION}>CORRECT_SECTION_CLASSIFICATION</option>
                    <option value={UnifiedConfidenceReviewFeedbackActionValues.CORRECT_UNIT_SCALE}>CORRECT_UNIT_SCALE</option>
                    <option value={UnifiedConfidenceReviewFeedbackActionValues.CORRECT_CANONICAL_KEY}>CORRECT_CANONICAL_KEY</option>
                    <option value={UnifiedConfidenceReviewFeedbackActionValues.CORRECT_PROVENANCE}>CORRECT_PROVENANCE</option>
                  </select>
                </label>
                <label className="text-sm text-slate-600">
                  Target type
                  <select
                    name="targetType"
                    defaultValue={UnifiedConfidenceReviewTargetTypeValues.FINANCIAL_LINE_ITEM}
                    className="mt-1 w-full rounded border border-slate-200 px-3 py-2 text-sm"
                  >
                    <option value={UnifiedConfidenceReviewTargetTypeValues.FINANCIAL_LINE_ITEM}>FINANCIAL_LINE_ITEM</option>
                    <option value={UnifiedConfidenceReviewTargetTypeValues.NARRATIVE_SECTION}>NARRATIVE_SECTION</option>
                    <option value={UnifiedConfidenceReviewTargetTypeValues.UNIT_SCALE}>UNIT_SCALE</option>
                    <option value={UnifiedConfidenceReviewTargetTypeValues.CANONICAL_KEY}>CANONICAL_KEY</option>
                    <option value={UnifiedConfidenceReviewTargetTypeValues.PROVENANCE}>PROVENANCE</option>
                    <option value={UnifiedConfidenceReviewTargetTypeValues.CHECK}>CHECK</option>
                  </select>
                </label>
              </div>
              <label className="mt-3 block text-sm text-slate-600">
                Target ref JSON
                <textarea
                  name="targetRefJson"
                  required
                  rows={4}
                  className="mt-1 w-full rounded border border-slate-200 px-3 py-2 font-mono text-xs"
                  placeholder='{"canonicalKey":"revenue","fiscalYear":2024,"pageNumber":1}'
                />
              </label>
              <label className="mt-3 block text-sm text-slate-600">
                Accepted value JSON
                <textarea
                  name="acceptedValueJson"
                  required
                  rows={5}
                  className="mt-1 w-full rounded border border-slate-200 px-3 py-2 font-mono text-xs"
                  placeholder='{"value":"1000","unitScale":"THOUSANDS","sign":"POSITIVE"}'
                />
              </label>
              <label className="mt-3 block text-sm text-slate-600">
                Reason
                <input
                  name="reason"
                  className="mt-1 w-full rounded border border-slate-200 px-3 py-2 text-sm"
                  placeholder="Optional reason"
                />
              </label>
              <label className="mt-3 block text-sm text-slate-600">
                Notes
                <textarea
                  name="notes"
                  rows={3}
                  className="mt-1 w-full rounded border border-slate-200 px-3 py-2 text-sm"
                  placeholder="Optional notes"
                />
              </label>
              <button className="mt-3 rounded bg-[#162233] px-3 py-2 text-sm font-medium text-white">
                Save correction
              </button>
            </form>

            <div className="rounded-md border border-[rgba(15,23,42,0.08)] p-3">
              <div className="text-xs font-medium uppercase tracking-widest text-slate-400">
                Feedback history
              </div>
              {reviewFeedback.length === 0 ? (
                <div className="mt-2 text-sm text-slate-400">Ingen manual review feedback ennå.</div>
              ) : (
                <div className="mt-3 space-y-2">
                  {reviewFeedback.slice(0, 8).map((entry) => (
                    <div key={entry.id} className="rounded border border-[rgba(15,23,42,0.08)] px-3 py-2 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-mono text-xs text-slate-600">{entry.action}</span>
                        <span className="text-xs text-slate-500">{formatTimestamp(entry.createdAt)}</span>
                      </div>
                      <div className="mt-1 text-slate-700">{entry.targetType}</div>
                      {entry.reason ? <div className="mt-1 text-slate-600">Reason: {entry.reason}</div> : null}
                      {entry.notes ? <div className="mt-1 text-slate-600">Notes: {entry.notes}</div> : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
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
            {parserArtifact.data?.warnings.length ? (
              <div>
                <div className="font-medium text-slate-600">Parser warnings</div>
                <ul className="mt-1 space-y-1 text-amber-700">
                  {parserArtifact.data.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}
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
