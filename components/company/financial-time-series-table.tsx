"use client";

import { ReactNode, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

import { buildThreadedComments, ThreadedCommentNode } from "@/lib/comment-thread";
import {
  buildFinancialReportDataset,
  calculateGrowth,
  financialReportRows,
  FinancialDensityMode,
  FinancialReportRow,
  FinancialStatementType,
  FinancialUnit,
  FinancialValueMode,
  FINANCIAL_UNIT_LABELS,
  FINANCIAL_UNIT_SUFFIXES,
  formatCurrency,
  formatPercent,
  formatUnitAmount,
  getDisplayValue,
  getFinancialSections,
} from "@/lib/financial-report";
import {
  CompanyFinancialMetricDiscussionSummary,
  CompanyFinancialStatementDiscussionSummary,
  DdCommentThreadSummary,
  NormalizedFinancialDocument,
  NormalizedFinancialStatement,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const MINUS = "−";

// A statement never shows more than this many years at once; older years are
// reached with the pager. Matches the design's six-column document window.
const YEAR_WINDOW = 6;

const statementTitles: Record<FinancialStatementType, string> = {
  income: "Resultatregnskap",
  balance: "Balanse",
};

const modeLabels: Record<FinancialValueMode, string> = {
  amount: "Beløp",
  margin: "Margin",
  growth: "Vekst",
};

const densityLabels: Record<FinancialDensityMode, string> = {
  main: "Hovedlinjer",
  all: "Alle linjer",
};

const unitOptions: { value: FinancialUnit; label: string }[] = [
  { value: "NOK", label: "NOK" },
  { value: "kNOK", label: "1 000 NOK" },
  { value: "MNOK", label: "MNOK" },
];

/* Signed percentage delta, e.g. "+7,5 %" / "−1,1 %". */
function formatSignedPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  return (value < 0 ? MINUS : "+") + formatPercent(Math.abs(value));
}

/* Signed percentage-point delta, e.g. "+0,4 pp". */
function formatPpDelta(current: number | null, previous: number | null) {
  if (current === null || previous === null || !Number.isFinite(current) || !Number.isFinite(previous)) {
    return "—";
  }
  const delta = current - previous;
  return (delta < 0 ? MINUS : "+") + Math.abs(delta).toFixed(1).replace(".", ",") + " pp";
}

/* ---- controls --------------------------------------------------------- */
function ControlGroup({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label ? (
        <span className="data-label text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--px-muted)]">
          {label}
        </span>
      ) : null}
      {children}
    </div>
  );
}

function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex gap-0.5 rounded-full border border-[var(--px-border-subtle)] bg-[var(--px-subtle)] p-[3px]">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-full px-4 py-[7px] text-[13px] font-semibold transition-colors",
            value === option.value
              ? "bg-[var(--px-accent)] text-white"
              : "text-[var(--px-muted)] hover:text-[var(--px-text)]",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function PagerButton({
  direction,
  disabled,
  onClick,
}: {
  direction: "back" | "forward";
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={direction === "back" ? "Eldre år" : "Nyere år"}
      aria-label={direction === "back" ? "Eldre år" : "Nyere år"}
      className={cn(
        "inline-flex h-[34px] w-[34px] items-center justify-center rounded-full border border-[var(--px-border)] bg-white text-[var(--px-text)] transition",
        disabled ? "cursor-not-allowed opacity-40" : "hover:border-[var(--px-accent)]",
      )}
    >
      {direction === "back" ? <ChevronLeft className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
    </button>
  );
}

function formatCommentDateTime(value: Date | string) {
  return new Intl.DateTimeFormat("nb-NO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

type FinancialCellTarget = {
  financialStatementId: string;
  fiscalYear: number;
  metricKey: string;
  rowLabel: string;
};

function buildCellThreadKey(financialStatementId: string, metricKey: string) {
  return `${financialStatementId}:${metricKey}`;
}

function FinancialCommentList({
  thread,
  expanded,
}: {
  thread: DdCommentThreadSummary;
  expanded: boolean;
}) {
  const comments = buildThreadedComments(thread.comments);
  const visibleComments = expanded ? comments : comments.slice(-2);

  function CommentNode({
    comment,
    depth,
  }: {
    comment: ThreadedCommentNode;
    depth: number;
  }) {
    return (
      <div className={depth > 0 ? "border-l border-[rgba(15,23,42,0.08)] pl-3" : ""}>
        <div className="rounded-xl border border-[rgba(15,23,42,0.08)] bg-[rgba(248,249,250,0.72)] p-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="font-semibold text-slate-900">{comment.author.name ?? comment.author.email}</span>
            <span>{formatCommentDateTime(comment.createdAt)}</span>
          </div>
          <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{comment.content}</div>
        </div>
        {comment.replies.length > 0 ? (
          <div className="mt-2 space-y-2">
            {comment.replies.map((reply) => (
              <CommentNode key={reply.id} comment={reply} depth={depth + 1} />
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {visibleComments.map((comment) => (
        <CommentNode key={comment.id} comment={comment} depth={0} />
      ))}
    </div>
  );
}

function FinancialCellHoverCard({
  thread,
  roomName,
  replyValue,
  onReplyChange,
  onReplySubmit,
  submitting,
}: {
  thread: DdCommentThreadSummary;
  roomName: string;
  replyValue: string;
  onReplyChange: (value: string) => void;
  onReplySubmit: () => void;
  submitting: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="absolute right-0 top-[calc(100%+0.5rem)] z-30 w-[340px] rounded-2xl border border-[rgba(15,23,42,0.12)] bg-white p-4 text-left shadow-[0_20px_45px_rgba(15,23,42,0.16)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase text-slate-500">DD-tråd</div>
          <div className="mt-1 text-sm font-semibold text-slate-950">{roomName}</div>
        </div>
        <div className="rounded-full border border-[rgba(15,23,42,0.08)] bg-[rgba(248,249,250,0.72)] px-2.5 py-1 text-[11px] font-semibold uppercase text-slate-600">
          {thread.commentCount} kommentarer
        </div>
      </div>

      <div className="mt-3">
        <FinancialCommentList thread={thread} expanded={expanded} />
      </div>

      {thread.commentCount > 2 ? (
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="mt-3 text-xs font-semibold uppercase tracking-[0.08em] text-[#2f5d9f]"
        >
          {expanded ? "Vis mindre" : "Utvid"}
        </button>
      ) : null}

      <div className="mt-3 space-y-2">
        <textarea
          value={replyValue}
          onChange={(event) => onReplyChange(event.target.value)}
          rows={2}
          placeholder="Svar i tråden"
          className="w-full rounded-xl border border-[rgba(15,23,42,0.1)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--px-accent)]"
        />
        <button
          type="button"
          onClick={onReplySubmit}
          disabled={submitting || replyValue.trim().length < 2}
          className="rounded-full border border-[rgba(15,23,42,0.1)] bg-[rgba(248,249,250,0.92)] px-3 py-2 text-xs font-semibold text-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Lagrer..." : "Svar"}
        </button>
      </div>
    </div>
  );
}

function FinancialCellDialog({
  open,
  roomName,
  target,
  thread,
  value,
  onValueChange,
  onClose,
  onSubmit,
  submitting,
}: {
  open: boolean;
  roomName: string;
  target: FinancialCellTarget | null;
  thread: DdCommentThreadSummary | null;
  value: string;
  onValueChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  submitting: boolean;
}) {
  if (!open || !target) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,23,42,0.42)] px-4 py-8">
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[rgba(15,23,42,0.12)] bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.24)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase text-slate-500">Finansiell kommentartråd</div>
            <h3 className="mt-2 text-2xl font-semibold text-slate-950">
              {target.rowLabel} · {target.fiscalYear}
            </h3>
            <p className="mt-1.5 text-sm leading-6 text-slate-600">
              Kommentarene er knyttet til dette datapunktet i {roomName}.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[rgba(15,23,42,0.1)] bg-white text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-6 space-y-3">
          {thread ? (
            <FinancialCommentList thread={thread} expanded />
          ) : (
            <div className="rounded-xl border border-dashed border-[rgba(15,23,42,0.14)] bg-[rgba(248,249,250,0.62)] p-4 text-sm leading-6 text-slate-600">
              Ingen kommentarer enda. Første kommentar starter tråden for dette datapunktet.
            </div>
          )}
        </div>

        <div className="mt-6 space-y-3">
          <textarea
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
            rows={4}
            placeholder="Skriv en kommentar"
            className="w-full rounded-xl border border-[rgba(15,23,42,0.1)] bg-white px-4 py-3 text-sm outline-none focus:border-[var(--px-accent)]"
          />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onSubmit}
              disabled={submitting || value.trim().length < 2}
              className="rounded-full bg-[var(--px-action)] px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Lagrer..." : thread ? "Svar i tråden" : "Start tråd"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

type RawLineItem = {
  id: string;
  fiscalYear: number;
  statementType: string;
  statementScope?: "COMPANY" | "CONSOLIDATED" | null;
  originalLabel: string;
  originalValue: string;
  parsedValue: string | null;
  canonicalKey: string | null;
  unitScale: number;
  sourcePage: number | null;
  rowIndex: number | null;
  extractionRoute: string | null;
  confidence: number;
};

export function FinancialTimeSeriesTable({
  statements,
  documents,
  companySlug,
  discussionRoomId,
  discussionRoomName,
  discussionStatements,
  discussionThreads = [],
}: {
  statements: NormalizedFinancialStatement[];
  documents: NormalizedFinancialDocument[];
  companySlug: string;
  discussionRoomId?: string | null;
  discussionRoomName?: string | null;
  discussionStatements?: CompanyFinancialStatementDiscussionSummary[];
  discussionThreads?: CompanyFinancialMetricDiscussionSummary[];
}) {
  // A group company publishes two statement sets — konsern and selskap.
  // Determine which are available and let the user toggle; default to konsern.
  const availableScopes = useMemo(() => {
    const scopes = new Set<"COMPANY" | "CONSOLIDATED">();
    for (const statement of statements) {
      scopes.add(statement.statementScope ?? "COMPANY");
    }
    return scopes;
  }, [statements]);
  const [activeScope, setActiveScope] = useState<"COMPANY" | "CONSOLIDATED">(
    availableScopes.has("CONSOLIDATED") ? "CONSOLIDATED" : "COMPANY",
  );
  const scopedStatements = useMemo(
    () =>
      availableScopes.size > 1
        ? statements.filter((statement) => (statement.statementScope ?? "COMPANY") === activeScope)
        : statements,
    [statements, availableScopes, activeScope],
  );
  const reportingCurrency = scopedStatements[0]?.currency ?? statements[0]?.currency ?? "NOK";
  const dataset = useMemo(
    () => buildFinancialReportDataset(scopedStatements, documents),
    [documents, scopedStatements],
  );

  const [basis, setBasis] = useState<"standardized" | "reported">("standardized");
  const [mode, setMode] = useState<FinancialValueMode>("amount");
  const [densityMode, setDensityMode] = useState<FinancialDensityMode>("all");
  const [unit, setUnit] = useState<FinancialUnit>("MNOK");
  const [offset, setOffset] = useState(0); // years shifted back from the latest-anchored window
  const [rawItems, setRawItems] = useState<RawLineItem[] | null>(null);
  const [rawLoading, setRawLoading] = useState(false);

  const [hoveredCellKey, setHoveredCellKey] = useState<string | null>(null);
  const [hoverReplyDrafts, setHoverReplyDrafts] = useState<Record<string, string>>({});
  const [dialogDraft, setDialogDraft] = useState("");
  const [dialogTarget, setDialogTarget] = useState<FinancialCellTarget | null>(null);
  const [submittingCellKey, setSubmittingCellKey] = useState<string | null>(null);
  const [discussionError, setDiscussionError] = useState<string | null>(null);
  const [threadsByCell, setThreadsByCell] = useState<Record<string, DdCommentThreadSummary>>(() =>
    Object.fromEntries(
      discussionThreads.map((item) => [
        buildCellThreadKey(item.financialStatementId, item.metricKey),
        item.thread,
      ]),
    ),
  );
  const statementByYear = useMemo(
    () =>
      new Map(
        (discussionStatements ?? []).map((item) => [
          item.fiscalYear,
          { financialStatementId: item.financialStatementId, fiscalYear: item.fiscalYear },
        ]),
      ),
    [discussionStatements],
  );
  const rowLabelByKey = useMemo(
    () => new Map(financialReportRows.map((row) => [row.key, row.label])),
    [],
  );

  const dialogThread = dialogTarget
    ? threadsByCell[buildCellThreadKey(dialogTarget.financialStatementId, dialogTarget.metricKey)] ?? null
    : null;

  function loadReported() {
    if (rawItems === null && !rawLoading) {
      setRawLoading(true);
      // No year filter — fetch every published year so the reported view shows
      // the full multi-year statement, not just the latest.
      fetch(`/api/companies/${companySlug}/raw-financials`)
        .then((r) => r.json())
        .then((body: { data: RawLineItem[] }) => setRawItems(body.data))
        .catch(() => setRawItems([]))
        .finally(() => setRawLoading(false));
    }
  }

  async function submitCellComment(target: FinancialCellTarget, content: string) {
    if (!discussionRoomId || content.trim().length < 2) {
      return;
    }

    const cellKey = buildCellThreadKey(target.financialStatementId, target.metricKey);
    setSubmittingCellKey(cellKey);
    setDiscussionError(null);

    try {
      const response = await fetch(`/api/dd-rooms/${discussionRoomId}/financial-metric-comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          financialStatementId: target.financialStatementId,
          financialMetricKey: target.metricKey,
          content,
        }),
      });

      const payload = (await response.json()) as { data?: DdCommentThreadSummary; error?: string };

      if (!response.ok || !payload.data) {
        throw new Error(payload.error ?? "Kunne ikke lagre kommentaren.");
      }

      setThreadsByCell((current) => ({
        ...current,
        [cellKey]: payload.data as DdCommentThreadSummary,
      }));
      setHoverReplyDrafts((current) => ({ ...current, [cellKey]: "" }));

      if (dialogTarget && buildCellThreadKey(dialogTarget.financialStatementId, dialogTarget.metricKey) === cellKey) {
        setDialogDraft("");
      }
    } catch (error) {
      setDiscussionError(error instanceof Error ? error.message : "Kunne ikke lagre kommentaren.");
    } finally {
      setSubmittingCellKey(null);
    }
  }

  // Only years that carry parsed statement values — a filed document without a
  // parsed statement (e.g. the newest year still being processed) must not show
  // up as an empty column or steal the "latest" anchor from the KPIs.
  const years = useMemo(
    () =>
      dataset.years.filter((year) =>
        financialReportRows.some((row) => dataset.valuesByYear[year]?.[row.key] != null),
      ),
    [dataset],
  );
  const latestYear = years.length > 0 ? years[years.length - 1] : undefined;
  const previousYear = years.length > 1 ? years[years.length - 2] : undefined;

  const reportedYears = useMemo(() => {
    if (!rawItems) return [] as number[];
    return Array.from(new Set(rawItems.map((item) => item.fiscalYear))).sort((a, b) => a - b);
  }, [rawItems]);

  if (years.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[rgba(15,23,42,0.14)] bg-[rgba(248,249,250,0.62)] p-6 text-sm leading-7 text-slate-600">
        Regnskapstall er ikke tilgjengelige for denne virksomheten ennå.
      </div>
    );
  }

  function hasDataForRow(row: FinancialReportRow) {
    return years.some((year) => dataset.valuesByYear[year]?.[row.key] != null);
  }

  // Rows to render for a section: main lines only in "Hovedlinjer", every line
  // that carries data (including the parent-linked breakdown) in "Alle linjer".
  function sectionRows(sectionKey: string, statement: FinancialStatementType) {
    return financialReportRows.filter(
      (row) =>
        row.statement === statement &&
        row.section === sectionKey &&
        (densityMode === "all" ? hasDataForRow(row) : !row.parentKey && row.visibility === "main"),
    );
  }

  // ---- KPI summary -------------------------------------------------------
  const latestValues = latestYear ? dataset.valuesByYear[latestYear] : undefined;
  const revenueLatest = latestValues?.total_operating_revenue ?? null;
  const ebitLatest = latestValues?.ebit ?? null;
  const marginLatest =
    revenueLatest != null && ebitLatest != null && revenueLatest !== 0
      ? (ebitLatest / revenueLatest) * 100
      : null;
  const prevValues = previousYear ? dataset.valuesByYear[previousYear] : undefined;
  const marginPrev =
    prevValues && prevValues.total_operating_revenue != null && prevValues.ebit != null && prevValues.total_operating_revenue !== 0
      ? (prevValues.ebit / prevValues.total_operating_revenue) * 100
      : null;

  const kpiGrowth = (key: string) =>
    latestYear && previousYear
      ? calculateGrowth(dataset.valuesByYear[latestYear]?.[key] ?? null, dataset.valuesByYear[previousYear]?.[key] ?? null)
      : null;

  const unitLabel = FINANCIAL_UNIT_LABELS[unit];
  const unitSuffix = FINANCIAL_UNIT_SUFFIXES[unit];
  const kpis: { label: string; value: string; delta: string }[] = [
    {
      label: "Driftsinntekter",
      value: `${formatUnitAmount(revenueLatest, unit)} ${unitSuffix}`,
      delta: formatSignedPercent(kpiGrowth("total_operating_revenue")),
    },
    {
      label: "Driftsresultat (EBIT)",
      value: `${formatUnitAmount(ebitLatest, unit)} ${unitSuffix}`,
      delta: formatSignedPercent(kpiGrowth("ebit")),
    },
    {
      label: "EBIT-margin",
      value: formatPercent(marginLatest),
      delta: formatPpDelta(marginLatest, marginPrev),
    },
    {
      label: "Sum eiendeler",
      value: `${formatUnitAmount(latestValues?.total_assets ?? null, unit)} ${unitSuffix}`,
      delta: formatSignedPercent(kpiGrowth("total_assets")),
    },
  ];

  // ---- shared year pager -------------------------------------------------
  const activeYears = basis === "reported" && reportedYears.length > 0 ? reportedYears : years;
  const windowSize = Math.min(YEAR_WINDOW, activeYears.length);
  const maxOffset = Math.max(0, activeYears.length - windowSize);
  const off = Math.min(maxOffset, Math.max(0, offset));
  const end = activeYears.length - off;
  const start = end - windowSize;
  const visibleYears = activeYears.slice(start, end);
  const rangeLabel =
    visibleYears.length > 0 ? `${visibleYears[0]}–${visibleYears[visibleYears.length - 1]}` : "";

  const infoText =
    basis === "standardized"
      ? `Standardiserte poster · sammenlignbare på tvers av selskaper og år · Tall i ${unitLabel}`
      : `Innlevert årsregnskap · resultatregnskap og balanse · beløp vist som innrapportert (${reportingCurrency})`;
  const infoIcon = basis === "standardized" ? "info" : "description";

  // ---- standardized document cell ---------------------------------------
  function formatStandardCell(row: FinancialReportRow, year: number) {
    const displayValue = getDisplayValue(row, year, mode, dataset);
    if (mode === "amount") return formatUnitAmount(displayValue, unit, { report: true });
    if (mode === "growth") {
      if (displayValue === null) return "";
      return formatSignedPercent(displayValue);
    }
    return displayValue === null ? "" : formatPercent(displayValue);
  }

  function renderStandardSection(statement: FinancialStatementType) {
    const sections = getFinancialSections(statement);
    const rows = sections.flatMap((section) => sectionRows(section.key, statement));
    if (rows.every((row) => !hasDataForRow(row))) {
      return null;
    }

    const unitHeader = mode === "amount" ? `Beløp i ${unitLabel}` : mode === "margin" ? "% av sum" : "Endring %";

    return (
      <section key={statement} className="mt-10 first:mt-2">
        <h3 className="editorial-display text-[30px] tracking-[-0.02em] text-[var(--px-text)]">
          {statementTitles[statement]}
        </h3>
        <div className="mt-3.5 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr className="border-b-2 border-[var(--px-text)]">
                <th className="data-label px-2 py-2.5 text-left text-[10px] font-semibold uppercase text-[var(--px-muted)]">
                  {unitHeader}
                </th>
                <th className="data-label w-12 px-2 py-2.5 text-center text-[10px] font-semibold uppercase text-[var(--px-muted)]">
                  Note
                </th>
                {visibleYears.map((year) => (
                  <th
                    key={year}
                    className={cn(
                      "tabular-nums px-2 py-2.5 text-right font-mono text-xs",
                      year === latestYear ? "font-bold text-[var(--px-text)]" : "font-semibold text-[var(--px-muted)]",
                    )}
                  >
                    {year}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sections.map((section) => {
                const secRows = sectionRows(section.key, statement);
                if (secRows.length === 0) return null;
                return (
                  <FragmentSection
                    key={section.key}
                    title={section.title}
                    colSpan={2 + visibleYears.length}
                  >
                    {secRows.map((row) => renderStandardRow(row, statement))}
                  </FragmentSection>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  function renderStandardRow(row: FinancialReportRow, statement: FinancialStatementType) {
    const isTotal = row.type === "total";
    const isSub = row.type === "subtotal";
    const isKey = row.type === "key_metric";
    const strong = isTotal || isSub || isKey;
    const indent = row.parentKey || row.visibility === "detail";
    const borderTop = isTotal
      ? "3px double var(--px-text)"
      : isSub || isKey
        ? "1px solid var(--px-text)"
        : "1px solid var(--px-border-subtle)";
    const showBalanceBadge =
      statement === "balance" &&
      latestYear != null &&
      (row.key === "total_assets" || row.key === "total_equity_and_liabilities");
    const balanced = latestYear != null ? dataset.balanceValidationByYear[latestYear]?.balanced : undefined;

    return (
      <tr
        key={row.key}
        style={{ borderTop, background: isKey ? "var(--px-accent-soft)" : "transparent" }}
      >
        <th
          scope="row"
          className={cn(
            "px-2 text-left align-middle text-[var(--px-text)]",
            isTotal ? "py-3.5 text-[15px]" : "py-2.5 text-sm",
            strong ? "font-semibold" : "font-normal",
          )}
          style={{ paddingLeft: indent ? 28 : 8 }}
        >
          <span className="inline-flex items-center gap-2">
            <span className={cn(indent && !strong && "text-[var(--px-muted)]")}>{row.label}</span>
            {showBalanceBadge ? (
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]",
                  balanced
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-amber-200 bg-amber-50 text-amber-900",
                )}
              >
                {balanced ? "Avstemt" : "Sjekk"}
              </span>
            ) : null}
          </span>
        </th>
        <td className="px-2 py-2 text-center font-mono text-[11px] text-[var(--px-muted)]" />
        {visibleYears.map((year) => renderStandardCell(row, year, isTotal, strong))}
      </tr>
    );
  }

  function renderStandardCell(row: FinancialReportRow, year: number, isTotal: boolean, strong: boolean) {
    const displayValue = getDisplayValue(row, year, mode, dataset);
    const text = formatStandardCell(row, year);
    const statementArtifact = statementByYear.get(year) ?? null;
    const commentable =
      Boolean(discussionRoomId) && mode === "amount" && displayValue !== null && statementArtifact !== null;
    const cellTarget: FinancialCellTarget | null = commentable
      ? {
          financialStatementId: statementArtifact!.financialStatementId,
          fiscalYear: year,
          metricKey: row.key,
          rowLabel: rowLabelByKey.get(row.key) ?? row.label,
        }
      : null;
    const cellKey = cellTarget
      ? buildCellThreadKey(cellTarget.financialStatementId, cellTarget.metricKey)
      : null;
    const thread = cellKey ? threadsByCell[cellKey] ?? null : null;
    const hoverDraft = cellKey ? hoverReplyDrafts[cellKey] ?? "" : "";
    const hoverOpen = Boolean(thread && hoveredCellKey === cellKey);

    return (
      <td
        key={year}
        className={cn(
          "tabular-nums px-2 text-right align-middle font-mono",
          isTotal ? "py-3.5 text-[14.5px]" : "py-2.5 text-[13px]",
          strong ? "font-semibold" : "font-normal",
          year === latestYear ? "text-[var(--px-text)]" : "text-[var(--px-muted)]",
        )}
      >
        <div
          className={cn("relative inline-flex max-w-full justify-end", commentable && "cursor-pointer")}
          onMouseEnter={() => {
            if (thread && cellKey) setHoveredCellKey(cellKey);
          }}
          onMouseLeave={() => {
            if (thread && cellKey && hoveredCellKey === cellKey) setHoveredCellKey(null);
          }}
        >
          <button
            type="button"
            disabled={!cellTarget}
            onClick={(event) => {
              event.stopPropagation();
              if (!cellTarget) return;
              setDiscussionError(null);
              setDialogTarget(cellTarget);
              setDialogDraft("");
            }}
            className={cn(
              "relative rounded-md px-1 py-0.5 text-right transition",
              commentable ? "hover:bg-[rgba(47,93,159,0.08)]" : "cursor-default",
            )}
          >
            {text}
            {thread ? (
              <span className="absolute -right-1 -top-1 inline-flex h-2.5 w-2.5 rounded-full bg-[#2f5d9f]" />
            ) : null}
          </button>

          {thread && hoverOpen && discussionRoomName ? (
            <FinancialCellHoverCard
              thread={thread}
              roomName={discussionRoomName}
              replyValue={hoverDraft}
              onReplyChange={(value) =>
                setHoverReplyDrafts((current) => ({ ...current, [cellKey as string]: value }))
              }
              onReplySubmit={() => {
                if (cellTarget) void submitCellComment(cellTarget, hoverDraft);
              }}
              submitting={submittingCellKey === cellKey}
            />
          ) : null}
        </div>
      </td>
    );
  }

  return (
    <div className="space-y-5">
      {/* heading — floats above the document card */}
      <header className="px-1">
        <div className="data-label text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--px-muted)]">
          Regnskap
        </div>
        <h2 className="mt-2 text-[26px] font-semibold tracking-[-0.02em] text-[var(--px-text)]">
          Resultat og balanse over tid
        </h2>
        <p className="mt-1.5 text-sm text-[var(--px-muted)]">
          {availableScopes.has("CONSOLIDATED") ? "Konserntall" : "Selskapstall"}, alle innleverte
          regnskapsår. Eldste år til venstre. Bare verifiserte tall vises.
        </p>
      </header>

      {/* controls + KPI summary */}
      <div className="flex flex-col gap-5 px-1">
        <div className="flex flex-wrap items-end gap-5">
          <ControlGroup label="Oppstilling">
            <SegmentedControl
              value={basis}
              onChange={(value) => {
                setBasis(value);
                setOffset(0);
                if (value === "reported") loadReported();
              }}
              options={[
                { value: "reported", label: "Som rapportert" },
                { value: "standardized", label: "Standardisert" },
              ]}
            />
          </ControlGroup>

          {basis === "standardized" ? (
            <>
              <div className="mx-1 h-9 w-px self-stretch bg-[var(--px-border-subtle)]" aria-hidden="true" />
              <ControlGroup label="Visning">
                <SegmentedControl
                  value={mode}
                  onChange={setMode}
                  options={[
                    { value: "amount", label: modeLabels.amount },
                    { value: "margin", label: modeLabels.margin },
                    { value: "growth", label: modeLabels.growth },
                  ]}
                />
              </ControlGroup>
              <ControlGroup label="Detaljnivå">
                <SegmentedControl
                  value={densityMode}
                  onChange={setDensityMode}
                  options={[
                    { value: "main", label: densityLabels.main },
                    { value: "all", label: densityLabels.all },
                  ]}
                />
              </ControlGroup>
            </>
          ) : null}

          <ControlGroup label="Enhet">
            <SegmentedControl value={unit} onChange={setUnit} options={unitOptions} />
          </ControlGroup>

          {availableScopes.size > 1 ? (
            <ControlGroup label="Regnskap">
              <SegmentedControl
                value={activeScope}
                onChange={(value) => {
                  setActiveScope(value);
                  setOffset(0);
                }}
                options={[
                  { value: "CONSOLIDATED", label: "Konsern" },
                  { value: "COMPANY", label: "Selskap" },
                ]}
              />
            </ControlGroup>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-x-8 gap-y-5 xl:grid-cols-4">
          {kpis.map((item) => {
            const negative = item.delta.charAt(0) === MINUS;
            const neutral = item.delta === "—";
            return (
              <div key={item.label}>
                <div className="data-label text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--px-muted)]">
                  {item.label}
                </div>
                <div className="tabular-nums mt-2 text-[26px] font-semibold tracking-[-0.01em] text-[var(--px-text)]">
                  {item.value}
                </div>
                <div className="mt-1.5 flex items-baseline gap-1.5">
                  <span
                    className="tabular-nums text-[13px] font-semibold"
                    style={{
                      color: neutral
                        ? "var(--px-muted)"
                        : negative
                          ? "var(--px-danger, #b3261e)"
                          : "var(--px-positive, #1f7a4d)",
                    }}
                  >
                    {item.delta}
                  </span>
                  {previousYear ? (
                    <span className="text-[11px] text-[var(--px-muted)]">vs {previousYear}</span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* document card */}
      <div className="overflow-hidden rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white">
        <div className="flex items-center gap-2.5 bg-[rgba(248,249,250,0.6)] px-7 py-3.5">
          <span className="material-symbols-outlined text-[18px] text-[var(--px-muted)]">{infoIcon}</span>
          <span className="text-[13px] text-[var(--px-muted)]">{infoText}</span>
        </div>

        <div className={cn(basis === "standardized" ? "px-7 pb-8 pt-5" : "px-7 pb-8 pt-7")}>
          <div className="mx-auto max-w-[1080px]">
            {/* shared year pager */}
            <div className="mb-1.5 flex flex-wrap items-end justify-between gap-4">
              <div className="data-label text-[10.5px] uppercase text-[var(--px-muted)]">
                {availableScopes.has("CONSOLIDATED") && activeScope === "CONSOLIDATED" ? "Konsern · " : ""}
                Tall i {basis === "standardized" ? unitLabel : reportingCurrency}
              </div>
              {activeYears.length > windowSize ? (
                <div className="flex items-center gap-3">
                  <span className="tabular-nums font-mono text-[11px] text-[var(--px-muted)]">{rangeLabel}</span>
                  <div className="flex gap-2">
                    <PagerButton
                      direction="back"
                      disabled={off >= maxOffset}
                      onClick={() => setOffset((o) => Math.min(maxOffset, o + 1))}
                    />
                    <PagerButton
                      direction="forward"
                      disabled={off <= 0}
                      onClick={() => setOffset((o) => Math.max(0, o - 1))}
                    />
                  </div>
                </div>
              ) : null}
            </div>

            {basis === "standardized" ? (
              <>
                {renderStandardSection("income")}
                {renderStandardSection("balance")}
                {discussionRoomId && discussionRoomName ? (
                  <p className="mt-6 border-t border-[var(--px-border-subtle)] pt-3.5 text-[12px] leading-6 text-[var(--px-muted)]">
                    Klikk på et tall (i Beløp-visning) for å starte eller åpne en kommentartråd for akkurat
                    det datapunktet.
                  </p>
                ) : null}
              </>
            ) : (
              <ReportedDocument
                items={rawItems}
                loading={rawLoading}
                activeScope={activeScope}
                hasScopeToggle={availableScopes.size > 1}
                visibleYears={visibleYears}
                latestYear={latestYear}
              />
            )}
          </div>
        </div>
      </div>

      {discussionError ? (
        <div className="rounded-2xl border border-[rgba(15,23,42,0.08)] bg-[rgba(255,246,236,0.9)] px-5 py-3 text-sm text-[#8a5b21]">
          {discussionError}
        </div>
      ) : null}

      <FinancialCellDialog
        open={Boolean(dialogTarget)}
        roomName={discussionRoomName ?? "DD-rom"}
        target={dialogTarget}
        thread={dialogThread}
        value={dialogDraft}
        onValueChange={setDialogDraft}
        onClose={() => {
          setDialogTarget(null);
          setDialogDraft("");
        }}
        onSubmit={() => {
          if (dialogTarget) void submitCellComment(dialogTarget, dialogDraft);
        }}
        submitting={
          dialogTarget
            ? submittingCellKey === buildCellThreadKey(dialogTarget.financialStatementId, dialogTarget.metricKey)
            : false
        }
      />
    </div>
  );
}

function FragmentSection({
  title,
  colSpan,
  children,
}: {
  title: string;
  colSpan: number;
  children: ReactNode;
}) {
  return (
    <>
      <tr>
        <td colSpan={colSpan} className="pb-1 pl-2 pt-6 first:pt-4">
          <span className="data-label text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--px-muted)]">
            {title}
          </span>
        </td>
      </tr>
      {children}
    </>
  );
}

const reportedStatementLabels: Record<string, string> = {
  INCOME_STATEMENT: "Resultatregnskap",
  BALANCE_SHEET: "Balanse",
  CASH_FLOW: "Kontantstrøm",
};

function ReportedDocument({
  items,
  loading,
  activeScope,
  hasScopeToggle,
  visibleYears,
  latestYear,
}: {
  items: RawLineItem[] | null;
  loading: boolean;
  activeScope: "COMPANY" | "CONSOLIDATED";
  hasScopeToggle: boolean;
  visibleYears: number[];
  latestYear: number | undefined;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center px-2 py-12 text-sm text-[var(--px-muted)]">
        Laster rådata…
      </div>
    );
  }

  if (items === null || items.length === 0) {
    return (
      <div className="px-2 py-10 text-sm text-[var(--px-muted)]">
        <p className="font-medium text-[var(--px-text)]">Rådata ikke tilgjengelig</p>
        <p className="mt-1">
          Kjør unified shadow extraction for å generere «som rapportert»-data for dette selskapet.
        </p>
        <pre className="mt-3 rounded-xl bg-slate-100 px-4 py-3 text-xs text-slate-600">
          npm run financials:prepare-gold-set-shadow-data
        </pre>
      </div>
    );
  }

  // When the data carries scopes (reviewed/published items do), follow the
  // konsern/selskap toggle so the reported view matches the standardized one.
  const itemsHaveScope = items.some((i) => i.statementScope != null);
  const scopedItems =
    itemsHaveScope && hasScopeToggle
      ? items.filter((i) => (i.statementScope ?? "COMPANY") === activeScope)
      : items;

  const byStatement: Record<string, RawLineItem[]> = {};
  for (const item of scopedItems) {
    (byStatement[item.statementType] ??= []).push(item);
  }

  type MergedRow = { key: string; label: string; valueByYear: Record<number, string> };
  function mergeRows(rows: RawLineItem[]): MergedRow[] {
    const order: string[] = [];
    const map = new Map<string, MergedRow>();
    for (const row of rows) {
      const key = row.canonicalKey ?? `label:${row.originalLabel}`;
      let merged = map.get(key);
      if (!merged) {
        merged = { key, label: row.originalLabel, valueByYear: {} };
        map.set(key, merged);
        order.push(key);
      }
      if (!merged.valueByYear[row.fiscalYear]) {
        merged.valueByYear[row.fiscalYear] = row.originalValue;
      }
    }
    return order.map((k) => map.get(k)!);
  }

  return (
    <div className="space-y-12">
      {Object.entries(byStatement).map(([stmtType, rows]) => {
        const merged = mergeRows(rows);
        return (
          <section key={stmtType} className="first:mt-2">
            <h3 className="editorial-display text-[30px] tracking-[-0.02em] text-[var(--px-text)]">
              {reportedStatementLabels[stmtType] ?? stmtType}
            </h3>
            <div className="mt-3.5 overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse">
                <thead>
                  <tr className="border-b-2 border-[var(--px-text)]">
                    <th className="data-label px-2 py-2.5 text-left text-[10px] font-semibold uppercase text-[var(--px-muted)]">
                      Innrapportert linje
                    </th>
                    {visibleYears.map((year) => (
                      <th
                        key={year}
                        className={cn(
                          "tabular-nums px-2 py-2.5 text-right font-mono text-xs",
                          year === latestYear
                            ? "font-bold text-[var(--px-text)]"
                            : "font-semibold text-[var(--px-muted)]",
                        )}
                      >
                        {year}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {merged.map((row) => (
                    <tr key={row.key} className="border-b border-[var(--px-border-subtle)]">
                      <td className="px-2 py-2 text-left text-sm text-[var(--px-text)]">{row.label}</td>
                      {visibleYears.map((year) => (
                        <td
                          key={year}
                          className={cn(
                            "tabular-nums px-2 py-2 text-right font-mono text-[13px]",
                            year === latestYear ? "text-[var(--px-text)]" : "text-[var(--px-muted)]",
                          )}
                        >
                          {row.valueByYear[year] ?? ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
