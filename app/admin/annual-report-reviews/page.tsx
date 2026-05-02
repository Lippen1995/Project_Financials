import Link from "next/link";
import { AnnualReportReviewStatus } from "@prisma/client";

import { listReviewQueue } from "@/server/services/annual-report-review-service";

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

export default async function AdminReviewQueuePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;

  const statuses = sp.status
    ? (Array.isArray(sp.status) ? sp.status : [sp.status]) as AnnualReportReviewStatus[]
    : (["PENDING_REVIEW", "REPROCESS_REQUESTED"] as AnnualReportReviewStatus[]);

  const orgNumber = typeof sp.orgNumber === "string" ? sp.orgNumber : undefined;
  const fiscalYear = typeof sp.fiscalYear === "string" ? parseInt(sp.fiscalYear, 10) : undefined;
  const ruleCode = typeof sp.ruleCode === "string" ? sp.ruleCode : undefined;

  const reviews = await listReviewQueue({
    statuses,
    orgNumbers: orgNumber ? [orgNumber] : undefined,
    fiscalYear: fiscalYear && !isNaN(fiscalYear) ? fiscalYear : undefined,
    ruleCodes: ruleCode ? [ruleCode] : undefined,
    limit: 200,
  });

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#162233]">
            Review-kø for årsrapporter
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {reviews.length} sak{reviews.length !== 1 ? "er" : ""} — godkjenn, korriger, avvis eller send til reprocessing
          </p>
        </div>
      </div>

      {/* Filters */}
      <form method="GET" className="mb-6 flex flex-wrap gap-3">
        <select
          name="status"
          defaultValue={statuses[0]}
          className="rounded border border-[rgba(15,23,42,0.12)] bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none"
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
          className="rounded border border-[rgba(15,23,42,0.12)] bg-white px-3 py-2 text-sm text-slate-700 placeholder-slate-400 focus:outline-none"
        />
        <input
          name="fiscalYear"
          type="number"
          placeholder="Regnskapsår"
          defaultValue={fiscalYear}
          className="w-32 rounded border border-[rgba(15,23,42,0.12)] bg-white px-3 py-2 text-sm text-slate-700 placeholder-slate-400 focus:outline-none"
        />
        <input
          name="ruleCode"
          type="text"
          placeholder="Regelkode"
          defaultValue={ruleCode}
          className="rounded border border-[rgba(15,23,42,0.12)] bg-white px-3 py-2 text-sm text-slate-700 placeholder-slate-400 focus:outline-none"
        />
        <button
          type="submit"
          className="rounded border border-[rgba(15,23,42,0.12)] bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Filtrer
        </button>
      </form>

      {reviews.length === 0 ? (
        <div className="rounded-lg border border-[rgba(15,23,42,0.08)] bg-white p-10 text-center text-slate-400">
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
                      <span className="text-amber-700">{review.blockingRuleCodes.length} ({review.blockingRuleCodes.slice(0, 2).join(", ")})</span>
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
    </div>
  );
}
