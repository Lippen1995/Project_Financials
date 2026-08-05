"use client";

import React, { ReactNode, useMemo, useState } from "react";
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
  formatPercent,
  formatUnitAmount,
  getDisplayValue,
  getFinancialSections,
} from "@/lib/financial-report";
import {
  CompanyFinancialMetricDiscussionSummary,
  CompanyFinancialStatementDiscussionSummary,
  DataAvailability,
  DdCommentThreadSummary,
  NormalizedFinancialDocument,
  NormalizedFinancialLineItem,
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

// Reported ("Som rapportert") statement layout — a standard NGAAP oppstilling.
// Structural rows (header/group/subgroup) carry no value; value rows bind a
// canonical metric key from the standardized dataset so the figures are real.
type ReportedSpecRow =
  | { kind: "header"; label: string; spaceTop?: boolean }
  | { kind: "group"; label: string }
  | { kind: "subgroup"; label: string }
  | { kind: "value"; variant: "line" | "subtotal" | "result" | "total"; label: string; metricKey: string; note?: string };

const reportedIncomeSpec: ReportedSpecRow[] = [
  { kind: "group", label: "Driftsinntekter og driftskostnader" },
  { kind: "value", variant: "line", label: "Salgsinntekt", metricKey: "sales_revenue" },
  { kind: "value", variant: "line", label: "Annen driftsinntekt", metricKey: "other_operating_revenue" },
  { kind: "value", variant: "subtotal", label: "Sum driftsinntekter", metricKey: "total_operating_revenue" },
  { kind: "value", variant: "line", label: "Varekostnad", metricKey: "cost_of_goods_sold" },
  { kind: "value", variant: "line", label: "Lønnskostnad", metricKey: "salary_costs" },
  { kind: "value", variant: "line", label: "Av- og nedskrivninger", metricKey: "depreciation" },
  { kind: "value", variant: "line", label: "Annen driftskostnad", metricKey: "other_operating_costs" },
  { kind: "value", variant: "subtotal", label: "Sum driftskostnader", metricKey: "total_operating_costs" },
  { kind: "value", variant: "result", label: "Driftsresultat", metricKey: "ebit" },
  { kind: "group", label: "Finansinntekter og finanskostnader" },
  { kind: "value", variant: "line", label: "Renteinntekt fra tilknyttet selskap", metricKey: "interest_income_related_party" },
  { kind: "value", variant: "line", label: "Annen renteinntekt", metricKey: "other_interest_income" },
  { kind: "value", variant: "line", label: "Annen finansinntekt", metricKey: "other_financial_income" },
  { kind: "value", variant: "line", label: "Sum finansinntekter", metricKey: "financial_income" },
  { kind: "value", variant: "line", label: "Rentekostnad til tilknyttet selskap", metricKey: "interest_cost_related_party" },
  { kind: "value", variant: "line", label: "Annen rentekostnad", metricKey: "other_interest_cost" },
  { kind: "value", variant: "line", label: "Annen finanskostnad", metricKey: "other_financial_cost" },
  { kind: "value", variant: "line", label: "Sum finanskostnader", metricKey: "financial_costs" },
  { kind: "value", variant: "subtotal", label: "Netto finansposter", metricKey: "net_finance" },
  { kind: "value", variant: "result", label: "Ordinært resultat før skattekostnad", metricKey: "profit_before_tax" },
  { kind: "value", variant: "line", label: "Skattekostnad på ordinært resultat", metricKey: "tax_expense" },
  { kind: "value", variant: "total", label: "Årsresultat", metricKey: "net_income" },
];

const reportedBalanceSpec: ReportedSpecRow[] = [
  { kind: "header", label: "Eiendeler" },
  { kind: "group", label: "Anleggsmidler" },
  { kind: "subgroup", label: "Immaterielle eiendeler" },
  { kind: "value", variant: "line", label: "Sum immaterielle eiendeler", metricKey: "intangible_assets" },
  { kind: "subgroup", label: "Varige driftsmidler" },
  { kind: "value", variant: "line", label: "Sum varige driftsmidler", metricKey: "tangible_assets" },
  { kind: "subgroup", label: "Finansielle anleggsmidler" },
  { kind: "value", variant: "line", label: "Sum finansielle anleggsmidler", metricKey: "financial_fixed_assets" },
  { kind: "value", variant: "subtotal", label: "Sum anleggsmidler", metricKey: "total_fixed_assets" },
  { kind: "group", label: "Omløpsmidler" },
  { kind: "value", variant: "line", label: "Varer", metricKey: "inventory" },
  { kind: "subgroup", label: "Fordringer" },
  { kind: "value", variant: "line", label: "Kundefordringer", metricKey: "accounts_receivable" },
  { kind: "value", variant: "line", label: "Andre fordringer", metricKey: "other_short_term_receivables" },
  { kind: "value", variant: "line", label: "Konsernfordringer", metricKey: "intercompany_receivables" },
  { kind: "value", variant: "line", label: "Sum fordringer", metricKey: "total_receivables" },
  { kind: "value", variant: "line", label: "Bankinnskudd, kontanter og lignende", metricKey: "cash_and_equivalents" },
  { kind: "value", variant: "subtotal", label: "Sum omløpsmidler", metricKey: "total_current_assets" },
  { kind: "value", variant: "total", label: "Sum eiendeler", metricKey: "total_assets" },
  { kind: "header", label: "Egenkapital og gjeld", spaceTop: true },
  { kind: "group", label: "Egenkapital" },
  { kind: "value", variant: "line", label: "Innskutt egenkapital", metricKey: "paid_in_equity" },
  { kind: "value", variant: "line", label: "Opptjent egenkapital", metricKey: "retained_earnings" },
  { kind: "value", variant: "subtotal", label: "Sum egenkapital", metricKey: "total_equity" },
  { kind: "group", label: "Gjeld" },
  { kind: "subgroup", label: "Langsiktig gjeld" },
  { kind: "value", variant: "line", label: "Langsiktig gjeld", metricKey: "long_term_debt" },
  { kind: "value", variant: "line", label: "Avsetning for forpliktelser", metricKey: "provisions" },
  { kind: "value", variant: "line", label: "Sum langsiktig gjeld", metricKey: "total_long_term_debt" },
  { kind: "subgroup", label: "Kortsiktig gjeld" },
  { kind: "value", variant: "line", label: "Leverandørgjeld", metricKey: "supplier_debt" },
  { kind: "value", variant: "line", label: "Betalbar skatt", metricKey: "tax_payable" },
  { kind: "value", variant: "line", label: "Skyldige offentlige avgifter", metricKey: "public_charges" },
  { kind: "value", variant: "line", label: "Utbytte", metricKey: "dividend_liability" },
  { kind: "value", variant: "line", label: "Annen kortsiktig gjeld", metricKey: "other_short_term_debt" },
  { kind: "value", variant: "line", label: "Sum kortsiktig gjeld", metricKey: "total_short_term_debt" },
  { kind: "value", variant: "total", label: "Sum egenkapital og gjeld", metricKey: "total_equity_and_liabilities" },
];

const STRUCTURAL_RANK: Record<string, number> = { header: 3, group: 2, subgroup: 1, value: 0 };

const CASH_FLOW_TOTAL_KEYS = new Set([
  "net_cash_from_operating_activities",
  "net_cash_from_investing_activities",
  "net_cash_from_financing_activities",
  "net_change_in_cash",
  "closing_cash_and_cash_equivalents",
]);

const CASH_FLOW_GROUP_BREAK_AFTER_KEYS = new Set([
  "net_cash_from_operating_activities",
  "net_cash_from_investing_activities",
  "net_cash_from_financing_activities",
  "net_change_in_cash",
]);

type IncomeRowKind = "income-section-subtotal" | "income-key-subtotal" | "income-result" | null;
type BalanceRowKind = "balance-section-subtotal" | "balance-key-subtotal" | "balance-result" | null;

const INCOME_SECTION_SUBTOTAL_KEYS = new Set([
  "total_operating_income",
  "total_operating_expenses",
  "net_financial_items",
]);

const INCOME_KEY_SUBTOTAL_KEYS = new Set([
  "operating_profit",
  "profit_before_tax",
]);

const BALANCE_SECTION_SUBTOTAL_KEYS = new Set([
  "total_non_current_assets",
  "total_current_assets",
  "long_term_liabilities",
  "current_liabilities",
]);

const BALANCE_KEY_SUBTOTAL_KEYS = new Set([
  "total_equity",
  "total_liabilities",
]);

const BALANCE_RESULT_KEYS = new Set([
  "total_assets",
  "total_equity_and_liabilities",
]);

function getIncomeRowKind(metricKey: string | null, label: string): IncomeRowKind {
  const normalizedKey = metricKey?.toLocaleLowerCase("en") ?? "";
  const normalizedLabel = label.toLocaleLowerCase("nb-NO").replace(/\s+/g, " ").trim();

  if (
    normalizedKey === "net_income" ||
    normalizedLabel === "årsresultat" ||
    normalizedLabel === "arsresultat" ||
    normalizedLabel.includes("profit (loss) for the year")
  ) return "income-result";

  if (
    INCOME_KEY_SUBTOTAL_KEYS.has(normalizedKey) ||
    normalizedKey.includes("ebitda") ||
    normalizedKey.includes("gross_profit") ||
    normalizedLabel === "driftsresultat" ||
    normalizedLabel.includes("operating result") ||
    normalizedLabel.includes("profit before tax") ||
    normalizedLabel.includes("profit (loss) before tax") ||
    normalizedLabel.includes("resultat før skatt") ||
    normalizedLabel.includes("resultat for skattekostnad") ||
    normalizedLabel === "ebit" ||
    normalizedLabel.includes("ebitda") ||
    normalizedLabel.includes("gross profit") ||
    normalizedLabel.includes("bruttofortjeneste")
  ) return "income-key-subtotal";

  if (
    INCOME_SECTION_SUBTOTAL_KEYS.has(normalizedKey) ||
    normalizedLabel.startsWith("sum ") ||
    normalizedLabel.includes(", in total") ||
    normalizedLabel.includes("finance items - net") ||
    normalizedLabel.includes("net financial items") ||
    normalizedLabel.includes("netto finans")
  ) return "income-section-subtotal";

  return null;
}

function getBalanceRowKind(metricKey: string | null, label: string): BalanceRowKind {
  const normalizedKey = metricKey?.toLocaleLowerCase("en") ?? "";
  const normalizedLabel = label.toLocaleLowerCase("nb-NO").replace(/\s+/g, " ").trim();

  if (
    BALANCE_RESULT_KEYS.has(normalizedKey) ||
    normalizedLabel === "total assets" ||
    normalizedLabel === "sum eiendeler" ||
    normalizedLabel.includes("total equity and liabilities") ||
    normalizedLabel.includes("total equity and liability") ||
    normalizedLabel.includes("sum egenkapital og gjeld")
  ) return "balance-result";

  if (
    BALANCE_KEY_SUBTOTAL_KEYS.has(normalizedKey) ||
    normalizedLabel === "total equity" ||
    normalizedLabel === "equity, in total" ||
    normalizedLabel === "sum egenkapital" ||
    normalizedLabel === "total liabilities" ||
    normalizedLabel === "liabilities, in total" ||
    normalizedLabel === "sum gjeld"
  ) return "balance-key-subtotal";

  if (
    BALANCE_SECTION_SUBTOTAL_KEYS.has(normalizedKey) ||
    normalizedLabel.includes("non-current assets, in total") ||
    normalizedLabel.includes("current assets, in total") ||
    normalizedLabel.includes("non-current liabilities, in total") ||
    normalizedLabel.includes("current liabilities, in total") ||
    normalizedLabel === "total non-current assets" ||
    normalizedLabel === "total current assets" ||
    normalizedLabel === "total non-current liabilities" ||
    normalizedLabel === "total current liabilities" ||
    normalizedLabel === "sum anleggsmidler" ||
    normalizedLabel === "sum omløpsmidler" ||
    normalizedLabel === "sum langsiktig gjeld" ||
    normalizedLabel === "sum kortsiktig gjeld" ||
    normalizedKey.startsWith("total_") ||
    normalizedLabel.startsWith("sum ") ||
    normalizedLabel.includes(", in total") ||
    normalizedLabel.startsWith("total ")
  ) return "balance-section-subtotal";

  return null;
}

export function FinancialTimeSeriesTable({
  statements,
  documents,
  lineItems = [],
  discussionRoomId,
  discussionRoomName,
  discussionStatements,
  discussionThreads = [],
  availability,
}: {
  statements: NormalizedFinancialStatement[];
  documents: NormalizedFinancialDocument[];
  lineItems?: NormalizedFinancialLineItem[];
  companySlug: string;
  discussionRoomId?: string | null;
  discussionRoomName?: string | null;
  discussionStatements?: CompanyFinancialStatementDiscussionSummary[];
  discussionThreads?: CompanyFinancialMetricDiscussionSummary[];
  availability?: DataAvailability;
}) {
  // A group company publishes two statement sets — konsern and selskap.
  // Determine which are available and let the user toggle; default to konsern.
  const availableScopes = useMemo(() => {
    const scopes = new Set<"COMPANY" | "CONSOLIDATED">();
    for (const statement of statements) {
      scopes.add(statement.statementScope ?? "COMPANY");
    }
    for (const lineItem of lineItems) {
      scopes.add(lineItem.statementScope);
    }
    return scopes;
  }, [lineItems, statements]);
  // Scope/basis/view/density are fixed to the 5C mock defaults — the extra
  // toggles were removed to match the design. Konsern is preferred when both
  // statement scopes are available.
  const activeScope: "COMPANY" | "CONSOLIDATED" = availableScopes.has("CONSOLIDATED")
    ? "CONSOLIDATED"
    : "COMPANY";
  const scopedStatements = useMemo(
    () =>
      availableScopes.size > 1
        ? statements.filter((statement) => (statement.statementScope ?? "COMPANY") === activeScope)
        : statements,
    [statements, availableScopes, activeScope],
  );
  const scopedLineItems = useMemo(
    () => lineItems.filter((item) => item.statementScope === activeScope),
    [activeScope, lineItems],
  );
  const dataset = useMemo(
    () => buildFinancialReportDataset(scopedStatements, documents),
    [documents, scopedStatements],
  );

  // Default is always "Som rapportert" when the as-reported statements exist;
  // a subtle toggle lets the user switch to the standardized view. View and
  // density stay fixed to the 5C mock defaults.
  const [basis, setBasis] = useState<"standardized" | "reported">(
    scopedLineItems.length > 0 ? "reported" : "standardized",
  );
  const mode: FinancialValueMode = "amount";
  const densityMode: FinancialDensityMode = "all";
  const [unit, setUnit] = useState<FinancialUnit>("MNOK");
  const [offset, setOffset] = useState(0); // years shifted back from the latest-anchored window

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
  const standardizedYears = useMemo(
    () =>
      dataset.years.filter((year) =>
        financialReportRows.some((row) => dataset.valuesByYear[year]?.[row.key] != null),
      ),
    [dataset],
  );
  const reportedYears = useMemo(
    () => [...new Set(scopedLineItems.map((item) => item.fiscalYear))].sort((a, b) => a - b),
    [scopedLineItems],
  );
  const years = basis === "reported" && reportedYears.length > 0 ? reportedYears : standardizedYears;
  const latestYear = years.length > 0 ? years[years.length - 1] : undefined;
  const previousYear = years.length > 1 ? years[years.length - 2] : undefined;

  if (years.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[rgba(15,23,42,0.14)] bg-[rgba(248,249,250,0.62)] p-6 text-sm leading-7 text-slate-600">
        {availability?.message ??
          "Regnskapstall er ikke tilgjengelige for denne virksomheten ennå."}
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
  const activeYears = years;
  const windowSize = Math.min(YEAR_WINDOW, activeYears.length);
  const maxOffset = Math.max(0, activeYears.length - windowSize);
  const off = Math.min(maxOffset, Math.max(0, offset));
  const end = activeYears.length - off;
  const start = end - windowSize;
  const visibleYears = activeYears.slice(start, end);
  const rangeLabel =
    visibleYears.length > 0 ? `${visibleYears[0]}–${visibleYears[visibleYears.length - 1]}` : "";


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

  // ---- reported ("Som rapportert") NGAAP document -----------------------
  function hasDataForKey(key: string) {
    return years.some((year) => dataset.valuesByYear[year]?.[key] != null);
  }

  // Drop value rows with no data anywhere, then drop structural headings that
  // no longer have any value row beneath them (before the next same-or-higher
  // heading), so the document never shows an empty group.
  function buildReportedRows(statement: FinancialStatementType): ReportedSpecRow[] {
    const spec = statement === "income" ? reportedIncomeSpec : reportedBalanceSpec;
    const withData = spec.filter((row) => row.kind !== "value" || hasDataForKey(row.metricKey));
    const result: ReportedSpecRow[] = [];
    for (let i = 0; i < withData.length; i += 1) {
      const row = withData[i];
      if (row.kind === "value") {
        result.push(row);
        continue;
      }
      let hasChild = false;
      for (let j = i + 1; j < withData.length; j += 1) {
        const next = withData[j];
        if (next.kind === "value") {
          hasChild = true;
          break;
        }
        if (STRUCTURAL_RANK[next.kind] >= STRUCTURAL_RANK[row.kind]) break;
      }
      if (hasChild) result.push(row);
    }
    return result;
  }

  function renderReportedSection(statement: FinancialStatementType) {
    const rows = buildReportedRows(statement);
    if (!rows.some((row) => row.kind === "value")) return null;
    const colCount = 2 + visibleYears.length;

    return (
      <section key={statement} className="mt-12 first:mt-2">
        <h3 className="editorial-display text-[30px] tracking-[-0.02em] text-[var(--px-text)]">
          {statementTitles[statement]}
        </h3>
        <div className="mt-3.5 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr className="border-b-2 border-[var(--px-text)]">
                <th className="data-label px-2 py-2.5 text-left text-[10px] font-semibold uppercase text-[var(--px-muted)]">
                  Beløp i {unitLabel}
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
              {rows.map((row, index) => renderReportedRow(row, index, colCount))}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  function renderReportedRow(row: ReportedSpecRow, index: number, colCount: number) {
    if (row.kind === "header") {
      return (
        <tr key={index}>
          <td
            colSpan={colCount}
            className="border-b border-[var(--px-text)] pb-2"
            style={{ paddingTop: row.spaceTop ? 34 : 22, borderBottomWidth: 1.5 }}
          >
            <span className="data-label text-[13px] font-bold uppercase tracking-[0.12em] text-[var(--px-text)]">
              {row.label}
            </span>
          </td>
        </tr>
      );
    }
    if (row.kind === "group") {
      return (
        <tr key={index}>
          <td colSpan={colCount} className="px-2 pb-1 pt-[18px] text-[14px] font-bold text-[var(--px-text)]">
            {row.label}
          </td>
        </tr>
      );
    }
    if (row.kind === "subgroup") {
      return (
        <tr key={index}>
          <td colSpan={colCount} className="px-2 pb-0.5 pl-5 pt-2.5 text-[13px] italic text-[var(--px-muted)]">
            {row.label}
          </td>
        </tr>
      );
    }

    const isTotal = row.variant === "total";
    const isSub = row.variant === "subtotal";
    const isResult = row.variant === "result";
    const strong = isTotal || isSub || isResult;
    const borderTop = isTotal
      ? "3px double var(--px-text)"
      : isSub || isResult
        ? "1px solid var(--px-text)"
        : "none";

    return (
      <tr key={index} style={{ borderTop, background: isResult ? "var(--px-accent-soft)" : "transparent" }}>
        <td
          className={cn(
            "text-left align-middle text-[var(--px-text)]",
            isTotal ? "py-3.5 text-[15px]" : "py-2.5 text-sm",
            strong ? "font-semibold" : "font-normal",
          )}
          style={{ paddingLeft: strong ? 8 : 28, paddingRight: 8 }}
        >
          {row.label}
        </td>
        <td className="px-2 py-2 text-center font-mono text-[11px] text-[var(--px-muted)]">{row.note ?? ""}</td>
        {visibleYears.map((year) => (
          <td
            key={year}
            className={cn(
              "tabular-nums px-2 text-right align-middle font-mono",
              isTotal ? "py-3.5 text-[14.5px]" : "py-2.5 text-[13px]",
              strong ? "font-semibold" : "font-normal",
              year === latestYear ? "text-[var(--px-text)]" : "text-[var(--px-muted)]",
            )}
          >
            {formatUnitAmount(dataset.valuesByYear[year]?.[row.metricKey] ?? null, unit, { report: true })}
          </td>
        ))}
      </tr>
    );
  }

  function buildAsReportedRows(statementType: NormalizedFinancialLineItem["statementType"]) {
    const normalizeLabel = (label: string) =>
      label.toLocaleLowerCase("nb-NO").replace(/\s+/g, " ").trim();
    const isPrimaryIncomeLine = (item: NormalizedFinancialLineItem) => {
      if (statementType !== "INCOME_STATEMENT") return true;
      const key = item.metricKey?.toLocaleLowerCase("en") ?? "";
      const label = normalizeLabel(item.label);
      return !(
        key === "translation_differences" ||
        key.includes("comprehensive_income") ||
        key.includes("earnings_loss_per_share") ||
        key.includes("diluted_result_loss_per_share") ||
        label.includes("total comprehensive income") ||
        label === "totalresultat" ||
        label.includes("translation differences") ||
        label.includes("cash flow hedges") ||
        label.includes("earnings (loss) per share") ||
        label.includes("profit (loss) per share") ||
        label.includes("diluted result (loss) per share") ||
        label.includes("diluted profit (loss) per share") ||
        label === "owners of the company"
      );
    };
    const selectPrimaryPageCluster = (items: NormalizedFinancialLineItem[]) => {
      const itemsByPage = new Map<number, NormalizedFinancialLineItem[]>();
      for (const item of items) {
        if (item.sourcePage === null) continue;
        const pageItems = itemsByPage.get(item.sourcePage) ?? [];
        pageItems.push(item);
        itemsByPage.set(item.sourcePage, pageItems);
      }
      const pages = [...itemsByPage.keys()].sort((left, right) => left - right);
      if (pages.length <= 1) return items;

      const clusters: number[][] = [];
      for (const page of pages) {
        const current = clusters.at(-1);
        if (current && page === current[current.length - 1]! + 1) current.push(page);
        else clusters.push([page]);
      }
      const clusterScore = (cluster: number[]) => cluster.reduce((sum, page) => {
        const pageItems = itemsByPage.get(page) ?? [];
        return sum + pageItems.length + pageItems.filter((item) => item.value !== null).length;
      }, 0);
      const primaryCluster = clusters.sort(
        (left, right) => clusterScore(right) - clusterScore(left),
      )[0];
      if (!primaryCluster) return items;
      const allowedPages = new Set(primaryCluster);
      return items.filter((item) => item.sourcePage === null || allowedPages.has(item.sourcePage));
    };

    const itemsByYear = new Map<number, NormalizedFinancialLineItem[]>();
    for (const item of scopedLineItems.filter((candidate) => candidate.statementType === statementType)) {
      const yearItems = itemsByYear.get(item.fiscalYear) ?? [];
      yearItems.push(item);
      itemsByYear.set(item.fiscalYear, yearItems);
    }
    const relevant = [...itemsByYear.values()]
      .flatMap(selectPrimaryPageCluster)
      .sort((left, right) => left.fiscalYear - right.fiscalYear || left.sortOrder - right.sortOrder);
    const referenceYear = relevant.reduce(
      (latest, item) => Math.max(latest, item.fiscalYear),
      Number.NEGATIVE_INFINITY,
    );
    if (!Number.isFinite(referenceYear)) return [];
    const referenceItems = relevant
      .filter((item) => item.fiscalYear === referenceYear && item.value !== null)
      .filter(isPrimaryIncomeLine)
      .sort((left, right) => left.sortOrder - right.sortOrder);
    const occurrenceByMatchKey = new Map<string, number>();

    return referenceItems.map((referenceItem) => {
      const labelKey = normalizeLabel(referenceItem.label);
      const matchKey = referenceItem.metricKey ? `metric:${referenceItem.metricKey}` : `label:${labelKey}`;
      const occurrence = occurrenceByMatchKey.get(matchKey) ?? 0;
      occurrenceByMatchKey.set(matchKey, occurrence + 1);
      const valuesByYear = new Map<number, NormalizedFinancialLineItem>();

      for (const year of activeYears) {
        const yearItems = relevant.filter((item) => item.fiscalYear === year);
        const candidates = referenceItem.metricKey
          ? yearItems.filter((item) => item.metricKey === referenceItem.metricKey)
          : yearItems.filter((item) => normalizeLabel(item.label) === labelKey);
        const match = candidates.sort((left, right) => left.sortOrder - right.sortOrder)[occurrence];
        if (match) valuesByYear.set(year, match);
      }

      return {
        key: referenceItem.id,
        label: referenceItem.label,
        metricKey: referenceItem.metricKey,
        latestYear: referenceYear,
        latestSortOrder: referenceItem.sortOrder,
        valuesByYear,
      };
    });
  }

  function renderAsReportedSection(statementType: NormalizedFinancialLineItem["statementType"]) {
    const rows = buildAsReportedRows(statementType);
    if (rows.length === 0) return null;
    const title = {
      INCOME_STATEMENT: "Resultatregnskap",
      BALANCE_SHEET: "Balanse",
      CASH_FLOW: "Kontantstrømoppstilling",
    }[statementType];

    return (
      <section key={statementType} className="mt-12 first:mt-2">
        <h3 className="editorial-display text-[30px] tracking-[-0.02em] text-[var(--px-text)]">
          {title}
        </h3>
        <div className="mt-3.5 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr className="border-b-2 border-[var(--px-text)]">
                <th className="data-label px-2 py-2.5 text-left text-[10px] font-semibold uppercase text-[var(--px-muted)]">
                  Beløp i {unitLabel}
                </th>
                <th className="data-label w-12 px-2 py-2.5 text-center text-[10px] font-semibold uppercase text-[var(--px-muted)]">
                  Side
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
              {rows.map((row, rowIndex) => {
                const latestVisibleItem = [...visibleYears]
                  .reverse()
                  .map((year) => row.valuesByYear.get(year))
                  .find(Boolean);
                const isCashFlowTotal =
                  statementType === "CASH_FLOW" &&
                  row.metricKey !== null &&
                  CASH_FLOW_TOTAL_KEYS.has(row.metricKey);
                const incomeRowKind =
                  statementType === "INCOME_STATEMENT"
                    ? getIncomeRowKind(row.metricKey, row.label)
                    : null;
                const balanceRowKind =
                  statementType === "BALANCE_SHEET"
                    ? getBalanceRowKind(row.metricKey, row.label)
                    : null;
                const financialRowKind = incomeRowKind ?? balanceRowKind;
                const financialRowRank =
                  incomeRowKind === "income-result" || balanceRowKind === "balance-result"
                  ? 3
                  : incomeRowKind === "income-key-subtotal" || balanceRowKind === "balance-key-subtotal"
                    ? 2
                    : incomeRowKind === "income-section-subtotal" || balanceRowKind === "balance-section-subtotal"
                      ? 1
                      : undefined;
                const isTotal =
                  row.label.toLocaleLowerCase("nb-NO").includes("total") ||
                  row.metricKey?.startsWith("total_") === true ||
                  isCashFlowTotal ||
                  financialRowKind !== null;
                const isSectionSubtotal =
                  incomeRowKind === "income-section-subtotal" ||
                  balanceRowKind === "balance-section-subtotal";
                const isKeySubtotal =
                  incomeRowKind === "income-key-subtotal" ||
                  balanceRowKind === "balance-key-subtotal";
                const isStatementResult =
                  incomeRowKind === "income-result" ||
                  balanceRowKind === "balance-result";
                const previousMetricKey = rows[rowIndex - 1]?.metricKey;
                const previousIncomeRowKind = statementType === "INCOME_STATEMENT" && rows[rowIndex - 1]
                  ? getIncomeRowKind(rows[rowIndex - 1]!.metricKey, rows[rowIndex - 1]!.label)
                  : null;
                const previousBalanceRowKind = statementType === "BALANCE_SHEET" && rows[rowIndex - 1]
                  ? getBalanceRowKind(rows[rowIndex - 1]!.metricKey, rows[rowIndex - 1]!.label)
                  : null;
                const startsIncomeGroup =
                  previousIncomeRowKind === "income-section-subtotal" ||
                  previousIncomeRowKind === "income-key-subtotal";
                const startsBalanceGroup = previousBalanceRowKind !== null;
                const startsCashFlowGroup =
                  statementType === "CASH_FLOW" &&
                  previousMetricKey !== null &&
                  previousMetricKey !== undefined &&
                  CASH_FLOW_GROUP_BREAK_AFTER_KEYS.has(previousMetricKey);
                const isClosingCash =
                  statementType === "CASH_FLOW" &&
                  row.metricKey === "closing_cash_and_cash_equivalents";
                return (
                  <React.Fragment key={row.key}>
                    {startsIncomeGroup ? (
                      <tr aria-hidden="true" data-income-group-break="true">
                        <td className="h-4 p-0" colSpan={visibleYears.length + 2} />
                      </tr>
                    ) : startsBalanceGroup ? (
                      <tr aria-hidden="true" data-balance-group-break="true">
                        <td className="h-4 p-0" colSpan={visibleYears.length + 2} />
                      </tr>
                    ) : startsCashFlowGroup ? (
                      <tr aria-hidden="true" data-cash-flow-group-break="true">
                        <td className="h-4 p-0" colSpan={visibleYears.length + 2} />
                      </tr>
                    ) : null}
                    <tr
                      data-financial-metric-key={row.metricKey ?? undefined}
                      data-financial-row-kind={isCashFlowTotal ? "cash-flow-total" : financialRowKind ?? undefined}
                      data-financial-row-rank={financialRowRank}
                      className={cn(
                        isTotal && financialRowKind === null
                          ? "border-t border-[var(--px-text)] font-semibold"
                          : "",
                        isSectionSubtotal
                          ? "font-semibold"
                          : "",
                        isKeySubtotal
                          ? "border-t-2 border-[var(--px-text)] font-semibold"
                          : "",
                        isStatementResult
                          ? "border-t-2 border-[var(--px-text)] bg-[var(--px-accent-soft)] font-bold"
                          : "",
                        row.metricKey === "net_change_in_cash"
                          ? "bg-[var(--px-accent-soft)]"
                          : "",
                        isClosingCash ? "border-b-4 border-double border-[var(--px-text)]" : "",
                      )}
                    >
                      <td className="px-2 py-2.5 text-sm text-[var(--px-text)]">{row.label}</td>
                      <td className="px-2 py-2 text-center font-mono text-[11px] text-[var(--px-muted)]">
                        {latestVisibleItem?.sourcePage ?? ""}
                      </td>
                      {visibleYears.map((year) => (
                        <td
                          key={year}
                          className={cn(
                            "tabular-nums px-2 py-2.5 text-right font-mono text-[13px]",
                            year === latestYear ? "text-[var(--px-text)]" : "text-[var(--px-muted)]",
                          )}
                        >
                          {formatUnitAmount(row.valuesByYear.get(year)?.value ?? null, unit, { report: true })}
                        </td>
                      ))}
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      {/* heading — floats above the document card */}
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 px-1">
        <div className="min-w-0">
          <div className="data-label text-[11px] uppercase text-[var(--px-muted)]">
            Årsregnskap · {availableScopes.has("CONSOLIDATED") ? "Konsern" : "Selskap"} ·{" "}
            {basis === "reported" ? "Som rapportert" : "Standardisert"}
          </div>
          <h2 className="editorial-display mt-1.5 text-[32px] tracking-[-0.03em] text-[var(--px-text)]">
            Regnskap over tid
          </h2>
        </div>

        <div className="flex items-center gap-3">
          {scopedLineItems.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                setBasis(basis === "reported" ? "standardized" : "reported");
                setOffset(0);
              }}
              className="cursor-pointer rounded-full border-0 bg-transparent px-2.5 py-1.5 text-[12.5px] font-medium text-[var(--px-muted)] transition-colors hover:text-[var(--px-text)]"
            >
              {basis === "reported" ? "Vis standardisert" : "Vis som rapportert"}
            </button>
          ) : null}
          <SegmentedControl value={unit} onChange={setUnit} options={unitOptions} />
          {activeYears.length > windowSize ? (
            <div className="flex items-center gap-2.5">
              <PagerButton
                direction="back"
                disabled={off >= maxOffset}
                onClick={() => setOffset((o) => Math.min(maxOffset, o + 1))}
              />
              <span className="data-label tabular-nums text-[11px] text-[var(--px-text)]">{rangeLabel}</span>
              <PagerButton
                direction="forward"
                disabled={off <= 0}
                onClick={() => setOffset((o) => Math.max(0, o - 1))}
              />
            </div>
          ) : null}
        </div>
      </header>

      {/* KPI summary */}
      <div className="px-1">
        <div className="flex flex-wrap border-y border-[var(--px-border)]">
          {kpis.map((item, i) => {
            const negative = item.delta.charAt(0) === MINUS;
            const neutral = item.delta === "—";
            return (
              <div
                key={item.label}
                className={cn(
                  "flex-1 py-4",
                  i === 0 ? "pl-1 pr-5" : "border-l border-[var(--px-border-subtle)] px-5",
                )}
                style={{ minWidth: 150 }}
              >
                <div className="data-label text-[9px] uppercase tracking-[0.1em] text-[var(--px-muted)]">
                  {item.label}
                </div>
                <div className="tabular-nums mt-1.5 whitespace-nowrap text-[22px] font-semibold tracking-[-0.02em] text-[var(--px-text)]">
                  {item.value}
                </div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span
                    className="tabular-nums text-[11px] font-medium"
                    style={{
                      color: neutral
                        ? "var(--px-muted)"
                        : negative
                          ? "var(--px-error)"
                          : "var(--px-success)",
                    }}
                  >
                    {item.delta}
                  </span>
                  {previousYear && !neutral ? (
                    <span className="text-[11px] text-[var(--px-muted)]">vs {previousYear}</span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* statements — flat, flowing (5C) */}
      <div className="px-1">
        <div className="pt-2">
          <div>
            <div className="mb-1.5">
              <div className="data-label text-[10.5px] uppercase text-[var(--px-muted)]">
                {availableScopes.has("CONSOLIDATED") && activeScope === "CONSOLIDATED" ? "Konsern · " : ""}
                Tall i {unitLabel}
              </div>
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
              <>
                {renderAsReportedSection("INCOME_STATEMENT")}
                {renderAsReportedSection("BALANCE_SHEET")}
                {renderAsReportedSection("CASH_FLOW")}
                <p className="mt-6 border-t border-[var(--px-border-subtle)] pt-3.5 text-[12px] leading-6 text-[var(--px-muted)]">
                  Linjenavn og rekkefølge følger den nyeste publiserte hovedoppstillingen. Historiske år
                  kobles til de samme regnskapspostene. «Side» viser kildesiden i den aktuelle årsrapporten.
                  Tall i parentes er negative; blanke felt betyr at posten ikke finnes eller ikke har en
                  publisert verdi for året.
                </p>
              </>
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
