import Link from "next/link";
import { AnnualReportRefreshButton } from "@/app/(app)/admin/AnnualReportRefreshButton";

import {
  listUnifiedConfidenceGateResultsForAdmin,
  type UnifiedConfidenceAdminStatus,
} from "@/server/services/annual-report-unified-confidence-admin-service";

import {
  VerdictBadge,
  StatusBadge,
  formatCount,
  formatDuration,
  formatPercent,
  formatTimestamp,
  summarizeCodes,
} from "./ui";

type SearchParams = Record<string, string | string[] | undefined>;

function readString(value: string | string[] | undefined) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : "";
}

function readNumber(value: string | string[] | undefined) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function buildQueryString(
  next: Record<string, string | number | undefined>,
  current: Record<string, string>,
) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(current)) {
    if (value) {
      params.set(key, value);
    }
  }

  for (const [key, value] of Object.entries(next)) {
    if (value === undefined || value === "") {
      params.delete(key);
    } else {
      params.set(key, String(value));
    }
  }

  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export default async function AnnualReportUnifiedConfidencePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const verdict = readString(sp.verdict);
  const orgNumber = readString(sp.orgNumber);
  const checkCode = readString(sp.checkCode);
  const status = readString(sp.status) as UnifiedConfidenceAdminStatus | "";
  const fiscalYear = readNumber(sp.fiscalYear);
  const page = Math.max(readNumber(sp.page) ?? 1, 1);
  const limit = 50;
  const offset = (page - 1) * limit;

  const result = await listUnifiedConfidenceGateResultsForAdmin({
    verdict:
      verdict === "PASS" || verdict === "WARN" || verdict === "FAIL" || verdict === "INSUFFICIENT_DATA"
        ? verdict
        : undefined,
    orgNumber: orgNumber || undefined,
    checkCode: checkCode || undefined,
    status: status || undefined,
    fiscalYear,
    limit,
    offset,
  });

  const currentFilters = {
    verdict,
    orgNumber,
    checkCode,
    status,
    fiscalYear: fiscalYear ? String(fiscalYear) : "",
  };

  const hasPreviousPage = page > 1;
  const hasNextPage = offset + result.items.length < result.total;

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#162233]">
            Unified kontroll
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Oversikt over saker der unified-resultatet trenger kontroll, ny kjøring eller oppfølging.
          </p>
        </div>
        <AnnualReportRefreshButton
          scope="affected"
          label="Refresh berørte saker"
          pendingLabel="Starter refresh..."
          helperText="Kjører berørte dokumenter på nytt når unified mangler verdier eller saken står fast."
          className="rounded-full border border-[rgba(15,23,42,0.12)] bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60"
        />
      </div>

      <div className="mb-6 grid gap-3 md:grid-cols-5">
        {[
          { label: "Total", value: result.summary.total, className: "text-slate-700" },
          { label: "PASS", value: result.summary.PASS, className: "text-green-700" },
          { label: "WARN", value: result.summary.WARN, className: "text-amber-700" },
          { label: "FAIL", value: result.summary.FAIL, className: "text-red-700" },
          {
            label: "INSUFFICIENT",
            value: result.summary.INSUFFICIENT_DATA,
            className: "text-slate-600",
          },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-lg border border-[rgba(15,23,42,0.08)] bg-white px-4 py-3"
          >
            <div className="text-xs font-medium uppercase tracking-widest text-slate-400">
              {card.label}
            </div>
            <div className={`mt-2 text-2xl font-semibold ${card.className}`}>{card.value}</div>
          </div>
        ))}
      </div>

      <form method="GET" className="mb-6 flex flex-wrap gap-3">
        <select
          name="verdict"
          defaultValue={verdict}
          className="rounded border border-[rgba(15,23,42,0.12)] bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none"
        >
          <option value="">Alle vurderinger</option>
          <option value="PASS">PASS</option>
          <option value="WARN">WARN</option>
          <option value="FAIL">FAIL</option>
          <option value="INSUFFICIENT_DATA">INSUFFICIENT_DATA</option>
        </select>
        <select
          name="status"
          defaultValue={status}
          className="rounded border border-[rgba(15,23,42,0.12)] bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none"
        >
          <option value="">Alle statuser</option>
          <option value="completed">Ferdig</option>
          <option value="skipped">Hoppet over</option>
          <option value="error">Feil</option>
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
          name="checkCode"
          type="text"
          placeholder="Kontrollkode"
          defaultValue={checkCode}
          className="rounded border border-[rgba(15,23,42,0.12)] bg-white px-3 py-2 text-sm text-slate-700 placeholder-slate-400 focus:outline-none"
        />
        <button
          type="submit"
          className="rounded border border-[rgba(15,23,42,0.12)] bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Filtrer
        </button>
      </form>

      <div className="mb-4 flex flex-wrap gap-2 text-xs text-slate-500">
        {["PASS", "WARN", "FAIL", "INSUFFICIENT_DATA"].map((quickVerdict) => (
          <Link
            key={quickVerdict}
            href={buildQueryString({ verdict: quickVerdict, page: 1 }, currentFilters) as never}
            className="rounded border border-[rgba(15,23,42,0.12)] bg-white px-3 py-1 hover:bg-slate-50"
          >
            {quickVerdict}
          </Link>
        ))}
        <Link
          href={buildQueryString(
            { verdict: undefined, status: undefined, orgNumber: undefined, fiscalYear: undefined, checkCode: undefined, page: 1 },
            currentFilters,
          ) as never}
          className="rounded border border-[rgba(15,23,42,0.12)] bg-white px-3 py-1 hover:bg-slate-50"
        >
          Nullstill
        </Link>
      </div>

      {result.items.length === 0 ? (
        <div className="rounded-lg border border-[rgba(15,23,42,0.08)] bg-white p-10 text-center text-slate-400">
          Ingen unified-saker matcher filteret.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[rgba(15,23,42,0.08)] bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[rgba(15,23,42,0.08)] bg-[#f9f9f7]">
                <th className="px-4 py-3 text-left font-medium text-slate-500">Filing ID</th>
                <th className="px-4 py-3 text-left font-medium text-slate-500">Org.nr</th>
                <th className="px-4 py-3 text-left font-medium text-slate-500">Selskap</th>
                <th className="px-4 py-3 text-left font-medium text-slate-500">År</th>
                <th className="px-4 py-3 text-left font-medium text-slate-500">Status</th>
                <th className="px-4 py-3 text-left font-medium text-slate-500">Verdict</th>
                <th className="px-4 py-3 text-left font-medium text-slate-500">P/W/F/I</th>
                <th className="px-4 py-3 text-left font-medium text-slate-500">Blocking</th>
                <th className="px-4 py-3 text-left font-medium text-slate-500">Warnings</th>
                <th className="px-4 py-3 text-left font-medium text-slate-500">Line items</th>
                <th className="px-4 py-3 text-left font-medium text-slate-500">Narrative</th>
                <th className="px-4 py-3 text-left font-medium text-slate-500">Match rate</th>
                <th className="px-4 py-3 text-left font-medium text-slate-500">Varighet</th>
                <th className="px-4 py-3 text-left font-medium text-slate-500">Generert</th>
                <th className="px-4 py-3 text-left font-medium text-slate-500"></th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((row) => (
                <tr
                  key={row.artifactId}
                  className="border-b border-[rgba(15,23,42,0.06)] last:border-0 hover:bg-[#f9f9f7]"
                >
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{row.filingId}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{row.orgNumber ?? "—"}</td>
                  <td className="px-4 py-3 font-medium text-[#162233]">{row.companyName ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-700">{row.fiscalYear ?? "—"}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="px-4 py-3">
                    <VerdictBadge verdict={row.gateVerdict} />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">
                    {row.passCount}/{row.warnCount}/{row.failCount}/{row.insufficientDataCount}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-700">{summarizeCodes(row.blockingCheckCodes)}</td>
                  <td className="px-4 py-3 text-xs text-slate-700">{summarizeCodes(row.warningCheckCodes)}</td>
                  <td className="px-4 py-3 text-slate-700">{formatCount(row.financialLineItemCount)}</td>
                  <td className="px-4 py-3 text-slate-700">{formatCount(row.narrativeSectionCount)}</td>
                  <td className="px-4 py-3 text-slate-700">{formatPercent(row.comparisonMatchRate)}</td>
                  <td className="px-4 py-3 text-slate-700">{formatDuration(row.durationMs)}</td>
                  <td className="px-4 py-3 text-xs text-slate-400">{formatTimestamp(row.generatedAt)}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/annual-report-unified-confidence/${row.filingId}` as never}
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

      <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
        <div>
          Viser {result.total === 0 ? 0 : offset + 1}–{Math.min(offset + result.items.length, result.total)} av {result.total}
        </div>
        <div className="flex gap-2">
          {hasPreviousPage ? (
            <Link
              href={buildQueryString({ page: page - 1 }, currentFilters) as never}
              className="rounded border border-[rgba(15,23,42,0.12)] bg-white px-3 py-1 hover:bg-slate-50"
            >
              Forrige
            </Link>
          ) : (
            <span className="rounded border border-[rgba(15,23,42,0.08)] bg-slate-50 px-3 py-1 text-slate-300">
              Forrige
            </span>
          )}
          {hasNextPage ? (
            <Link
              href={buildQueryString({ page: page + 1 }, currentFilters) as never}
              className="rounded border border-[rgba(15,23,42,0.12)] bg-white px-3 py-1 hover:bg-slate-50"
            >
              Neste
            </Link>
          ) : (
            <span className="rounded border border-[rgba(15,23,42,0.08)] bg-slate-50 px-3 py-1 text-slate-300">
              Neste
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
