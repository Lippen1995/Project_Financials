import React from "react";
import Link from "next/link";
import { AnnualReportReviewStatus } from "@prisma/client";

import { listReviewQueue } from "@/server/services/annual-report-review-service";
import {
  listAnnualReportManualReviewCandidates,
  type AnnualReportManualReviewCandidateStatus,
  type AnnualReportManualReviewSeverity,
} from "@/server/services/annual-report-manual-review-round-service";

const STATUS_LABELS: Record<AnnualReportReviewStatus, string> = {
  PENDING_REVIEW: "Venter",
  ACCEPTED: "Godkjent",
  REJECTED: "Avvist",
  REPROCESS_REQUESTED: "Reprocess",
  RESOLVED_BY_NEW_RUN: "Løst av ny kjøring",
};

const STATUS_COLORS: Record<AnnualReportReviewStatus, string> = {
  PENDING_REVIEW: "bg-amber-50 text-amber-700 border-amber-200",
  ACCEPTED: "bg-green-50 text-green-700 border-green-200",
  REJECTED: "bg-red-50 text-red-700 border-red-200",
  REPROCESS_REQUESTED: "bg-blue-50 text-blue-700 border-blue-200",
  RESOLVED_BY_NEW_RUN: "bg-slate-50 text-slate-600 border-slate-200",
};

const GOLD_SET_STATUS_COLORS: Record<AnnualReportManualReviewCandidateStatus, string> = {
  PENDING: "bg-amber-50 text-amber-700 border-amber-200",
  REVIEWED: "bg-green-50 text-green-700 border-green-200",
  BLOCKED: "bg-red-50 text-red-700 border-red-200",
};

const GOLD_SET_SEVERITY_COLORS: Record<AnnualReportManualReviewSeverity, string> = {
  HIGH: "bg-red-50 text-red-700 border-red-200",
  MEDIUM: "bg-amber-50 text-amber-700 border-amber-200",
  LOW: "bg-slate-50 text-slate-600 border-slate-200",
};

function asSingle(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

function asBooleanFlag(value: string | string[] | undefined) {
  return asSingle(value) === "1";
}

function formatTimestamp(value: string | Date | null | undefined) {
  if (!value) {
    return "—";
  }
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Ukjent";
  }
  return parsed.toLocaleString("nb-NO");
}

export default async function AdminReviewQueuePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;

  const statuses = sp.status
    ? (Array.isArray(sp.status) ? sp.status : [sp.status]) as AnnualReportReviewStatus[]
    : (["PENDING_REVIEW", "REPROCESS_REQUESTED"] as AnnualReportReviewStatus[]);

  const orgNumber = asSingle(sp.orgNumber);
  const fiscalYear = typeof sp.fiscalYear === "string" ? parseInt(sp.fiscalYear, 10) : undefined;
  const ruleCode = asSingle(sp.ruleCode);

  const manualReviewStatus = sp.manualStatus
    ? (Array.isArray(sp.manualStatus) ? sp.manualStatus : [sp.manualStatus]) as AnnualReportManualReviewCandidateStatus[]
    : undefined;
  const manualReviewSeverity = sp.manualSeverity
    ? (Array.isArray(sp.manualSeverity) ? sp.manualSeverity : [sp.manualSeverity]) as AnnualReportManualReviewSeverity[]
    : undefined;
  const manualTag = sp.manualTag
    ? Array.isArray(sp.manualTag)
      ? sp.manualTag
      : [sp.manualTag]
    : undefined;
  const manualIssueClass = sp.manualIssueClass
    ? Array.isArray(sp.manualIssueClass)
      ? sp.manualIssueClass
      : [sp.manualIssueClass]
    : undefined;
  const manualAccountingYear =
    typeof sp.manualAccountingYear === "string" ? parseInt(sp.manualAccountingYear, 10) : undefined;
  const manualSearch = asSingle(sp.q);
  const manualRunId = asSingle(sp.runId);
  const highSeverityOnly = asBooleanFlag(sp.highSeverityOnly);

  const [manualReview, reviews] = await Promise.all([
    listAnnualReportManualReviewCandidates({
      runId: manualRunId,
      status: manualReviewStatus,
      severity: manualReviewSeverity,
      tag: manualTag,
      issueClass: manualIssueClass,
      accountingYear:
        manualAccountingYear !== undefined && !Number.isNaN(manualAccountingYear)
          ? manualAccountingYear
          : undefined,
      search: manualSearch,
      goldSetOnly: true,
      highSeverityOnly,
    }),
    listReviewQueue({
      statuses,
      orgNumbers: orgNumber ? [orgNumber] : undefined,
      fiscalYear: fiscalYear && !Number.isNaN(fiscalYear) ? fiscalYear : undefined,
      ruleCodes: ruleCode ? [ruleCode] : undefined,
      limit: 200,
    }),
  ]);

  const manualRound = manualReview?.round ?? null;
  const manualCandidates = manualReview?.items ?? [];

  return (
    <div className="space-y-10">
      <div>
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[#162233]">
              Review-kø for årsrapporter
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Gold-set shadow batch review for PR76, pluss den eksisterende køen for ordinær filing-review.
            </p>
          </div>
        </div>

        <section className="rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-[#162233]">
                Gold-set manual review round
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Kandidater fra persisted gold-set shadow batch. Bruk denne køen til å gi strukturert fasit for PR77–PR79.
              </p>
            </div>
            {manualRound ? (
              <div className="grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                <div>
                  <span className="font-medium text-slate-500">Run:</span>{" "}
                  <span className="font-mono">{manualRound.sourceRun.runId}</span>
                </div>
                <div>
                  <span className="font-medium text-slate-500">Generert:</span>{" "}
                  {formatTimestamp(manualRound.generatedAt)}
                </div>
                <div>
                  <span className="font-medium text-slate-500">Pending:</span>{" "}
                  {manualRound.summary.pendingCount}
                </div>
                <div>
                  <span className="font-medium text-slate-500">High severity:</span>{" "}
                  {manualRound.summary.severityCounts.HIGH}
                </div>
              </div>
            ) : null}
          </div>

          <form method="GET" className="mt-6 flex flex-wrap gap-3">
            {manualRunId ? <input type="hidden" name="runId" value={manualRunId} /> : null}
            <select
              name="manualStatus"
              defaultValue={manualReviewStatus?.[0]}
              className="rounded border border-[rgba(15,23,42,0.12)] bg-white px-3 py-2 text-sm text-slate-700"
            >
              <option value="">Alle statuser</option>
              <option value="PENDING">Pending</option>
              <option value="REVIEWED">Reviewed</option>
              <option value="BLOCKED">Blocked</option>
            </select>
            <select
              name="manualSeverity"
              defaultValue={manualReviewSeverity?.[0]}
              className="rounded border border-[rgba(15,23,42,0.12)] bg-white px-3 py-2 text-sm text-slate-700"
            >
              <option value="">Alle severity</option>
              <option value="HIGH">HIGH</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="LOW">LOW</option>
            </select>
            <input
              name="manualTag"
              type="text"
              placeholder="Tag"
              defaultValue={manualTag?.[0]}
              className="rounded border border-[rgba(15,23,42,0.12)] bg-white px-3 py-2 text-sm text-slate-700 placeholder-slate-400"
            />
            <input
              name="manualIssueClass"
              type="text"
              placeholder="Issue class"
              defaultValue={manualIssueClass?.[0]}
              className="rounded border border-[rgba(15,23,42,0.12)] bg-white px-3 py-2 text-sm text-slate-700 placeholder-slate-400"
            />
            <input
              name="manualAccountingYear"
              type="number"
              placeholder="Regnskapsår"
              defaultValue={manualAccountingYear}
              className="w-36 rounded border border-[rgba(15,23,42,0.12)] bg-white px-3 py-2 text-sm text-slate-700 placeholder-slate-400"
            />
            <input
              name="q"
              type="text"
              placeholder="Søk selskap eller org.nr"
              defaultValue={manualSearch}
              className="rounded border border-[rgba(15,23,42,0.12)] bg-white px-3 py-2 text-sm text-slate-700 placeholder-slate-400"
            />
            <label className="inline-flex items-center gap-2 rounded border border-[rgba(15,23,42,0.12)] px-3 py-2 text-sm text-slate-700">
              <input
                type="checkbox"
                name="highSeverityOnly"
                value="1"
                defaultChecked={highSeverityOnly}
              />
              High severity only
            </label>
            <button
              type="submit"
              className="rounded border border-[rgba(15,23,42,0.12)] bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Filtrer
            </button>
          </form>

          {manualRound ? (
            <div className="mt-6 grid gap-3 md:grid-cols-4">
              <div className="rounded-xl border border-[rgba(15,23,42,0.08)] bg-[#f9f9f7] p-4">
                <div className="text-xs uppercase tracking-widest text-slate-400">Review candidates</div>
                <div className="mt-2 text-2xl font-semibold text-[#162233]">
                  {manualRound.summary.reviewCandidateCount}
                </div>
              </div>
              <div className="rounded-xl border border-[rgba(15,23,42,0.08)] bg-[#f9f9f7] p-4">
                <div className="text-xs uppercase tracking-widest text-slate-400">Pending</div>
                <div className="mt-2 text-2xl font-semibold text-amber-700">
                  {manualRound.summary.pendingCount}
                </div>
              </div>
              <div className="rounded-xl border border-[rgba(15,23,42,0.08)] bg-[#f9f9f7] p-4">
                <div className="text-xs uppercase tracking-widest text-slate-400">Reviewed</div>
                <div className="mt-2 text-2xl font-semibold text-green-700">
                  {manualRound.summary.reviewedCount}
                </div>
              </div>
              <div className="rounded-xl border border-[rgba(15,23,42,0.08)] bg-[#f9f9f7] p-4">
                <div className="text-xs uppercase tracking-widest text-slate-400">Top issue class</div>
                <div className="mt-2 text-sm font-semibold text-[#162233]">
                  {Object.entries(manualRound.summary.issueClassCounts).sort(
                    (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
                  )[0]?.[0] ?? "Ingen data"}
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-6 rounded-xl border border-dashed border-[rgba(15,23,42,0.18)] bg-[#f9f9f7] p-6 text-sm text-slate-500">
              Ingen persisted manual review round funnet ennå. Kjør en gold-set shadow batch og bygg review-runden først.
            </div>
          )}

          {manualCandidates.length === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed border-[rgba(15,23,42,0.18)] bg-[#f9f9f7] p-10 text-center text-slate-500">
              No manual review candidates found for the selected run.
            </div>
          ) : (
            <div className="mt-6 overflow-x-auto rounded-xl border border-[rgba(15,23,42,0.08)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[rgba(15,23,42,0.08)] bg-[#f9f9f7]">
                    <th className="px-4 py-3 text-left font-medium text-slate-500">Company</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-500">Org.nr</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-500">Accounting year</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-500">Status</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-500">Severity</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-500">Main review reason</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-500">Tags</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-500">First divergence stage</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-500">Evidence/parser</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-500">Updated</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-500"></th>
                  </tr>
                </thead>
                <tbody>
                  {manualCandidates.map((candidate) => (
                    <tr
                      key={candidate.candidateId}
                      className="border-b border-[rgba(15,23,42,0.06)] last:border-0 hover:bg-[#f9f9f7]"
                    >
                      <td className="px-4 py-3 font-medium text-[#162233]">
                        {candidate.companyName ?? candidate.filingId}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">
                        {candidate.orgNumber ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {candidate.accountingYear ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${GOLD_SET_STATUS_COLORS[candidate.status]}`}
                        >
                          {candidate.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${GOLD_SET_SEVERITY_COLORS[candidate.severity]}`}
                        >
                          {candidate.severity}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {candidate.reviewReasons[0] ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {candidate.tags.join(", ") || "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {candidate.firstDivergenceStage ?? "—"}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">
                        {candidate.parserOrEvidence}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400">
                        {formatTimestamp(candidate.updatedAt)}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/annual-report-reviews/gold-set/${candidate.candidateId}?runId=${encodeURIComponent(candidate.runId)}`}
                          className="rounded border border-[rgba(15,23,42,0.12)] bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <section className="rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white p-6 shadow-sm">
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-[#162233]">
            Eksisterende produksjons-review-kø
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Dette er den opprinnelige køen for filing-review i produksjonsløypen. PR76 endrer ikke publish-safety eller routing.
          </p>
        </div>

        <form method="GET" className="mb-6 flex flex-wrap gap-3">
          <select
            name="status"
            defaultValue={statuses[0]}
            className="rounded border border-[rgba(15,23,42,0.12)] bg-white px-3 py-2 text-sm text-slate-700"
          >
            <option value="PENDING_REVIEW">Venter på review</option>
            <option value="REPROCESS_REQUESTED">Reprocess forespurt</option>
            <option value="ACCEPTED">Godkjent</option>
            <option value="REJECTED">Avvist</option>
            <option value="RESOLVED_BY_NEW_RUN">Løst av ny kjøring</option>
          </select>
          <input
            name="orgNumber"
            type="text"
            placeholder="Org.nummer"
            defaultValue={orgNumber}
            className="rounded border border-[rgba(15,23,42,0.12)] bg-white px-3 py-2 text-sm text-slate-700 placeholder-slate-400"
          />
          <input
            name="fiscalYear"
            type="number"
            placeholder="Regnskapsår"
            defaultValue={fiscalYear}
            className="w-32 rounded border border-[rgba(15,23,42,0.12)] bg-white px-3 py-2 text-sm text-slate-700 placeholder-slate-400"
          />
          <input
            name="ruleCode"
            type="text"
            placeholder="Regelkode"
            defaultValue={ruleCode}
            className="rounded border border-[rgba(15,23,42,0.12)] bg-white px-3 py-2 text-sm text-slate-700 placeholder-slate-400"
          />
          <button
            type="submit"
            className="rounded border border-[rgba(15,23,42,0.12)] bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Filtrer
          </button>
        </form>

        {reviews.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[rgba(15,23,42,0.18)] bg-[#f9f9f7] p-10 text-center text-slate-400">
            Ingen saker matcher filteret.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-[rgba(15,23,42,0.08)] bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgba(15,23,42,0.08)] bg-[#f9f9f7]">
                  <th className="px-4 py-3 text-left font-medium text-slate-500">Selskap</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">Org.nr</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">År</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">Filing-status</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">Kvalitet</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">Blokkeringer</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">Parser</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">Oppdatert</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500"></th>
                </tr>
              </thead>
              <tbody>
                {reviews.map((review) => (
                  <tr
                    key={review.id}
                    className="border-b border-[rgba(15,23,42,0.06)] last:border-0 hover:bg-[#f9f9f7]"
                  >
                    <td className="px-4 py-3 font-medium text-[#162233]">
                      {review.company.name}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">
                      {review.company.orgNumber}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{review.fiscalYear}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[review.status]}`}
                      >
                        {STATUS_LABELS[review.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">
                      {review.filing.status}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {review.extractionRun?.confidenceScore != null
                        ? `${(review.extractionRun.confidenceScore * 100).toFixed(0)}%`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {review.blockingRuleCodes.length > 0 ? (
                        <span className="text-amber-700">
                          {review.blockingRuleCodes.length} ({review.blockingRuleCodes.slice(0, 2).join(", ")})
                        </span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-400">
                      {review.extractionRun?.documentEngine ?? review.filing.parserVersionLastTried ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {new Date(review.updatedAt).toLocaleDateString("nb-NO")}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/annual-report-reviews/${review.id}`}
                        className="rounded border border-[rgba(15,23,42,0.12)] bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Åpne
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
