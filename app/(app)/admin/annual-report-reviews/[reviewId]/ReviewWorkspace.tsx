"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AnnualReportRefreshButton } from "@/app/(app)/admin/AnnualReportRefreshButton";

type Fact = {
  id: string;
  metricKey: string;
  fiscalYear: number;
  value: bigint | null;
  unitScale: number;
  sourcePage: number | null;
  confidenceScore: number | null;
  rawLabel: string | null;
  normalizedLabel: string | null;
  sourceSection: string | null;
  sourceRowText: string | null;
  isDerived: boolean;
  statementType: string;
  statementScope?: "COMPANY" | "CONSOLIDATED";
};

/** One extracted table row from the EXTRACTION_JSON artifact (before canonical mapping). */
type RawRow = {
  pageNumber: number;
  sectionType: string;
  label: string;
  normalizedLabel: string;
  rowText: string;
  unitScale: number;
  confidence: number;
  values: Array<{ value: number; columnIndex: number }>;
};

/** One canonical-mapped fact from EXTRACTION_JSON (richer than DB facts). */
type MappedFactRaw = {
  metricKey: string;
  fiscalYear: number;
  rawLabel: string;
  normalizedLabel: string;
  value: number;
  unitScale: number;
  sourcePage: number;
  sourceSection: string;
  confidenceScore: number;
  isDerived: boolean;
  statementScope?: "COMPANY" | "CONSOLIDATED";
  precedence?: string;
  rawPayload?: { columnIndex?: number; yearOrder?: number[] };
};

type ExtractionData = {
  engine: string | null;
  mode: string | null;
  rows: RawRow[];
  mappedFacts: MappedFactRaw[];
};

type ReviewedFact = {
  id: string;
  metricKey: string;
  fiscalYear: number;
  value: bigint | null;
  unitScale: number;
  sourcePage: number | null;
  rawLabel: string | null;
  statementType: string;
  correctionSource: string;
};

type ValidationIssue = {
  id: string;
  severity: string;
  ruleCode: string;
  message: string;
};

type Artifact = {
  id: string;
  artifactType: string;
  storageKey: string;
  mimeType: string;
  metadata: unknown;
};

type Decision = {
  id: string;
  decisionType: string;
  correctionNotes: string | null;
  createdAt: Date;
  reviewer: { id: string; name: string | null; email: string | null };
};

type ReviewDetail = {
  id: string;
  status: string;
  fiscalYear: number;
  qualityScore: number | null;
  sourcePrecedenceAttempted: string | null;
  blockingRuleCodes: string[];
  blockingIssueCount: number;
  latestActionNote: string | null;
  reviewPayload: unknown;
  company: { orgNumber: string; name: string; slug: string };
  filing: {
    id: string;
    status: string;
    sourceUrl: string | null;
    lastError: string | null;
    publishedSnapshotAt: string | Date | null;
    artifacts: Artifact[];
    validationIssues: ValidationIssue[];
  };
  extractionRun: {
    id: string;
    status: string;
    confidenceScore: number | null;
    validationScore: number | null;
    documentEngine: string | null;
    documentEngineMode: string | null;
    parserVersion: string;
    rawSummary: unknown;
    facts: Fact[];
    validationIssues: ValidationIssue[];
  } | null;
  decisions: Decision[];
  reviewedFacts?: ReviewedFact[];
};

type EditableFact = {
  /** Stable client-side id. Needed because metricKey is now editable and
   *  may be blank or duplicated while the reviewer is typing. */
  id: string;
  metricKey: string;
  fiscalYear: number;
  value: string;
  rawLabel: string;
  sourcePage: string;
  unitScale: string;
  /** Which statement table this row belongs to (drives section grouping). */
  statementType: "INCOME_STATEMENT" | "BALANCE_SHEET" | "OTHER";
  /** Soft-delete flag. Deleted rows are hidden from the section tables and
   *  listed in a "deleted" tray with an undo button; on save they are sent
   *  as deletedMetricKeys so the machine-extracted fact is dropped. */
  deleted: boolean;
  /** True when the reviewer added the row or typed a non-canonical key —
   *  these rows always emit a correction even if they have no DB match. */
  isCustom: boolean;
};

function newEditableFactId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `ef_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/**
 * A lone dash ("-", "–", "—") or underscore typed in an amount field is the
 * accounting convention for nil → interpret it as "0". A real negative number
 * ("-12345") is left untouched (the pattern matches only a single dash char).
 * An empty string stays empty (means "no override").
 */
function normalizeAmountInput(raw: string): string {
  const t = raw.trim();
  if (/^[-–—_]$/.test(t)) return "0";
  return t;
}

type RowEdit = {
  metricKey: string;
  mainValue: string;
  priorValue: string;
  sourceMetricKey?: string | null;
  /** Reviewer-edited label for an extracted row (overrides row.label). */
  labelOverride?: string;
  /** Konsern vs. selskap for this row, taken from the section the row is shown
   *  in. Without it, a konsern and a morselskap row sharing the same metricKey
   *  would collapse onto one fact on save (the "value reverts" bug). */
  statementScope?: "COMPANY" | "CONSOLIDATED";
  /** Soft-delete: row is hidden and dropped on save (model produced a
   *  spurious line). Restorable from the deleted-rows tray. */
  deleted?: boolean;
};

/** A row the reviewer added manually because the model missed it entirely. */
type AddedRow = {
  id: string;
  label: string;
  metricKey: string;
  mainValue: string;
  priorValue: string;
  /** Which statement the row belongs to — drives where it renders and the
   *  statementType used when saving. */
  statementType: "INCOME_STATEMENT" | "BALANCE_SHEET";
  /** Konsern vs. selskap. The reviewer picks this because an added row has no
   *  source page to infer scope from. */
  statementScope: "COMPANY" | "CONSOLIDATED";
  /** False while being composed in the "Manuelt lagt til"-tray; true once the
   *  reviewer clicks "Legg til", at which point it renders inside its target
   *  statement section, sorted by the key's canonical order. */
  committed: boolean;
  deleted: boolean;
};

type ValidationResult = {
  passed: boolean;
  hasBlockingErrors: boolean;
  validationScore: number;
  blockingIssues: Array<{ ruleCode: string; message: string; expectedValue?: string | null; actualValue?: string | null }>;
  warnings: Array<{ ruleCode: string; message: string; expectedValue?: string | null; actualValue?: string | null }>;
  issues: Array<{ ruleCode: string; message: string; severity: string }>;
  reviewedFactCount: number;
};

function bigintToDisplay(v: bigint | null): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

function formatIntegerString(value: string | bigint | number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const raw = typeof value === "bigint" ? value.toString() : String(value);
  const sign = raw.startsWith("-") ? "-" : "";
  const digits = sign ? raw.slice(1) : raw;
  if (!/^[0-9]+$/.test(digits)) return raw;
  // Thousands-separated with a space. Display cells should use
  // `whitespace-nowrap` so a long number never wraps across lines.
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function groupFacts(facts: Fact[]) {
  const income: Fact[] = [];
  const balance: Fact[] = [];
  const other: Fact[] = [];
  for (const f of facts) {
    if (f.statementType === "INCOME_STATEMENT") income.push(f);
    else if (f.statementType === "BALANCE_SHEET") balance.push(f);
    else other.push(f);
  }
  return { income, balance, other };
}

function groupReviewedFacts(facts: ReviewedFact[]) {
  const income: ReviewedFact[] = [];
  const balance: ReviewedFact[] = [];
  const other: ReviewedFact[] = [];
  for (const f of facts) {
    if (f.statementType === "INCOME_STATEMENT") income.push(f);
    else if (f.statementType === "BALANCE_SHEET") balance.push(f);
    else other.push(f);
  }
  return { income, balance, other };
}

const INCOME_METRIC_ORDER: string[] = [
  "revenue", "other_operating_income", "total_operating_income",
  "cost_of_goods_sold", "payroll_expense", "depreciation_amortization",
  "other_operating_expense", "total_operating_expenses", "operating_profit",
  "financial_income", "financial_expense", "net_financial_items",
  "profit_before_tax", "tax_expense", "net_income",
];
const BALANCE_METRIC_ORDER: string[] = [
  "intangible_assets", "tangible_assets", "financial_fixed_assets",
  "deferred_tax_asset", "inventory", "trade_receivables", "other_receivables",
  "cash_and_cash_equivalents", "current_assets", "total_assets",
  "share_capital", "share_premium", "retained_earnings", "total_equity",
  "long_term_debt_credit_institutions", "long_term_liabilities",
  "short_term_debt_credit_institutions", "trade_payables", "tax_payable",
  "public_duties_payable", "other_current_liabilities", "current_liabilities",
  "total_liabilities", "total_equity_and_liabilities",
];
const CANONICAL_ORDER_MAP = new Map<string, number>(
  [...INCOME_METRIC_ORDER, ...BALANCE_METRIC_ORDER].map((k, i) => [k, i]),
);

const METRIC_FRIENDLY_LABELS: Record<string, string> = {
  revenue: "Driftsinntekter",
  other_operating_income: "Andre driftsinntekter",
  total_operating_income: "Sum driftsinntekter",
  cost_of_goods_sold: "Varekostnad",
  payroll_expense: "Lønnskostnad",
  depreciation_amortization: "Avskrivninger",
  other_operating_expense: "Andre driftskostnader",
  total_operating_expenses: "Sum driftskostnader",
  operating_profit: "Driftsresultat",
  financial_income: "Finansinntekter",
  financial_expense: "Finanskostnader",
  net_financial_items: "Netto finansposter",
  profit_before_tax: "Resultat før skatt",
  tax_expense: "Skattekostnad",
  net_income: "Årsresultat",
  intangible_assets: "Immaterielle eiendeler",
  tangible_assets: "Varige driftsmidler",
  financial_fixed_assets: "Finansielle anleggsmidler",
  deferred_tax_asset: "Utsatt skattefordel",
  inventory: "Varelager",
  trade_receivables: "Kundefordringer",
  other_receivables: "Andre fordringer",
  cash_and_cash_equivalents: "Bankinnskudd og kontanter",
  current_assets: "Sum omløpsmidler",
  total_assets: "Sum eiendeler",
  share_capital: "Aksjekapital",
  share_premium: "Overkursfond",
  retained_earnings: "Opptjent egenkapital",
  total_equity: "Sum egenkapital",
  long_term_debt_credit_institutions: "Gjeld til kredittinstitusjoner (langsiktig)",
  long_term_liabilities: "Langsiktig gjeld",
  short_term_debt_credit_institutions: "Gjeld til kredittinstitusjoner (kortsiktig)",
  trade_payables: "Leverandørgjeld",
  tax_payable: "Skyldig skatt",
  public_duties_payable: "Offentlige avgifter",
  other_current_liabilities: "Annen kortsiktig gjeld",
  current_liabilities: "Sum kortsiktig gjeld",
  total_liabilities: "Sum gjeld",
  total_equity_and_liabilities: "Sum egenkapital og gjeld",
};

const SUM_KEYS = new Set([
  "total_operating_income", "total_operating_expenses", "operating_profit",
  "profit_before_tax", "net_income",
  "current_assets", "total_assets",
  "total_equity", "current_liabilities", "total_liabilities", "total_equity_and_liabilities",
]);

function getRowId(row: RawRow): string {
  const lookupKey = (row.normalizedLabel ?? row.label ?? "").toLowerCase().trim();
  // Two rows on the same page can share a label (e.g. two "immaterielle
  // eiendeler" lines). Include the values signature so each row gets a
  // distinct id — otherwise they'd collide in rowEdits (editing/deleting one
  // would hit both) and produce duplicate React keys.
  const valuesSig = row.values.map((v) => `${v.columnIndex}:${v.value}`).join(",");
  return `${row.pageNumber}_${lookupKey}_${valuesSig}`;
}

function removeRowEdit(
  edits: Record<string, RowEdit>,
  rowId: string,
): Record<string, RowEdit> {
  const next = { ...edits };
  delete next[rowId];
  return next;
}

// ---------------------------------------------------------------------------
// Metric-key universe (shared, session-scoped)
// ---------------------------------------------------------------------------
//
// Keys are split by statement category — income-statement keys never appear
// in a balance-sheet picker and vice versa. The universe starts from the
// canonical orders and grows as reviewers add new keys. Keys are NOT split by
// konsern/selskap: the same key universe applies to both scopes.

type MetricCategory = "INCOME" | "BALANCE" | "OTHER";
type CustomKeyState = { income: string[]; balance: string[] };

/** Full ordered key list for a category, canonical first then custom. */
function keysForCategory(category: MetricCategory, custom: CustomKeyState): string[] {
  if (category === "INCOME") return [...INCOME_METRIC_ORDER, ...custom.income];
  if (category === "BALANCE") return [...BALANCE_METRIC_ORDER, ...custom.balance];
  // OTHER (notes etc.) — offer everything.
  return [
    ...INCOME_METRIC_ORDER,
    ...custom.income,
    ...BALANCE_METRIC_ORDER,
    ...custom.balance,
  ];
}

/**
 * Searchable metric-key picker. Shows only the keys for its category,
 * filters as you type, and always renders a "Legg til nøkkel" action at the
 * bottom (regardless of the current search) that registers the typed text as
 * a new key in the category's global universe and selects it.
 */
function MetricKeyCombobox({
  value,
  category,
  customKeys,
  onAddKey,
  onChange,
  placeholder,
}: {
  value: string;
  category: MetricCategory;
  customKeys: CustomKeyState;
  onAddKey: (category: MetricCategory, key: string) => void;
  onChange: (key: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [rect, setRect] = useState<DOMRect | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const refreshRect = () => {
    if (inputRef.current) setRect(inputRef.current.getBoundingClientRect());
  };

  const openDropdown = () => {
    refreshRect();
    setOpen(true);
    setSearch("");
  };

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (inputRef.current?.contains(t)) return;
      if (dropdownRef.current?.contains(t)) return;
      setOpen(false);
    };
    // The dropdown is portaled to <body> with fixed positioning, so it must
    // track the input as the page scrolls/resizes.
    const onReflow = () => refreshRect();
    document.addEventListener("mousedown", onDocClick);
    window.addEventListener("scroll", onReflow, true);
    window.addEventListener("resize", onReflow);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      window.removeEventListener("scroll", onReflow, true);
      window.removeEventListener("resize", onReflow);
    };
  }, [open]);

  const options = keysForCategory(category, customKeys);
  const query = search.trim().toLowerCase();
  const filtered = query ? options.filter((k) => k.toLowerCase().includes(query)) : options;
  const isCustomValue = value !== "" && !CANONICAL_ORDER_MAP.has(value);
  const typed = search.trim();
  const addLabel = typed ? `Legg til nøkkel: "${typed}"` : "Legg til ny nøkkel…";

  const commit = (key: string) => {
    onChange(key);
    setOpen(false);
    setSearch("");
  };

  // Rendered into <body> so it is never clipped by an ancestor's
  // overflow-x-auto / overflow-y-auto (the table wrappers use that, which
  // previously hid the whole dropdown).
  const dropdown =
    open && rect
      ? createPortal(
          <div
            ref={dropdownRef}
            style={{
              position: "fixed",
              top: rect.bottom + 4,
              left: rect.left,
              width: Math.max(rect.width, 220),
              zIndex: 60,
            }}
            className="max-h-64 overflow-auto rounded-lg border border-[rgba(15,23,42,0.12)] bg-white py-1 shadow-lg"
          >
            {filtered.length === 0 && (
              <div className="px-3 py-1.5 text-xs text-slate-300">Ingen treff</div>
            )}
            {filtered.map((key) => {
              const isCustomKey = !CANONICAL_ORDER_MAP.has(key);
              return (
                <button
                  key={key}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => commit(key)}
                  className={
                    "flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left font-mono text-xs hover:bg-slate-50 " +
                    (key === value ? "bg-[var(--px-accent)]/5 font-semibold" : "")
                  }
                >
                  <span className={isCustomKey ? "text-violet-700" : "text-slate-700"}>{key}</span>
                  {isCustomKey && (
                    <span className="text-[9px] uppercase tracking-wide text-violet-300">egen</span>
                  )}
                </button>
              );
            })}
            {/* Always-present, always-active add action. Uses the typed text
                when present; otherwise prompts for the new key name. */}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                let key = typed;
                if (!key) {
                  const entered =
                    typeof window !== "undefined"
                      ? window.prompt("Navn på ny nøkkel (f.eks. annen_inntekt):")
                      : null;
                  key = (entered ?? "").trim();
                }
                if (!key) return;
                if (!CANONICAL_ORDER_MAP.has(key) && !options.includes(key)) {
                  onAddKey(category, key);
                }
                commit(key);
              }}
              className="mt-1 flex w-full items-center gap-1.5 border-t border-[rgba(15,23,42,0.06)] px-3 py-1.5 text-left text-xs text-violet-600 hover:bg-violet-50"
            >
              <span className="text-sm leading-none">＋</span>
              <span className="truncate font-mono">{addLabel}</span>
            </button>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="relative">
      <input
        ref={inputRef}
        value={open ? search : value}
        onFocus={openDropdown}
        onChange={(e) => {
          setSearch(e.target.value);
          if (!open) openDropdown();
        }}
        placeholder={placeholder ?? "nøkkel…"}
        className={
          "w-full min-w-[160px] rounded-xl border px-2 py-1 font-mono text-xs focus:outline-none " +
          (value === ""
            ? "border-amber-300 bg-amber-50 text-amber-900 focus:border-amber-400"
            : isCustomValue
              ? "border-violet-300 bg-violet-50 text-violet-800 focus:border-violet-400"
              : "border-[rgba(15,23,42,0.10)] bg-white text-[var(--px-accent)] focus:border-[var(--px-accent)]")
        }
      />
      {dropdown}
    </div>
  );
}

type FactCorrectionInput = {
  metricKey: string;
  fiscalYear: number;
  value: string | null;
  /** The on-screen "Endelig" (manual ?? machine) — the authoritative number
   *  that publishes. Sent for every visible line; equals value. */
  finalInput?: string | null;
  /** Provenance only: did the reviewer override the machine value or keep it. */
  correctionSource?: "MANUAL_CORRECTION" | "ACCEPTED_MACHINE";
  rawLabel: string | null;
  sourcePage: number | null;
  unitScale: number | null;
  sourceMetricKey?: string | null;
  /** Konsern vs. selskap. When omitted the backend falls back to the
   *  review's primary scope. Included in the dedup key so a konsern and a
   *  selskap value for the same metric+year don't overwrite each other. */
  statementScope?: "COMPANY" | "CONSOLIDATED";
  /** Statement bucket from the client (knows the section); avoids backend
   *  mis-bucketing of custom keys. */
  statementType?: "INCOME_STATEMENT" | "BALANCE_SHEET" | "CASH_FLOW" | "NOTE";
};

function upsertFactCorrection(
  factMap: Map<string, FactCorrectionInput>,
  fact: FactCorrectionInput,
) {
  // metricKey is NOT unique per line — two distinct rows can share a key
  // (e.g. "Egenkapital 01.01" and "Egenkapital 31.12" both map to total_equity,
  // or "Varelager" and "Sum varer" both to inventory). The line identity is
  // metricKey + scope + year + rawLabel, so the label must be part of the dedup
  // key or the second row silently overwrites the first.
  const scopeSuffix = fact.statementScope ? `:${fact.statementScope}` : "";
  const labelSuffix = `:${(fact.rawLabel ?? "").toLowerCase().trim()}`;
  factMap.set(`${fact.metricKey}:${fact.fiscalYear}${scopeSuffix}${labelSuffix}`, fact);
}

function getPdfArtifactUrl(artifacts: Artifact[], filing: ReviewDetail["filing"], reviewId: string): string | null {
  const hasPdfArtifact = artifacts?.some((a) => a.artifactType === "PDF");
  if (hasPdfArtifact) {
    return `/api/admin/annual-report-reviews/${reviewId}/pdf`;
  }
  return filing.sourceUrl ?? null;
}

export function ReviewWorkspace({ review }: { review: ReviewDetail }) {
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [validating, setValidating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [reopening, setReopening] = useState(false);
  // Validation rule codes the reviewer chose to override for this run. These
  // are still surfaced (as warnings) but no longer block publishing — used
  // while the metric-mapping rule set is a parallel WIP.
  const [overriddenRuleCodes, setOverriddenRuleCodes] = useState<string[]>([]);
  const toggleOverride = (ruleCode: string) =>
    setOverriddenRuleCodes((prev) =>
      prev.includes(ruleCode) ? prev.filter((c) => c !== ruleCode) : [...prev, ruleCode],
    );

  // "Som rapportert" vs "Standardisert" toggle
  const [viewMode, setViewMode] = useState<"standardized" | "as-reported">("as-reported");
  // Collapse secondary detail sections behind "Se mer" by default.
  const [showArtifacts, setShowArtifacts] = useState(false);
  const [showValidationIssues, setShowValidationIssues] = useState(false);
  const [showReviewedFacts, setShowReviewedFacts] = useState(false);
  const [extractionData, setExtractionData] = useState<ExtractionData | null>(null);
  const [extractionLoading, setExtractionLoading] = useState(false);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const hasExtractionArtifact = review.filing.artifacts.some(
    (a) => a.artifactType === "EXTRACTION_JSON",
  );

  useEffect(() => {
    // Both views need the extraction rows: "Som rapportert" renders them and
    // "Standardisert" aggregates them. Load eagerly for either.
    if (extractionData || extractionLoading) return;
    setExtractionLoading(true);
    setExtractionError(null);
    fetch(`/api/admin/annual-report-reviews/${review.id}/extraction`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<ExtractionData>;
      })
      .then((data) => setExtractionData(data))
      .catch((err: unknown) =>
        setExtractionError(err instanceof Error ? err.message : "Ukjent feil"),
      )
      .finally(() => setExtractionLoading(false));
  }, [extractionData, extractionLoading, review.id]);

  // Which set of accounts this review is for (konsern vs selskap). A group
  // filing persists facts for BOTH scopes; the review workspace must show
  // only the one this review covers, otherwise konsern and selskap rows
  // (e.g. two "revenue" rows) appear mixed together.
  const reviewPayloadRaw =
    review.reviewPayload && typeof review.reviewPayload === "object"
      ? (review.reviewPayload as Record<string, unknown>)
      : null;
  const reviewScope: "COMPANY" | "CONSOLIDATED" =
    reviewPayloadRaw?.statementScope === "CONSOLIDATED" ? "CONSOLIDATED" : "COMPANY";

  // Memoised so the standardizedTotals useMemo below doesn't recompute on
  // every render (a fresh array literal would change its dependency identity).
  const allFacts = useMemo(
    () => review.extractionRun?.facts ?? [],
    [review.extractionRun?.facts],
  );
  // Fall back to the unfiltered list if scope tagging is absent (older runs)
  // so the workspace is never accidentally empty.
  const facts = useMemo(() => {
    const scoped = allFacts.filter(
      (fact) => (fact.statementScope ?? "COMPANY") === reviewScope,
    );
    return scoped.length > 0 ? scoped : allFacts;
  }, [allFacts, reviewScope]);
  const issues = [
    ...(review.extractionRun?.validationIssues ?? []),
    ...review.filing.validationIssues,
  ];
  const pdfUrl = getPdfArtifactUrl(review.filing.artifacts, review.filing, review.id);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);

  useEffect(() => {
    if (!pdfUrl) return;
    let objectUrl: string;
    fetch(pdfUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setPdfBlobUrl(objectUrl);
      })
      .catch((err: unknown) => {
        setPdfError(err instanceof Error ? err.message : "Ukjent feil");
      });
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [pdfUrl]);

  const reviewedFacts = review.reviewedFacts ?? [];
  const { income: rfIncome, balance: rfBalance } = groupReviewedFacts(reviewedFacts);

  const payload = reviewPayloadRaw;

  // reviewScope is computed above (used to scope the fact list).
  const reviewScopeLabel = reviewScope === "CONSOLIDATED" ? "Konsern" : "Selskap";

  // Correction form state — all canonical keys + any non-canonical extracted facts
  const [editableFacts, setEditableFacts] = useState<EditableFact[]>(() => {
    const factsByKey = new Map(facts.map((f) => [f.metricKey, f]));
    const incomeKeySet = new Set(INCOME_METRIC_ORDER);
    const entries: EditableFact[] = [];
    for (const key of [...INCOME_METRIC_ORDER, ...BALANCE_METRIC_ORDER]) {
      const f = factsByKey.get(key);
      entries.push({
        id: newEditableFactId(),
        metricKey: key,
        fiscalYear: f?.fiscalYear ?? review.fiscalYear,
        value: f ? bigintToDisplay(f.value) : "",
        rawLabel: f?.rawLabel ?? "",
        sourcePage: String(f?.sourcePage ?? ""),
        unitScale: String(f?.unitScale ?? 1000),
        statementType: incomeKeySet.has(key) ? "INCOME_STATEMENT" : "BALANCE_SHEET",
        deleted: false,
        isCustom: false,
      });
    }
    // Non-canonical machine facts (custom keys the extractor produced).
    for (const f of facts) {
      if (!CANONICAL_ORDER_MAP.has(f.metricKey)) {
        entries.push({
          id: newEditableFactId(),
          metricKey: f.metricKey,
          fiscalYear: f.fiscalYear,
          value: bigintToDisplay(f.value),
          rawLabel: f.rawLabel ?? "",
          sourcePage: String(f.sourcePage ?? ""),
          unitScale: String(f.unitScale),
          statementType:
            f.statementType === "BALANCE_SHEET"
              ? "BALANCE_SHEET"
              : f.statementType === "INCOME_STATEMENT"
                ? "INCOME_STATEMENT"
                : "OTHER",
          deleted: false,
          isCustom: true,
        });
      }
    }
    return entries;
  });
  const [priorYearEdits, setPriorYearEdits] = useState<Record<string, string>>({});
  const [rowEdits, setRowEdits] = useState<Record<string, RowEdit>>({});
  const [addedRows, setAddedRows] = useState<AddedRow[]>([]);
  // Session-scoped universe of reviewer-added metric keys, split by category.
  const [customKeys, setCustomKeys] = useState<CustomKeyState>({ income: [], balance: [] });
  const addCustomKey = (category: MetricCategory, key: string) => {
    const trimmed = key.trim();
    if (!trimmed) return;
    setCustomKeys((prev) => {
      // A new key for OTHER is filed under income by default (notes rarely
      // need their own universe); income/balance go to their own list.
      const bucket: "income" | "balance" = category === "BALANCE" ? "balance" : "income";
      if (prev[bucket].includes(trimmed) || CANONICAL_ORDER_MAP.has(trimmed)) return prev;
      return { ...prev, [bucket]: [...prev[bucket], trimmed] };
    });
  };

  // Global universe of custom keys created across ALL prior reviews (the same
  // keys surfaced in the metric-mapping admin). Without this, keys a reviewer
  // created earlier would be invisible in a fresh review's picker. Fetched once
  // and merged into the picker options below; NOT persisted to the draft.
  const [knownKeys, setKnownKeys] = useState<CustomKeyState>({ income: [], balance: [] });
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/canonical-keys", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as {
          data: { keys: { key: string; family: string }[] };
        };
        if (cancelled) return;
        const income: string[] = [];
        const balance: string[] = [];
        for (const k of json.data.keys) {
          if (CANONICAL_ORDER_MAP.has(k.key)) continue; // already in the skeleton order
          if (k.family === "BALANCE_SHEET") balance.push(k.key);
          else income.push(k.key);
        }
        setKnownKeys({ income, balance });
      } catch {
        // Best-effort enrichment — the picker still works with the skeleton
        // order plus any keys added in this session.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Picker universe shown in the comboboxes: previously-created keys first,
  // then any added in this session. Deduped; the draft still persists only the
  // session-added `customKeys`.
  const mergedKeyUniverse = useMemo<CustomKeyState>(() => {
    const dedupe = (a: string[], b: string[]) => Array.from(new Set([...a, ...b]));
    return {
      income: dedupe(knownKeys.income, customKeys.income),
      balance: dedupe(knownKeys.balance, customKeys.balance),
    };
  }, [knownKeys, customKeys]);

  // Standardized view = read-only aggregation (sum per canonical key) of the
  // values entered in "Som rapportert". Recomputed whenever any editing state
  // changes so it always mirrors the as-reported numbers.
  const standardizedTotals = useMemo(
    () =>
      deriveStandardizedTotals({
        extractionData,
        facts,
        allFacts,
        rowEdits,
        editableFacts,
        priorYearEdits,
        addedRows,
        reviewScope,
        fiscalYear: review.fiscalYear,
      }),
    [
      extractionData,
      facts,
      allFacts,
      rowEdits,
      editableFacts,
      priorYearEdits,
      addedRows,
      reviewScope,
      review.fiscalYear,
    ],
  );

  const pdfDecision = payload?.pdfDecision as PdfDecision | null | undefined;
  const boardProposal = payload?.boardReportProposal as Record<string, unknown> | null | undefined;
  const auditorProposal = payload?.auditorReportProposal as Record<string, unknown> | null | undefined;
  const [boardReportText, setBoardReportText] = useState(
    (payload?.boardReportText as string | undefined) ??
      (typeof boardProposal?.fullText === "string" ? boardProposal.fullText : "") ?? "",
  );
  const [auditorReportText, setAuditorReportText] = useState(
    (payload?.auditorReportText as string | undefined) ??
      (typeof auditorProposal?.fullText === "string" ? auditorProposal.fullText : "") ?? "",
  );
  const [auditorOpinion, setAuditorOpinion] = useState<string>(
    (payload as Record<string, unknown> | null)?.auditorOpinion != null &&
    typeof (payload as Record<string, unknown>)?.auditorOpinion === "object"
      ? String(
          ((payload as Record<string, unknown>).auditorOpinion as Record<string, unknown>)
            ?.opinionType ?? "UNKNOWN",
        )
      : "UNKNOWN",
  );

  // ── Draft persistence ─────────────────────────────────────────────────
  // Editing state lives in React memory, so a reload would wipe in-progress
  // work. We persist a snapshot to TWO places:
  //   • localStorage — instant, per-browser backup
  //   • the server (reviewPayload.clientDraft) — durable; survives reloads,
  //     hot-reloads and device changes (debounced auto-save below)
  // On mount we restore whichever snapshot is newest (by savedAt).
  const draftKey = `arr-review-draft:${review.id}`;
  const isPending = review.status === "PENDING_REVIEW";
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);

  const hydrateFromSnapshot = (d: Record<string, unknown>) => {
    if (Array.isArray(d.editableFacts)) setEditableFacts(d.editableFacts as EditableFact[]);
    if (d.rowEdits && typeof d.rowEdits === "object")
      setRowEdits(d.rowEdits as Record<string, RowEdit>);
    if (d.priorYearEdits && typeof d.priorYearEdits === "object")
      setPriorYearEdits(d.priorYearEdits as Record<string, string>);
    if (Array.isArray(d.addedRows)) setAddedRows(d.addedRows as AddedRow[]);
    if (d.customKeys && typeof d.customKeys === "object")
      setCustomKeys(d.customKeys as CustomKeyState);
    if (typeof d.boardReportText === "string") setBoardReportText(d.boardReportText);
    if (typeof d.auditorReportText === "string") setAuditorReportText(d.auditorReportText);
    if (typeof d.auditorOpinion === "string") setAuditorOpinion(d.auditorOpinion);
  };

  const buildSnapshot = useCallback(
    () => ({
      editableFacts,
      rowEdits,
      priorYearEdits,
      addedRows,
      customKeys,
      boardReportText,
      auditorReportText,
      auditorOpinion,
      savedAt: new Date().toISOString(),
    }),
    [
      editableFacts,
      rowEdits,
      priorYearEdits,
      addedRows,
      customKeys,
      boardReportText,
      auditorReportText,
      auditorOpinion,
    ],
  );

  // Restore the newest available draft (server vs localStorage) on mount.
  useEffect(() => {
    try {
      const serverDraft =
        payload && typeof payload.clientDraft === "object" && payload.clientDraft
          ? (payload.clientDraft as Record<string, unknown>)
          : null;
      let localDraft: Record<string, unknown> | null = null;
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(draftKey) : null;
      if (raw) localDraft = JSON.parse(raw) as Record<string, unknown>;

      const serverTime =
        serverDraft && typeof serverDraft.savedAt === "string" ? Date.parse(serverDraft.savedAt) : 0;
      const localTime =
        localDraft && typeof localDraft.savedAt === "string" ? Date.parse(localDraft.savedAt) : 0;

      const chosen = serverTime >= localTime ? serverDraft ?? localDraft : localDraft ?? serverDraft;
      if (chosen && Object.keys(chosen).length > 0) {
        hydrateFromSnapshot(chosen);
        setDraftRestored(true);
        if (typeof chosen.savedAt === "string") setLastSavedAt(chosen.savedAt);
      }
    } catch {
      // Corrupt draft — ignore and start fresh.
    }
    // Enable persistence only AFTER the restore pass, so the save effect
    // never clobbers a saved draft with the freshly-computed initial state.
    setDraftHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  // Instant localStorage backup on every change.
  useEffect(() => {
    if (!draftHydrated) return;
    try {
      window.localStorage.setItem(draftKey, JSON.stringify(buildSnapshot()));
    } catch {
      // Quota / serialization failure — non-fatal.
    }
  }, [draftHydrated, draftKey, buildSnapshot]);

  // Durable server auto-save, debounced 2s after the last edit.
  useEffect(() => {
    if (!draftHydrated || !isPending) return;
    const snapshot = buildSnapshot();
    const handle = setTimeout(() => {
      setSavingDraft(true);
      fetch(`/api/admin/annual-report-reviews/${review.id}/save-draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft: snapshot }),
      })
        .then((res) => {
          if (res.ok) setLastSavedAt(snapshot.savedAt);
        })
        .catch(() => {
          // Network blip — localStorage still holds the snapshot.
        })
        .finally(() => setSavingDraft(false));
    }, 2000);
    return () => clearTimeout(handle);
  }, [draftHydrated, isPending, buildSnapshot, review.id]);

  const saveDraftNow = async () => {
    const snapshot = buildSnapshot();
    setSavingDraft(true);
    try {
      const res = await fetch(`/api/admin/annual-report-reviews/${review.id}/save-draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft: snapshot }),
      });
      if (res.ok) setLastSavedAt(snapshot.savedAt);
    } catch {
      // ignore
    } finally {
      setSavingDraft(false);
    }
  };

  const clearDraft = async () => {
    if (typeof window === "undefined") return;
    const ok = window.confirm(
      "Forkaste utkastet og gå tilbake til maskinens tall? Dette kan ikke angres.",
    );
    if (!ok) return;
    try {
      window.localStorage.removeItem(draftKey);
    } catch {
      // ignore
    }
    // Clear the durable server draft too, then reload so the form
    // re-initialises from the machine-extracted values.
    try {
      await fetch(`/api/admin/annual-report-reviews/${review.id}/save-draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft: {} }),
      });
    } catch {
      // ignore — reload anyway
    }
    window.location.reload();
  };

  async function call(path: string, body: unknown) {
    setLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/annual-report-reviews/${review.id}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Feil fra server.");
      router.refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Ukjent feil.");
    } finally {
      setLoading(false);
    }
  }

  async function handleValidate() {
    setValidating(true);
    setActionError(null);
    setValidationResult(null);
    try {
      const res = await fetch(
        `/api/admin/annual-report-reviews/${review.id}/validate-reviewed-facts`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ overriddenRuleCodes }),
        },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Valideringsfeil fra server.");
      setValidationResult(json.data as ValidationResult);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Ukjent feil ved validering.");
    } finally {
      setValidating(false);
    }
  }

  async function handlePublish() {
    setPublishing(true);
    setActionError(null);
    try {
      const res = await fetch(
        `/api/admin/annual-report-reviews/${review.id}/publish-reviewed-facts`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ overriddenRuleCodes }),
        },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Publiseringsfeil fra server.");
      const data = json.data as { published: boolean; issues?: unknown[] };
      if (!data.published) {
        setValidationResult({
          passed: false,
          hasBlockingErrors: true,
          validationScore: 0,
          blockingIssues: (data.issues ?? []) as ValidationResult["blockingIssues"],
          warnings: [],
          issues: (data.issues ?? []) as ValidationResult["issues"],
          reviewedFactCount: reviewedFacts.length,
        });
        throw new Error("Validering feilet — se issues nedenfor.");
      }
      router.refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Ukjent feil ved publisering.");
    } finally {
      setPublishing(false);
    }
  }

  async function handleReopen() {
    setReopening(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/annual-report-reviews/${review.id}/reopen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Kunne ikke gjenåpne saken.");
      router.refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Ukjent feil ved gjenåpning.");
    } finally {
      setReopening(false);
    }
  }

  function handleAccept() {
    call("accept", { notes: notes || undefined });
  }

  function handleReject() {
    if (!notes.trim()) {
      setActionError("Begrunnelse er påkrevd.");
      return;
    }
    call("reject", { reason: notes });
  }

  function handleReprocess() {
    if (!notes.trim()) {
      setActionError("Begrunnelse er påkrevd.");
      return;
    }
    call("reprocess", { reason: notes });
  }

  function handleUnreadable() {
    if (!notes.trim()) {
      setActionError("Begrunnelse er påkrevd.");
      return;
    }
    call("unreadable", { reason: notes });
  }

  function handleCorrect() {
    // Only send facts where the value has been manually changed from the DB value
    // or where the user has reassigned a row to another canonical key.
    const dbValueByKey = new Map(facts.map((f) => [f.metricKey, bigintToDisplay(f.value)]));
    const factCorrections = new Map<string, FactCorrectionInput>();
    const priorFiscalYear = review.fiscalYear - 1;

    const canonicalByLabel = new Map<string, string>();
    const mappedFacts = extractionData?.mappedFacts ?? [];
    const priorCandidateByKey = new Map<string, { value: number; colIdx: number }>();
    for (const mappedFact of mappedFacts) {
      const key = (mappedFact.normalizedLabel ?? mappedFact.rawLabel ?? "").toLowerCase().trim();
      if (key && !canonicalByLabel.has(key)) {
        canonicalByLabel.set(key, mappedFact.metricKey);
      }
      if (mappedFact.isDerived) continue;
      const colIdx = mappedFact.rawPayload?.columnIndex ?? -1;
      const existing = priorCandidateByKey.get(mappedFact.metricKey);
      if (!existing || colIdx > existing.colIdx) {
        priorCandidateByKey.set(mappedFact.metricKey, { value: mappedFact.value, colIdx });
      }
    }
    const priorValueByKey = new Map<string, string>();
    for (const [key, candidate] of priorCandidateByKey) {
      priorValueByKey.set(key, String(candidate.value));
    }

    const effectiveRows = extractionData
      ? (
          extractionData.rows.length > 0
            ? extractionData.rows
            : buildSyntheticRows(extractionData.mappedFacts, [review.fiscalYear, priorFiscalYear])
        )
      : [];

    // FULL-GRID emit: the backend no longer re-derives machine-vs-manual. We
    // send EVERY visible line with its on-screen "Endelig" (finalInput =
    // manual ?? machine), so what the reviewer sees is exactly what publishes.
    // Per-row scope/key/fallback mirror deriveStandardizedTotals so the emitted
    // values match the Standardisert totals and the Endelig column 1:1.
    const pageToScope = new Map<number, "COMPANY" | "CONSOLIDATED">();
    for (const f of allFacts) {
      if (f.sourcePage !== null && f.statementScope && !pageToScope.has(f.sourcePage)) {
        pageToScope.set(f.sourcePage, f.statementScope);
      }
    }
    for (const mf of mappedFacts) {
      if (mf.statementScope && typeof mf.sourcePage === "number") {
        pageToScope.set(mf.sourcePage, mf.statementScope);
      }
    }
    const statementTypeByKey = new Map<
      string,
      "INCOME_STATEMENT" | "BALANCE_SHEET" | "CASH_FLOW" | "NOTE"
    >();
    for (const f of allFacts) {
      if (statementTypeByKey.has(f.metricKey)) continue;
      if (
        f.statementType === "INCOME_STATEMENT" ||
        f.statementType === "BALANCE_SHEET" ||
        f.statementType === "CASH_FLOW" ||
        f.statementType === "NOTE"
      ) {
        statementTypeByKey.set(f.metricKey, f.statementType);
      }
    }

    // Whole-NOK digit string (or null when blank). "-" is the nil marker (0).
    const toNok = (s: string | null | undefined): string | null => {
      if (s === null || s === undefined) return null;
      const t = s.trim();
      if (t === "") return null;
      if (/^[-–—_]$/.test(t)) return "0";
      const n = Number(t.replace(/\s/g, ""));
      return Number.isFinite(n) ? String(Math.round(n)) : null;
    };

    for (const row of effectiveRows) {
      const rowEdit = rowEdits[getRowId(row)];
      if (rowEdit?.deleted) continue; // deleted row: absent = dropped

      const lookupKey = (row.normalizedLabel ?? row.label ?? "").toLowerCase().trim();
      const canonicalKey = canonicalByLabel.get(lookupKey) ?? null;
      const isMapped = canonicalKey !== null;
      const selectedMetricKey = (rowEdit?.metricKey?.trim() || canonicalKey) ?? "";
      if (!selectedMetricKey) continue; // unmapped row with no assigned key

      const scope = pageToScope.get(row.pageNumber) ?? reviewScope;
      const effectiveLabel = (rowEdit?.labelOverride ?? row.label) || null;
      const statementType = statementTypeByKey.get(selectedMetricKey);

      const mainProposed = isMapped && canonicalKey ? dbValueByKey.get(canonicalKey) ?? null : null;
      const priorProposed = isMapped && canonicalKey ? priorValueByKey.get(canonicalKey) ?? null : null;
      const [reconMain, reconPrior] = isMapped ? [null, null] : reconstructYearValues(row.values);
      const fallbackMain = mainProposed ?? (reconMain !== null ? String(Math.round(reconMain * row.unitScale)) : null);
      const fallbackPrior = priorProposed ?? (reconPrior !== null ? String(Math.round(reconPrior * row.unitScale)) : null);

      // Resolve the manual value EXACTLY as the renderer does, so what publishes
      // equals the on-screen "Endelig". Critically this includes the legacy
      // scope-blind editableFacts/priorYearEdits surfaces: a value typed there
      // (no rowEdit) shows as Endelig but would otherwise be invisible to this
      // emit, leaving the machine value to publish — the exact mismatch we hit.
      const hasRowEdit = rowEdit !== undefined;
      const hasKeyOverride =
        isMapped && canonicalKey !== null && selectedMetricKey !== "" && selectedMetricKey !== canonicalKey;
      const editIdx =
        isMapped && canonicalKey ? editableFacts.findIndex((e) => e.metricKey === canonicalKey) : -1;
      const legacyMappedMain = editIdx >= 0 ? (editableFacts[editIdx]!.value ?? "") : "";
      const legacyMappedPrior = isMapped && canonicalKey ? (priorYearEdits[canonicalKey] ?? "") : "";
      const mappedMainManual = hasRowEdit ? (rowEdit!.mainValue ?? "") : legacyMappedMain;
      const mappedPriorManual = hasRowEdit ? (rowEdit!.priorValue ?? "") : legacyMappedPrior;
      const mainManualRaw = hasKeyOverride || !isMapped ? (rowEdit?.mainValue ?? "") : mappedMainManual;
      const priorManualRaw = hasKeyOverride || !isMapped ? (rowEdit?.priorValue ?? "") : mappedPriorManual;
      const mainManual = normalizeAmountInput(mainManualRaw);
      const priorManual = normalizeAmountInput(priorManualRaw);
      const effMain = toNok(mainManual !== "" ? mainManual : fallbackMain);
      const effPrior = toNok(priorManual !== "" ? priorManual : fallbackPrior);
      const mainIsManual = mainManual !== "" && mainManual !== (fallbackMain ?? "");
      const priorIsManual = priorManual !== "" && priorManual !== (fallbackPrior ?? "");

      if (effMain !== null) {
        upsertFactCorrection(factCorrections, {
          metricKey: selectedMetricKey,
          fiscalYear: review.fiscalYear,
          value: effMain,
          finalInput: effMain,
          correctionSource: mainIsManual ? "MANUAL_CORRECTION" : "ACCEPTED_MACHINE",
          rawLabel: effectiveLabel,
          sourcePage: row.pageNumber,
          unitScale: row.unitScale,
          statementScope: scope,
          statementType,
        });
      }
      if (effPrior !== null) {
        upsertFactCorrection(factCorrections, {
          metricKey: selectedMetricKey,
          fiscalYear: priorFiscalYear,
          value: effPrior,
          finalInput: effPrior,
          correctionSource: priorIsManual ? "MANUAL_CORRECTION" : "ACCEPTED_MACHINE",
          rawLabel: effectiveLabel,
          sourcePage: row.pageNumber,
          unitScale: row.unitScale,
          statementScope: scope,
          statementType,
        });
      }
    }

    // Manually added rows (lines the model missed). Only committed rows
    // (the reviewer clicked "Legg til") are saved — uncommitted ones are
    // still being drafted in the tray. Always MANUAL_CORRECTION.
    for (const added of addedRows) {
      if (added.deleted || !added.committed) continue;
      const metricKey = added.metricKey.trim();
      if (!metricKey) continue;
      const main = toNok(added.mainValue);
      const prior = toNok(added.priorValue);
      if (main !== null) {
        upsertFactCorrection(factCorrections, {
          metricKey,
          fiscalYear: review.fiscalYear,
          value: main,
          finalInput: main,
          correctionSource: "MANUAL_CORRECTION",
          rawLabel: added.label.trim() || null,
          sourcePage: null,
          unitScale: null,
          statementScope: added.statementScope,
        });
      }
      if (prior !== null) {
        upsertFactCorrection(factCorrections, {
          metricKey,
          fiscalYear: priorFiscalYear,
          value: prior,
          finalInput: prior,
          correctionSource: "MANUAL_CORRECTION",
          rawLabel: added.label.trim() || null,
          sourcePage: null,
          unitScale: null,
          statementScope: added.statementScope,
        });
      }
    }

    // NOTE: corrections are emitted SOLELY from rowEdits (the "Som rapportert"
    // path) above. rowEdits is the single source of truth — each row carries its
    // own statementScope (konsern/selskap) and rawLabel, so two rows sharing a
    // metricKey never collide. The former editableFacts and priorYearEdits
    // emission paths were SCOPE-BLIND (one slot per metricKey, no scope) and were
    // the root of the whole bug class: konsern values getting the selskap value,
    // cleared fields resurfacing a stale value, numbers reverting on save. Those
    // edit surfaces (InlineFactTable / the editable Standardisert view) are no
    // longer rendered — the Standardisert view is now a read-only sum derived
    // from rowEdits — so editableFacts/priorYearEdits hold only stale machine
    // values and must NOT be published.

    const correctedFacts = Array.from(factCorrections.values());

    const sections: { sectionType: string; text: string }[] = [];
    if (boardReportText.trim()) {
      sections.push({ sectionType: "BOARD_REPORT", text: boardReportText.trim() });
    }
    if (auditorReportText.trim()) {
      sections.push({ sectionType: "AUDITOR_REPORT", text: auditorReportText.trim() });
    }

    const corrections: Record<string, unknown> = { facts: correctedFacts };
    if (sections.length > 0) {
      corrections.sections = sections;
    }
    if (auditorOpinion !== "UNKNOWN") {
      corrections.auditorOpinion = { opinionType: auditorOpinion };
    }
    // No deletedMetricKeys: with full-grid emit, a deleted row is simply not
    // emitted (absent = dropped). The backend no longer carries machine facts
    // over, so there is nothing to suppress.

    call("correct", {
      corrections,
      notes: notes || undefined,
    });
  }

  const isResolved =
    review.status === "ACCEPTED" || review.status === "REJECTED" || review.status === "RESOLVED_BY_NEW_RUN";
  const isAccepted = review.status === "ACCEPTED";
  const hasReviewedFacts = reviewedFacts.length > 0;
  const canPublish = validationResult?.passed === true;

  // Once the review is resolved, the locally-saved draft is stale — drop it.
  useEffect(() => {
    if (isResolved) {
      try {
        window.localStorage.removeItem(draftKey);
      } catch {
        // ignore
      }
    }
  }, [isResolved, draftKey]);

  return (
    // minmax(0,1fr) on both tracks lets each column shrink below its content
    // width. Without it, a wide financial table (e.g. when the 2023 columns
    // are shown) forces its track wider and squeezes the PDF to a sliver.
    // With it, the table column stays at 50 % and scrolls horizontally instead.
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* ---- Left: PDF viewer (sticky so it follows the financial tables) ---- */}
      <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
        <div className="rounded-lg border border-[rgba(15,23,42,0.08)] bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">
            Original årsrapport
          </h2>
          {pdfError ? (
            <p className="text-sm text-red-500">Kunne ikke laste PDF: {pdfError}</p>
          ) : pdfBlobUrl ? (
            <div className="flex flex-col gap-2">
              <embed
                src={pdfBlobUrl}
                type="application/pdf"
                className="h-[800px] lg:h-[calc(100vh-16rem)] lg:min-h-[420px] w-full rounded border border-[rgba(15,23,42,0.08)]"
              />
              <a
                href={pdfBlobUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-[#31495f] underline"
              >
                Åpne PDF i nytt vindu
              </a>
            </div>
          ) : pdfUrl ? (
            <div className="flex h-[800px] items-center justify-center rounded border border-[rgba(15,23,42,0.08)]">
              <p className="text-sm text-slate-400">Laster PDF...</p>
            </div>
          ) : (
            <p className="text-sm text-slate-400">Ingen PDF-visning tilgjengelig.</p>
          )}

          {review.filing.artifacts.length > 0 && (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setShowArtifacts((v) => !v)}
                className="text-xs font-medium text-[var(--px-accent)] hover:underline"
              >
                {showArtifacts
                  ? "Skjul artefakter"
                  : `Se artefakter (${review.filing.artifacts.length})`}
              </button>
              {showArtifacts && (
                <ul className="mt-2 space-y-1">
                  {review.filing.artifacts.map((a) => (
                    <li key={a.id} className="font-mono text-xs text-slate-500">
                      {a.artifactType} — {a.storageKey}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Previous decisions */}
        {review.decisions.length > 0 && (
          <div className="rounded-lg border border-[rgba(15,23,42,0.08)] bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">
              Tidligere vurderinger
            </h2>
            <ul className="space-y-3">
              {review.decisions.map((d) => (
                <li key={d.id} className="border-l-2 border-slate-200 pl-3 text-sm">
                  <span className="font-medium text-[#162233]">{d.decisionType}</span>
                  <span className="ml-2 text-slate-400">
                    {new Date(d.createdAt).toLocaleString("nb-NO")}
                  </span>
                  <span className="ml-2 text-slate-500">av {d.reviewer.name ?? d.reviewer.email}</span>
                  {d.correctionNotes && (
                    <p className="mt-1 text-slate-500">{d.correctionNotes}</p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* ---- Right: Review workspace ---- */}
      <div className="flex min-w-0 flex-col gap-4">

        {draftRestored && !isResolved && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <span>
              <strong>Ulagret utkast gjenopprettet.</strong> Endringene dine fra
              forrige økt ble hentet tilbake automatisk.
            </span>
            <button
              type="button"
              onClick={clearDraft}
              className="shrink-0 rounded border border-amber-300 bg-white px-2 py-0.5 font-medium text-amber-700 hover:bg-amber-100"
            >
              Forkast utkast
            </button>
          </div>
        )}

        {/* Auto-save status — every edit is persisted durably to the server. */}
        {isPending && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-[rgba(15,23,42,0.08)] bg-slate-50 px-3 py-1.5 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <span
                className={
                  "h-1.5 w-1.5 rounded-full " +
                  (savingDraft ? "bg-amber-400 animate-pulse" : lastSavedAt ? "bg-emerald-400" : "bg-slate-300")
                }
              />
              {savingDraft
                ? "Lagrer endringer…"
                : lastSavedAt
                  ? `Lagret automatisk kl ${new Date(lastSavedAt).toLocaleTimeString("nb-NO")}`
                  : "Endringer lagres automatisk"}
            </span>
            <button
              type="button"
              onClick={saveDraftNow}
              disabled={savingDraft}
              className="shrink-0 rounded border border-[rgba(15,23,42,0.12)] bg-white px-2 py-0.5 font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
            >
              Lagre nå
            </button>
          </div>
        )}

        {/* Foreslåtte tall — med toggle mellom standardisert og som rapportert */}
        {facts.length > 0 && (
          <div className="min-w-0 rounded-lg border border-[rgba(15,23,42,0.08)] bg-white p-4">
            {/* Header med toggle-knapper */}
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
                  Finansielle tall
                </h2>
                <span className={`rounded px-2 py-0.5 text-xs font-semibold ${
                  reviewScope === "CONSOLIDATED"
                    ? "bg-blue-100 text-blue-700"
                    : "bg-slate-100 text-slate-600"
                }`}>
                  {reviewScopeLabel}
                </span>
              </div>
              <div className="flex rounded border border-[rgba(15,23,42,0.10)] text-xs overflow-hidden">
                <button
                  onClick={() => setViewMode("standardized")}
                  className={`px-3 py-1.5 font-medium transition-colors ${
                    viewMode === "standardized"
                      ? "bg-[var(--px-action)] text-white"
                      : "bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  Standardisert
                </button>
                <button
                  onClick={() => setViewMode("as-reported")}
                  disabled={!hasExtractionArtifact}
                  title={!hasExtractionArtifact ? "Ingen EXTRACTION_JSON tilgjengelig" : undefined}
                  className={`px-3 py-1.5 font-medium transition-colors border-l border-[rgba(15,23,42,0.10)] ${
                    viewMode === "as-reported"
                      ? "bg-[var(--px-action)] text-white"
                      : "bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  }`}
                >
                  Som rapportert
                </button>
              </div>
            </div>

            {/* Standardisert view — inline redigering med kanonisk rekkefølge */}
            {viewMode === "standardized" && (
              <>
                <p className="mb-3 text-xs text-slate-400">
                  Avledet visning: hver nøkkel er <strong>summen</strong> av radene
                  du har ført i «Som rapportert». Tallene redigeres ikke her —
                  endre dem i «Som rapportert».
                </p>
                <StandardizedSummary
                  totals={standardizedTotals}
                  mainYear={review.fiscalYear}
                  priorYear={review.fiscalYear - 1}
                />
              </>
            )}

            {/* Som rapportert view — alle rå linjer fra PDF */}
            {viewMode === "as-reported" && (
              <>
                {extractionLoading && (
                  <p className="py-6 text-center text-xs text-slate-400">Laster ekstraheringsdata…</p>
                )}
                {extractionError && (
                  <p className="rounded bg-red-50 px-3 py-2 text-xs text-red-600">{extractionError}</p>
                )}
                {extractionData && (
                  <AsReportedPanel
                    data={extractionData}
                    fiscalYear={review.fiscalYear}
                    facts={facts}
                    allFacts={allFacts}
                    primaryScope={reviewScope}
                    editableFacts={editableFacts}
                    setEditableFacts={setEditableFacts}
                    priorYearEdits={priorYearEdits}
                    setPriorYearEdits={setPriorYearEdits}
                    rowEdits={rowEdits}
                    setRowEdits={setRowEdits}
                    addedRows={addedRows}
                    setAddedRows={setAddedRows}
                    customKeys={mergedKeyUniverse}
                    addCustomKey={addCustomKey}
                  />
                )}
              </>
            )}

            {/* Tekst-seksjoner — alltid synlig */}
            <div className="mt-4 space-y-3 border-t border-[rgba(15,23,42,0.06)] pt-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Styrets beretning (tekst)
                </label>
                <textarea
                  value={boardReportText}
                  onChange={(e) => setBoardReportText(e.target.value)}
                  rows={2}
                  placeholder={
                    review.extractionRun?.documentEngine === "LEGACY"
                      ? "Ikke ekstrahert for dette dokumentet (LEGACY-motor)"
                      : "Styreberetning ikke funnet i dokumentet"
                  }
                  className="w-full rounded border border-[rgba(15,23,42,0.12)] px-3 py-2 text-xs text-slate-700 placeholder-slate-300 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Revisorberetning (tekst)
                </label>
                <textarea
                  value={auditorReportText}
                  onChange={(e) => setAuditorReportText(e.target.value)}
                  rows={2}
                  placeholder={
                    review.extractionRun?.documentEngine === "LEGACY"
                      ? "Ikke ekstrahert for dette dokumentet (LEGACY-motor)"
                      : "Revisorberetning ikke funnet i dokumentet"
                  }
                  className="w-full rounded border border-[rgba(15,23,42,0.12)] px-3 py-2 text-xs text-slate-700 placeholder-slate-300 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Revisjonskonklusjon
                </label>
                <select
                  value={auditorOpinion}
                  onChange={(e) => setAuditorOpinion(e.target.value)}
                  className="rounded border border-[rgba(15,23,42,0.12)] bg-white px-2 py-1 text-xs text-slate-700 focus:outline-none"
                >
                  <option value="UNKNOWN">Ukjent</option>
                  <option value="CLEAN">Ren (Clean)</option>
                  <option value="QUALIFIED">Modifisert (Qualified)</option>
                  <option value="ADVERSE">Negativ (Adverse)</option>
                  <option value="DISCLAIMER">Fraskrivelse (Disclaimer)</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Summary */}
        <div className="rounded-lg border border-[rgba(15,23,42,0.08)] bg-white p-4">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
              Sammendrag
            </h2>
            <AnnualReportRefreshButton
              scope="filing"
              filingId={review.filing.id}
              label="Kjør refresh"
              pendingLabel="Starter refresh..."
              helperText="Bruk når du vil kjøre dokumentet på nytt med dagens ekstraksjonsløype."
              className="rounded-full border border-[rgba(15,23,42,0.12)] bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60"
            />
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-slate-500">Org.nr</dt>
            <dd className="font-mono font-medium text-[#162233]">{review.company.orgNumber}</dd>
            <dt className="text-slate-500">Status</dt>
            <dd className="font-medium text-[#162233]">{review.status}</dd>
            <dt className="text-slate-500">Regnskapsår</dt>
            <dd className="font-medium text-[#162233]">{review.fiscalYear}</dd>
            <dt className="text-slate-500">Regnskapssett</dt>
            <dd className="font-medium text-[#162233]">{reviewScopeLabel}</dd>
            <dt className="text-slate-500">Kvalitetsscore</dt>
            <dd className="font-medium text-[#162233]">
              {review.qualityScore != null ? `${(review.qualityScore * 100).toFixed(1)}%` : "—"}
            </dd>
            <dt className="text-slate-500">Parser</dt>
            <dd className="font-mono text-xs text-slate-600">
              {review.extractionRun?.documentEngine ?? review.sourcePrecedenceAttempted ?? "—"}
            </dd>
            <dt className="text-slate-500">Blokkeringer</dt>
            <dd className="font-medium text-amber-700">
              {review.blockingRuleCodes.length > 0
                ? review.blockingRuleCodes.join(", ")
                : "Ingen"}
            </dd>
          </dl>
          {review.latestActionNote && (
            <p className="mt-3 text-sm text-slate-500">
              <span className="font-medium">Siste notat:</span> {review.latestActionNote}
            </p>
          )}
          {!pdfDecision?.preflightSignals?.hasReliableTextLayer && pdfDecision?.odlEnabled === false ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Dokumentet ser ut til å mangle pålitelig tekstlag, og OpenDataLoader er deaktivert.
              En refresh kan derfor fortsatt gi 0 verdier til unified-løypa.
            </div>
          ) : null}
        </div>

        {/* Validation issues — collapsed behind "Se mer" by default */}
        {issues.length > 0 && (
          <div className="rounded-lg border border-[rgba(15,23,42,0.08)] bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
                Valideringsfeil ({issues.length})
              </h2>
              <button
                type="button"
                onClick={() => setShowValidationIssues((v) => !v)}
                className="shrink-0 text-xs font-medium text-[var(--px-accent)] hover:underline"
              >
                {showValidationIssues ? "Skjul" : "Se mer"}
              </button>
            </div>
            {showValidationIssues && (
              <ul className="mt-3 space-y-2">
                {issues.slice(0, 20).map((issue, i) => (
                  <li key={`${issue.id}-${i}`} className="text-sm">
                    <span
                      className={`mr-2 font-mono text-xs font-semibold ${
                        issue.severity === "ERROR"
                          ? "text-red-600"
                          : issue.severity === "WARNING"
                            ? "text-amber-600"
                            : "text-slate-500"
                      }`}
                    >
                      {issue.severity}
                    </span>
                    <span className="font-mono text-xs text-slate-500">{issue.ruleCode}</span>
                    <span className="ml-2 text-slate-700">{issue.message}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Reviewed facts — shown after accept/correct */}
        {hasReviewedFacts && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-emerald-700">
                Godkjente tall ({reviewedFacts.length})
              </h2>
              <button
                type="button"
                onClick={() => setShowReviewedFacts((v) => !v)}
                className="shrink-0 text-xs font-medium text-[var(--px-accent)] hover:underline"
              >
                {showReviewedFacts ? "Skjul" : "Se mer"}
              </button>
            </div>
            {showReviewedFacts && (
              <div className="mt-3">
                {rfIncome.length > 0 && (
                  <div className="mb-4">
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-emerald-600">
                      Resultatregnskap
                    </h3>
                    <ReviewedFactTable facts={rfIncome} />
                  </div>
                )}
                {rfBalance.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-emerald-600">
                      Balanse
                    </h3>
                    <ReviewedFactTable facts={rfBalance} />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Validation result */}
        {validationResult && (
          <div
            className={`rounded-lg border p-4 ${
              validationResult.passed
                ? "border-green-200 bg-green-50"
                : "border-red-200 bg-red-50"
            }`}
          >
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
              Valideringsresultat
            </h2>
            {validationResult.passed ? (
              <p className="text-sm font-medium text-green-700">
                Validering bestått — {validationResult.reviewedFactCount} facts klar for publisering.
                {overriddenRuleCodes.length > 0 && (
                  <span className="ml-1 text-amber-700">
                    ({overriddenRuleCodes.length} regel(er) overstyrt)
                  </span>
                )}
              </p>
            ) : (
              <>
                <p className="mb-2 text-sm font-medium text-red-700">
                  Validering feilet ({validationResult.blockingIssues.length} blokkeringer). Rett
                  verdiene, eller huk av «overstyr» for å se bort fra en regel i denne runden:
                </p>
                <ul className="space-y-1.5">
                  {validationResult.blockingIssues.map((issue, i) => (
                    <li key={i} className="flex items-start justify-between gap-3 text-sm">
                      <div className="min-w-0">
                        <span className="font-mono text-xs font-semibold text-red-600">
                          {issue.ruleCode}
                        </span>
                        <span className="ml-2 text-red-800">{issue.message}</span>
                        {(issue.expectedValue != null || issue.actualValue != null) && (
                          <span className="ml-2 font-mono text-xs text-slate-500">
                            forventet {issue.expectedValue ?? "—"}, faktisk {issue.actualValue ?? "—"}
                          </span>
                        )}
                      </div>
                      <label className="flex shrink-0 items-center gap-1.5 text-xs text-amber-700">
                        <input
                          type="checkbox"
                          checked={overriddenRuleCodes.includes(issue.ruleCode)}
                          onChange={() => toggleOverride(issue.ruleCode)}
                        />
                        Overstyr
                      </label>
                    </li>
                  ))}
                </ul>
                {overriddenRuleCodes.length > 0 && (
                  <p className="mt-2 text-xs text-amber-700">
                    {overriddenRuleCodes.length} regel(er) markert for overstyring. Trykk «Valider
                    godkjente tall» på nytt for å bekrefte før publisering.
                  </p>
                )}
              </>
            )}
            {validationResult.warnings.length > 0 && (
              <ul className="mt-2 space-y-1">
                {validationResult.warnings.map((w, i) => (
                  <li key={i} className="text-sm">
                    <span className="font-mono text-xs font-semibold text-amber-600">WARNING</span>
                    <span className="ml-2 text-amber-800">{w.message}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Document structure summary */}
        <DocumentSummaryPanel payload={payload} />

        {/* PDF Decision Engine summary */}
        <PdfDecisionPanel payload={payload} />

        {/* Notes / reason */}
        <div className="rounded-lg border border-[rgba(15,23,42,0.08)] bg-white p-4">
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">
            Notat / begrunnelse
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Påkrevd for avvis, refresh eller uleselig"
            className="w-full rounded border border-[rgba(15,23,42,0.12)] px-3 py-2 text-sm text-slate-700 placeholder-slate-400 focus:outline-none"
          />
        </div>

        {actionError && (
          <p className="rounded bg-red-50 px-4 py-2 text-sm text-red-700">{actionError}</p>
        )}

        {/* Action buttons — pending review */}
        {!isResolved && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleAccept}
              disabled={loading}
              className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              Godkjenn
            </button>
            <button
              onClick={handleCorrect}
              disabled={loading}
              className="rounded bg-[var(--px-action)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--px-action-hover)] disabled:opacity-50"
            >
              Lagre korrigeringer
            </button>
            <button
              onClick={handleReprocess}
              disabled={loading}
              className="rounded border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
            >
              Kjør refresh
            </button>
            <button
              onClick={handleReject}
              disabled={loading}
              className="rounded border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
            >
              Avvis
            </button>
            <button
              onClick={handleUnreadable}
              disabled={loading}
              className="rounded border border-[rgba(15,23,42,0.12)] bg-white px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50 disabled:opacity-50"
            >
              Uleselig
            </button>
          </div>
        )}

        {/* Reviewed facts actions — shown after accept/correct */}
        {isAccepted && hasReviewedFacts && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleValidate}
              disabled={validating || publishing}
              className="rounded border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
            >
              {validating ? "Validerer…" : "Valider godkjente tall"}
            </button>
            {canPublish && (
              <button
                onClick={handlePublish}
                disabled={publishing || validating}
                className="rounded bg-[#162233] px-4 py-2 text-sm font-medium text-white hover:bg-[#1e3044] disabled:opacity-50"
              >
                {publishing ? "Publiserer…" : "Publiser reviewed facts"}
              </button>
            )}
          </div>
        )}

        {isResolved && (
          <div className="space-y-3 rounded bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <div>
              Denne saken er avsluttet med status <strong>{review.status}</strong>.
              {isAccepted && hasReviewedFacts && (
                <>
                  {" "}
                  {review.filing.publishedSnapshotAt ? (
                    <span className="text-emerald-700">
                      Publisert {new Date(review.filing.publishedSnapshotAt).toLocaleString("nb-NO")}.
                    </span>
                  ) : (
                    <span className="text-amber-700">
                      Godkjent, men <strong>ikke publisert</strong> ennå — valider og publiser tallene
                      nedenfor.
                    </span>
                  )}
                </>
              )}
            </div>
            {isAccepted && (
              <button
                onClick={handleReopen}
                disabled={reopening}
                className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
              >
                {reopening ? "Gjenåpner…" : "Gjenåpne for redigering"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function InlineFactTable({
  title,
  statementType,
  facts,
  editableFacts,
  setEditableFacts,
  sectionColor = "blue",
}: {
  title: string;
  statementType: "INCOME_STATEMENT" | "BALANCE_SHEET" | "OTHER";
  /** DB machine facts — used only to look up the read-only "Foreslått" value. */
  facts: Fact[];
  editableFacts: EditableFact[];
  setEditableFacts: React.Dispatch<React.SetStateAction<EditableFact[]>>;
  sectionColor?: "blue" | "indigo" | "slate";
}) {
  const suggestedByKey = new Map(facts.map((f) => [f.metricKey, f]));

  const borderColor = sectionColor === "blue" ? "border-blue-400" : sectionColor === "indigo" ? "border-indigo-400" : "border-slate-400";
  const bgColor = sectionColor === "blue" ? "bg-blue-50/60" : sectionColor === "indigo" ? "bg-indigo-50/60" : "bg-slate-50/60";
  const textColor = sectionColor === "blue" ? "text-blue-800" : sectionColor === "indigo" ? "text-indigo-800" : "text-slate-700";

  // Rows belonging to this section that are not soft-deleted, ordered by the
  // canonical sequence with custom (non-canonical) rows trailing.
  const sectionRows = editableFacts
    .map((fact, index) => ({ fact, index }))
    .filter(({ fact }) => fact.statementType === statementType && !fact.deleted)
    .sort((a, b) => {
      const orderA = CANONICAL_ORDER_MAP.get(a.fact.metricKey) ?? Number.MAX_SAFE_INTEGER;
      const orderB = CANONICAL_ORDER_MAP.get(b.fact.metricKey) ?? Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;
      return a.index - b.index;
    });

  const updateAt = (index: number, patch: Partial<EditableFact>) => {
    setEditableFacts((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  };

  const softDeleteAt = (index: number) => {
    setEditableFacts((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], deleted: true };
      return next;
    });
  };

  const addRow = () => {
    setEditableFacts((prev) => [
      ...prev,
      {
        id: newEditableFactId(),
        metricKey: "",
        fiscalYear: prev[0]?.fiscalYear ?? new Date().getFullYear(),
        value: "",
        rawLabel: "",
        sourcePage: "",
        unitScale: "1",
        statementType,
        deleted: false,
        isCustom: true,
      },
    ]);
  };

  return (
    <div className="mb-6">
      <div className={`mb-3 flex items-center gap-3 border-l-4 ${borderColor} ${bgColor} rounded-r-md px-3 py-2`}>
        <h3 className={`text-sm font-bold ${textColor}`}>{title}</h3>
        <span className="text-xs text-slate-400">{sectionRows.length} rader</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[rgba(15,23,42,0.10)]">
              <th className="pb-1.5 pr-3 text-left font-medium text-slate-500">Label</th>
              <th className="pb-1.5 pr-2 text-left font-medium text-slate-400">Nøkkel</th>
              <th className="pb-1.5 pr-1 text-right font-medium text-slate-400">Foreslått</th>
              <th className="pb-1.5 pr-1 text-left font-medium text-slate-400">Manuell</th>
              <th className="pb-1.5 pr-1 text-right font-medium text-slate-700">Endelig</th>
              <th className="pb-1.5 pr-1 text-center font-medium text-slate-400">&nbsp;</th>
            </tr>
          </thead>
          <tbody>
            {sectionRows.map(({ fact, index }) => {
              const original = suggestedByKey.get(fact.metricKey);
              const suggestedStr = original ? bigintToDisplay(original.value) : "";
              const manualStr = fact.value ?? "";
              const hasManual = manualStr.trim() !== "" && manualStr.trim() !== suggestedStr;
              const effectiveStr = hasManual ? manualStr.trim() : suggestedStr;
              const isSum = SUM_KEYS.has(fact.metricKey);
              const isCanonical = CANONICAL_ORDER_MAP.has(fact.metricKey);
              const labelPlaceholder =
                METRIC_FRIENDLY_LABELS[fact.metricKey] ?? fact.metricKey ?? "Label…";

              return (
                <tr
                  key={fact.id}
                  className={`border-b border-[rgba(15,23,42,0.04)] last:border-0 hover:bg-slate-50/60 ${isSum ? "bg-slate-50/80" : ""}`}
                >
                  {/* Label — editable */}
                  <td className="py-1 pr-3">
                    <input
                      value={fact.rawLabel}
                      onChange={(e) => updateAt(index, { rawLabel: e.target.value })}
                      placeholder={labelPlaceholder}
                      className={`w-full min-w-[140px] rounded border px-1.5 py-0.5 text-xs focus:outline-none ${
                        isSum ? "font-semibold text-slate-800" : "text-slate-700"
                      } border-[rgba(15,23,42,0.10)] bg-white placeholder-slate-300 focus:border-[var(--px-accent)]`}
                    />
                  </td>

                  {/* Key — editable, with canonical-key autocomplete */}
                  <td className="py-1 pr-2">
                    <input
                      value={fact.metricKey}
                      list="canonical-metric-keys"
                      onChange={(e) => updateAt(index, { metricKey: e.target.value.trim() })}
                      placeholder="ny_nøkkel…"
                      className={`w-full min-w-[150px] rounded border px-1.5 py-0.5 font-mono text-[11px] focus:outline-none ${
                        fact.metricKey === ""
                          ? "border-amber-300 bg-amber-50 text-amber-800"
                          : isCanonical
                            ? "border-[rgba(15,23,42,0.10)] bg-white text-[var(--px-accent)]"
                            : "border-violet-300 bg-violet-50 text-violet-800"
                      } focus:border-[var(--px-accent)]`}
                    />
                    {!isCanonical && fact.metricKey !== "" && (
                      <span className="mt-0.5 block text-[9px] uppercase tracking-wide text-violet-400">
                        egendefinert
                      </span>
                    )}
                  </td>

                  {/* Suggested (machine) — read only */}
                  <td className={`py-1 pr-1 text-right font-mono tabular-nums ${hasManual ? "text-slate-300 line-through" : "text-slate-600"}`}>
                    {suggestedStr ? formatIntegerString(suggestedStr) : "—"}
                  </td>

                  {/* Manual value — editable */}
                  <td className="py-1 pr-1">
                    <input
                      value={manualStr}
                      onChange={(e) => updateAt(index, { value: e.target.value })}
                      placeholder="—"
                      className={`w-full min-w-[90px] rounded border px-1.5 py-0.5 font-mono text-xs focus:outline-none ${
                        hasManual
                          ? "border-amber-300 bg-amber-50 text-amber-800 focus:border-amber-400"
                          : "border-[rgba(15,23,42,0.10)] bg-white text-slate-600 focus:border-[var(--px-accent)]"
                      }`}
                    />
                  </td>

                  {/* Effective */}
                  <td className={`py-1 pr-1 text-right font-mono tabular-nums ${isSum ? "font-bold" : "font-medium"} ${hasManual ? "text-amber-700" : "text-[var(--px-text)]"}`}>
                    {effectiveStr ? formatIntegerString(effectiveStr) : "—"}
                  </td>

                  {/* Delete */}
                  <td className="py-1 pr-1 text-center">
                    <button
                      type="button"
                      onClick={() => softDeleteAt(index)}
                      title="Slett rad (kan angres)"
                      className="rounded px-1.5 py-0.5 text-slate-300 hover:bg-red-50 hover:text-red-500"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        onClick={addRow}
        className="mt-2 rounded-lg border border-dashed border-[rgba(15,23,42,0.20)] px-3 py-1 text-xs font-medium text-slate-500 hover:border-[var(--px-accent)] hover:text-[var(--px-accent)]"
      >
        ＋ Legg til rad
      </button>
    </div>
  );
}

/**
 * Tray listing soft-deleted rows with an "Angre" (undo) button each, so a
 * row deleted by mistake can be restored before saving. Deleted rows are
 * excluded from the section tables and, on save, are sent as
 * deletedMetricKeys to drop the machine-extracted fact.
 */
function DeletedRowsTray({
  editableFacts,
  setEditableFacts,
}: {
  editableFacts: EditableFact[];
  setEditableFacts: React.Dispatch<React.SetStateAction<EditableFact[]>>;
}) {
  const deleted = editableFacts
    .map((fact, index) => ({ fact, index }))
    .filter(({ fact }) => fact.deleted);

  const [open, setOpen] = useState(false);

  if (deleted.length === 0) return null;

  const restoreAt = (index: number) => {
    setEditableFacts((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], deleted: false };
      return next;
    });
  };

  return (
    <div className="mb-6 rounded-lg border border-dashed border-red-200 bg-red-50/40 p-3">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-red-400">
          Slettede rader ({deleted.length})
        </h4>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="shrink-0 text-xs font-medium text-[var(--px-accent)] hover:underline"
        >
          {open ? "Skjul" : "Se mer"}
        </button>
      </div>
      {open && (
      <ul className="mt-2 space-y-1">
        {deleted.map(({ fact, index }) => (
          <li
            key={fact.id}
            className="flex items-center justify-between gap-3 rounded bg-white/70 px-2 py-1 text-xs"
          >
            <span className="truncate text-slate-500">
              <span className="font-mono text-[10px] text-slate-400">{fact.metricKey || "(ingen nøkkel)"}</span>
              {fact.rawLabel ? ` · ${fact.rawLabel}` : ""}
              {fact.value ? ` · ${formatIntegerString(fact.value)}` : ""}
            </span>
            <button
              type="button"
              onClick={() => restoreAt(index)}
              className="shrink-0 rounded px-2 py-0.5 font-medium text-[var(--px-accent)] hover:bg-[var(--px-accent)]/10"
            >
              ↩ Angre
            </button>
          </li>
        ))}
      </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section-type grouping helpers for "As Reported" view
// ---------------------------------------------------------------------------

const INCOME_SECTIONS = new Set([
  "STATUTORY_INCOME",
  "SUPPLEMENTARY_INCOME",
]);
const BALANCE_SECTIONS = new Set([
  "STATUTORY_BALANCE",
  "STATUTORY_BALANCE_CONTINUATION",
  "SUPPLEMENTARY_BALANCE",
]);

/**
 * Reconstructs two year-column values from a raw PDF row's `values` array.
 *
 * The LEGACY extractor splits numbers by x-position column zones. Norwegian
 * thousands separators (space) cause a single number like "46 611 000" to
 * appear as multiple fragments: [{value:46,x:124}, {value:611000,x:208}].
 * The prior-year column starts at a distinctly higher x-position.
 *
 * Algorithm:
 * 1. Sort values by x-position.
 * 2. Find the largest x-gap — this is the column boundary between years.
 * 3. Combine fragments within each cluster into a single number using scale
 *    inference: leading fragment × 10^(ceil(digits(tail)/3)*3) + tail.
 *
 * Returns [mainYear, priorYear] (either may be null if data is absent).
 */
function reconstructYearValues(
  values: Array<{ value: number; columnIndex: number; x?: number }>,
): [number | null, number | null] {
  if (values.length === 0) return [null, null];

  const sorted = [...values].sort((a, b) => (a.x ?? a.columnIndex) - (b.x ?? b.columnIndex));

  if (sorted.length === 1) return [sorted[0].value || null, null];

  // Find largest gap between consecutive x-positions
  let maxGap = 0;
  let splitIdx = 0;
  for (let i = 1; i < sorted.length; i++) {
    const gap = (sorted[i].x ?? sorted[i].columnIndex * 100) -
                (sorted[i - 1].x ?? sorted[i - 1].columnIndex * 100);
    if (gap > maxGap) {
      maxGap = gap;
      splitIdx = i;
    }
  }

  const mainGroup = sorted.slice(0, splitIdx);
  const priorGroup = sorted.slice(splitIdx);

  function combineGroup(group: typeof sorted): number | null {
    if (group.length === 0) return null;
    if (group.length === 1) return group[0].value || null;
    // Two fragments: leading × scale + tail
    const head = group[0].value;
    const tail = group[group.length - 1].value;
    if (tail === 0) {
      // "15 000" where 000→0; use head directly or scale up if head looks un-scaled
      // If there's a middle fragment, use that to build the number
      if (group.length === 3) {
        const mid = group[1].value;
        const midDigits = mid === 0 ? 3 : Math.ceil(Math.log10(mid + 1));
        const midScale = Math.pow(10, Math.ceil(midDigits / 3) * 3);
        const tailScale = Math.pow(10, 3); // "000" = ×1000
        return head * midScale * tailScale + mid * tailScale + tail;
      }
      return head * 1000 + tail; // e.g. "15 000" → 15000
    }
    const tailDigits = Math.ceil(Math.log10(tail + 1));
    const scale = Math.pow(10, Math.ceil(tailDigits / 3) * 3);
    return head * scale + tail;
  }

  return [combineGroup(mainGroup), combineGroup(priorGroup)];
}

/**
 * Build synthetic RawRows from mappedFacts when the EXTRACTION_JSON artifact
 * pre-dates the addition of `rows` to the payload. Each unique
 * (sourceSection + normalizedLabel) combination becomes one row, with year
 * values assigned by columnIndex (0 = latest year, 1 = prior year).
 */
function buildSyntheticRows(mappedFacts: MappedFactRaw[], years: number[]): RawRow[] {
  const rowMap = new Map<string, RawRow>();

  for (const mf of mappedFacts) {
    if (mf.isDerived) continue; // derived facts don't come from a specific source row
    const rowKey = `${mf.sourceSection ?? "UNKNOWN"}__${mf.normalizedLabel ?? mf.metricKey}`;
    const yearIdx = years.indexOf(mf.fiscalYear);
    if (yearIdx < 0 || yearIdx > 1) continue; // only support 2 year columns

    if (!rowMap.has(rowKey)) {
      rowMap.set(rowKey, {
        pageNumber: mf.sourcePage ?? 0,
        sectionType: mf.sourceSection ?? "UNKNOWN",
        label: mf.rawLabel ?? mf.normalizedLabel ?? mf.metricKey,
        normalizedLabel: mf.normalizedLabel ?? mf.metricKey,
        rowText: mf.rawLabel ?? mf.normalizedLabel ?? mf.metricKey,
        unitScale: mf.unitScale ?? 1,
        confidence: mf.confidenceScore ?? 0,
        values: [],
      });
    }

    const row = rowMap.get(rowKey)!;
    // Avoid duplicates for the same year column
    if (!row.values.find((v) => v.columnIndex === yearIdx)) {
      row.values.push({ value: mf.value, columnIndex: yearIdx });
    }
  }

  return Array.from(rowMap.values());
}

/**
 * One canonical line in the standardized view: the SUM of every contributing
 * "Som rapportert" row's effective value (plus added rows), grouped by
 * scope + metric key. Read-only — the standardized view never edits; it
 * mirrors and aggregates what the reviewer entered as reported.
 */
type StandardizedTotal = {
  scope: "COMPANY" | "CONSOLIDATED";
  metricKey: string;
  main: number | null;
  prior: number | null;
  contributors: number;
};

function deriveStandardizedTotals(input: {
  extractionData: ExtractionData | null;
  facts: Fact[];
  allFacts: Fact[];
  rowEdits: Record<string, RowEdit>;
  editableFacts: EditableFact[];
  priorYearEdits: Record<string, string>;
  addedRows: AddedRow[];
  reviewScope: "COMPANY" | "CONSOLIDATED";
  fiscalYear: number;
}): Map<string, StandardizedTotal> {
  const {
    extractionData,
    facts,
    allFacts,
    rowEdits,
    editableFacts,
    priorYearEdits,
    addedRows,
    reviewScope,
    fiscalYear,
  } = input;

  const totals = new Map<string, StandardizedTotal>();
  const add = (
    scope: "COMPANY" | "CONSOLIDATED",
    metricKey: string,
    main: number | null,
    prior: number | null,
  ) => {
    if (!metricKey) return;
    if (main === null && prior === null) return;
    const k = `${scope}:${metricKey}`;
    const existing = totals.get(k);
    if (!existing) {
      totals.set(k, { scope, metricKey, main, prior, contributors: 1 });
      return;
    }
    existing.main = main === null ? existing.main : (existing.main ?? 0) + main;
    existing.prior = prior === null ? existing.prior : (existing.prior ?? 0) + prior;
    existing.contributors += 1;
  };

  const toInt = (s: string | null | undefined): number | null => {
    if (s === null || s === undefined) return null;
    const t = s.trim();
    if (t === "") return null;
    if (/^[-–—_]$/.test(t)) return 0; // nil marker
    const n = Number(t.replace(/\s/g, ""));
    return Number.isFinite(n) ? n : null;
  };

  // Helper maps (mirror AsReportedPanel).
  const mappedFacts = extractionData?.mappedFacts ?? [];
  const canonicalByLabel = new Map<string, string>();
  const priorCandidateByKey = new Map<string, { value: number; colIdx: number }>();
  for (const mf of mappedFacts) {
    const key = (mf.normalizedLabel ?? mf.rawLabel ?? "").toLowerCase().trim();
    if (key && !canonicalByLabel.has(key)) canonicalByLabel.set(key, mf.metricKey);
    if (mf.isDerived) continue;
    const colIdx = mf.rawPayload?.columnIndex ?? -1;
    const ex = priorCandidateByKey.get(mf.metricKey);
    if (!ex || colIdx > ex.colIdx) priorCandidateByKey.set(mf.metricKey, { value: mf.value, colIdx });
  }
  const dbValueByKey = new Map<string, string>();
  for (const f of facts) if (f.value !== null) dbValueByKey.set(f.metricKey, String(f.value));
  const priorValueByKey = new Map<string, string>();
  for (const [key, c] of priorCandidateByKey) priorValueByKey.set(key, String(c.value));

  const pageToScope = new Map<number, "COMPANY" | "CONSOLIDATED">();
  for (const fact of allFacts) {
    if (fact.sourcePage !== null && fact.statementScope && !pageToScope.has(fact.sourcePage)) {
      pageToScope.set(fact.sourcePage, fact.statementScope);
    }
  }
  for (const mf of mappedFacts) {
    if (mf.statementScope && typeof mf.sourcePage === "number") {
      pageToScope.set(mf.sourcePage, mf.statementScope);
    }
  }

  const priorFiscalYear = fiscalYear - 1;
  const effectiveRows = extractionData
    ? extractionData.rows.length > 0
      ? extractionData.rows
      : buildSyntheticRows(extractionData.mappedFacts, [fiscalYear, priorFiscalYear])
    : [];

  for (const row of effectiveRows) {
    const rowEdit = rowEdits[getRowId(row)];
    if (rowEdit?.deleted) continue;

    const lookupKey = (row.normalizedLabel ?? row.label ?? "").toLowerCase().trim();
    const canonicalKey = canonicalByLabel.get(lookupKey) ?? null;
    const isMapped = canonicalKey !== null;
    const selectedMetricKey = (rowEdit?.metricKey?.trim() || canonicalKey) ?? "";
    if (!selectedMetricKey) continue; // unmapped row with no assigned key
    const hasKeyOverride =
      isMapped && !!rowEdit?.metricKey && rowEdit.metricKey.trim() !== "" && rowEdit.metricKey.trim() !== canonicalKey;

    const scope = pageToScope.get(row.pageNumber) ?? reviewScope;

    const mainProposed = isMapped && canonicalKey ? dbValueByKey.get(canonicalKey) ?? null : null;
    const priorProposed = isMapped && canonicalKey ? priorValueByKey.get(canonicalKey) ?? null : null;
    const [reconMain, reconPrior] = isMapped ? [null, null] : reconstructYearValues(row.values);
    const fallbackMain = mainProposed ?? (reconMain !== null ? String(Math.round(reconMain * row.unitScale)) : null);
    const fallbackPrior = priorProposed ?? (reconPrior !== null ? String(Math.round(reconPrior * row.unitScale)) : null);

    // Manual values come from the scope-aware rowEdit (keyed by rowId), never
    // from the scope-blind editableFacts/priorYearEdits — so konsern and
    // morselskap rows sharing a metricKey sum independently.
    const mainManual = rowEdit?.mainValue ?? "";
    const priorManual = rowEdit?.priorValue ?? "";

    const effMain = mainManual.trim() !== "" ? mainManual : fallbackMain;
    const effPrior = priorManual.trim() !== "" ? priorManual : fallbackPrior;

    add(scope, selectedMetricKey, toInt(effMain), toInt(effPrior));
  }

  for (const ar of addedRows) {
    if (!ar.committed || ar.deleted) continue;
    const metricKey = ar.metricKey.trim();
    if (!metricKey) continue;
    add(ar.statementScope, metricKey, toInt(ar.mainValue), toInt(ar.priorValue));
  }

  return totals;
}

/**
 * Read-only standardized view: shows the summed-per-key totals derived from
 * "Som rapportert". No inputs — to change a number, edit it as reported.
 */
function StandardizedSummary({
  totals,
  mainYear,
  priorYear,
}: {
  totals: Map<string, StandardizedTotal>;
  mainYear: number;
  priorYear: number;
}) {
  const [showPrior, setShowPrior] = useState(false);
  // Keys take a lot of horizontal room and aren't needed for reading the
  // numbers, so hide the Nøkkel column by default.
  const [showKeys, setShowKeys] = useState(false);

  if (totals.size === 0) {
    return (
      <p className="py-6 text-center text-xs text-slate-400">
        Ingen tall ført ennå. Fyll inn verdier i «Som rapportert» — de summeres
        hit per nøkkel.
      </p>
    );
  }

  const scopes = Array.from(new Set(Array.from(totals.values(), (t) => t.scope)));
  scopes.sort((a, b) => (a === "CONSOLIDATED" ? 0 : 1) - (b === "CONSOLIDATED" ? 0 : 1));

  const renderSection = (
    scope: "COMPANY" | "CONSOLIDATED",
    title: string,
    orderedKeys: string[],
    borderColor: string,
  ) => {
    const canonicalRows = orderedKeys
      .map((key) => ({ key, total: totals.get(`${scope}:${key}`) }))
      .filter((r): r is { key: string; total: StandardizedTotal } => !!r.total);
    const customRows = Array.from(totals.values())
      .filter(
        (t) =>
          t.scope === scope &&
          !orderedKeys.includes(t.metricKey) &&
          !CANONICAL_ORDER_MAP.has(t.metricKey),
      )
      .map((t) => ({ key: t.metricKey, total: t }));
    const rows = [...canonicalRows, ...customRows];
    if (rows.length === 0) return null;

    return (
      <div className="mb-4">
        <div className={`mb-2 rounded-r-md border-l-4 ${borderColor} bg-slate-50/60 px-3 py-1.5`}>
          <h4 className="text-xs font-bold uppercase tracking-wide text-slate-600">{title}</h4>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[rgba(15,23,42,0.10)]">
              <th className="pb-1.5 pr-3 text-left font-medium text-slate-500">Label</th>
              {showKeys && (
                <th className="pb-1.5 pr-2 text-left font-medium text-slate-400">Nøkkel</th>
              )}
              <th className="whitespace-nowrap pb-1.5 pr-1 text-right font-medium text-slate-700">{mainYear}</th>
              {showPrior && (
                <th className="whitespace-nowrap pb-1.5 pr-1 text-right font-medium text-slate-400">{priorYear}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ key, total }) => {
              const isSum = SUM_KEYS.has(key);
              const friendly = METRIC_FRIENDLY_LABELS[key] ?? key;
              const isCustom = !CANONICAL_ORDER_MAP.has(key);
              return (
                <tr
                  key={key}
                  className={`border-b border-[rgba(15,23,42,0.04)] last:border-0 ${isSum ? "bg-slate-50/80" : ""}`}
                >
                  <td className={`py-1.5 pr-3 ${isSum ? "font-semibold text-slate-800" : "text-slate-700"}`}>
                    {friendly}
                    {total.contributors > 1 && (
                      <span className="ml-1.5 text-[10px] text-slate-400">
                        (sum av {total.contributors} rader)
                      </span>
                    )}
                  </td>
                  {showKeys && (
                    <td className={`max-w-[180px] truncate py-1.5 pr-2 font-mono text-[10px] ${isCustom ? "text-violet-500" : "text-slate-400"}`}>
                      {key}
                    </td>
                  )}
                  <td className={`whitespace-nowrap py-1.5 pr-1 text-right font-mono tabular-nums ${isSum ? "font-bold" : "font-medium"} text-[var(--px-text)]`}>
                    {total.main !== null ? formatIntegerString(total.main) : "—"}
                  </td>
                  {showPrior && (
                    <td className="whitespace-nowrap py-1.5 pr-1 text-right font-mono tabular-nums text-slate-500">
                      {total.prior !== null ? formatIntegerString(total.prior) : "—"}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="mb-2 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setShowKeys((v) => !v)}
          className="rounded border border-[rgba(15,23,42,0.10)] bg-white px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-50"
        >
          {showKeys ? "Skjul nøkkel" : "Vis nøkkel"}
        </button>
        <button
          type="button"
          onClick={() => setShowPrior((v) => !v)}
          className="rounded border border-[rgba(15,23,42,0.10)] bg-white px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-50"
        >
          {showPrior ? `Skjul ${priorYear}` : `Vis ${priorYear}`}
        </button>
      </div>
      {scopes.map((scope) => (
        <div key={scope} className="mb-4">
          {scopes.length > 1 && (
            <div className="mb-2 flex items-center gap-2">
              <span
                className={`rounded px-2 py-0.5 text-xs font-semibold ${
                  scope === "CONSOLIDATED" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600"
                }`}
              >
                {scope === "CONSOLIDATED" ? "Konsern" : "Selskap"}
              </span>
            </div>
          )}
          {renderSection(scope, "Resultatregnskap", INCOME_METRIC_ORDER, "border-blue-400")}
          {renderSection(scope, "Balanse", BALANCE_METRIC_ORDER, "border-indigo-400")}
        </div>
      ))}
    </div>
  );
}

function sectionLabel(sectionType: string): string {
  const map: Record<string, string> = {
    STATUTORY_INCOME: "Resultatregnskap (offisiell)",
    SUPPLEMENTARY_INCOME: "Resultatregnskap (tillegg)",
    STATUTORY_BALANCE: "Balanse (offisiell)",
    STATUTORY_BALANCE_CONTINUATION: "Balanse forts.",
    SUPPLEMENTARY_BALANCE: "Balanse (tillegg)",
    NOTE: "Noteopplysninger",
    AUDITOR_REPORT: "Revisorberetning",
    BOARD_REPORT: "Styrets beretning",
    COVER: "Forside",
  };
  return map[sectionType] ?? sectionType;
}

/**
 * Renders all extracted rows from the EXTRACTION_JSON artifact, grouped by
 * document section, with year-column pivoting and canonical-mapping hints.
 *
 * Falls back to synthesizing rows from mappedFacts when the artifact pre-dates
 * the addition of `rows` to the payload (older filings).
 */
function AsReportedPanel({
  data,
  fiscalYear,
  facts,
  allFacts,
  primaryScope,
  editableFacts,
  setEditableFacts,
  priorYearEdits,
  setPriorYearEdits,
  rowEdits,
  setRowEdits,
  addedRows,
  setAddedRows,
  customKeys,
  addCustomKey,
}: {
  data: ExtractionData;
  fiscalYear: number;
  facts: Fact[];
  allFacts: Fact[];
  primaryScope: "COMPANY" | "CONSOLIDATED";
  editableFacts: EditableFact[];
  setEditableFacts: React.Dispatch<React.SetStateAction<EditableFact[]>>;
  priorYearEdits: Record<string, string>;
  setPriorYearEdits: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  rowEdits: Record<string, RowEdit>;
  setRowEdits: React.Dispatch<React.SetStateAction<Record<string, RowEdit>>>;
  addedRows: AddedRow[];
  setAddedRows: React.Dispatch<React.SetStateAction<AddedRow[]>>;
  customKeys: CustomKeyState;
  addCustomKey: (category: MetricCategory, key: string) => void;
}) {
  const [showPriorYear, setShowPriorYear] = useState(false);
  const { rows, mappedFacts } = data;

  // Label → canonical metricKey (first match wins)
  const canonicalByLabel = new Map<string, string>();
  for (const mf of mappedFacts) {
    const key = (mf.normalizedLabel ?? mf.rawLabel ?? "").toLowerCase().trim();
    if (key && !canonicalByLabel.has(key)) {
      canonicalByLabel.set(key, mf.metricKey);
    }
  }

  // DB facts: correct main-year values (assembled by the pipeline)
  const dbValueByKey = new Map<string, string>();
  for (const f of facts) {
    if (f.value !== null) dbValueByKey.set(f.metricKey, String(f.value));
  }

  // Prior year: for each metricKey, pick the mappedFact with the HIGHEST columnIndex.
  // The LEGACY engine splits numbers by space (thousands separator), producing multiple
  // entries per metricKey. The rightmost column (max colIdx) holds the prior-year value.
  const priorCandidateByKey = new Map<string, { value: number; colIdx: number }>();
  for (const mf of mappedFacts) {
    if (mf.isDerived) continue;
    const colIdx = mf.rawPayload?.columnIndex ?? -1;
    const existing = priorCandidateByKey.get(mf.metricKey);
    if (!existing || colIdx > existing.colIdx) {
      priorCandidateByKey.set(mf.metricKey, { value: mf.value, colIdx });
    }
  }
  const priorValueByKey = new Map<string, string>();
  for (const [key, candidate] of priorCandidateByKey) {
    priorValueByKey.set(key, String(candidate.value));
  }

  // Confidence by metricKey (from DB facts)
  const confidenceByKey = new Map<string, number>();
  for (const f of facts) {
    if (f.confidenceScore !== null) confidenceByKey.set(f.metricKey, f.confidenceScore);
  }

  // Precedence source per metricKey (first seen wins: STATUTORY_NOK, NOTE_DERIVED, etc.)
  const precedenceByKey = new Map<string, string>();
  for (const mf of mappedFacts) {
    if (mf.precedence && !precedenceByKey.has(mf.metricKey)) {
      precedenceByKey.set(mf.metricKey, mf.precedence);
    }
  }

  const mainYear = fiscalYear;
  const priorYear = fiscalYear - 1;

  const isSynthetic = rows.length === 0 && mappedFacts.length > 0;
  const yearsInData = Array.from(new Set(mappedFacts.map((f) => f.fiscalYear))).sort(
    (a, b) => b - a,
  );
  const effectiveRows = isSynthetic ? buildSyntheticRows(mappedFacts, yearsInData) : rows;

  const incomeRows = effectiveRows
    .filter((r) => INCOME_SECTIONS.has(r.sectionType))
    .sort((a, b) => a.pageNumber - b.pageNumber);
  const balanceRows = effectiveRows
    .filter((r) => BALANCE_SECTIONS.has(r.sectionType))
    .sort((a, b) => a.pageNumber - b.pageNumber);
  const otherRows = effectiveRows
    .filter((r) => !INCOME_SECTIONS.has(r.sectionType) && !BALANCE_SECTIONS.has(r.sectionType))
    .sort((a, b) => a.pageNumber - b.pageNumber);

  // Build page → scope map. Priority: EXTRACTION_JSON mappedFacts (same extraction run,
  // most authoritative) > DB facts (may lag or differ if reprocessed separately).
  // This lets us detect when the PDF contains both a konsern and a morselskap table,
  // and split them into separate sections so the user can see the difference clearly.
  const pageToScope = new Map<number, "COMPANY" | "CONSOLIDATED">();
  // Seed from DB facts first (fallback for pages without mapped facts)
  for (const fact of allFacts) {
    if (fact.sourcePage !== null && fact.statementScope && !pageToScope.has(fact.sourcePage)) {
      pageToScope.set(fact.sourcePage, fact.statementScope);
    }
  }
  // Override with EXTRACTION_JSON mappedFacts — these carry the scope from the
  // same pipeline run as the rows, so they are the most reliable source.
  for (const mf of data.mappedFacts) {
    if (mf.statementScope && typeof mf.sourcePage === "number") {
      pageToScope.set(mf.sourcePage, mf.statementScope);
    }
  }

  function splitByScope(rows: RawRow[]): {
    konsern: RawRow[];
    selskap: RawRow[];
    isMulti: boolean;
  } {
    const konsern: RawRow[] = [];
    const selskap: RawRow[] = [];
    const unscoped: RawRow[] = [];
    for (const r of rows) {
      const scope = pageToScope.get(r.pageNumber);
      if (scope === "CONSOLIDATED") konsern.push(r);
      else if (scope === "COMPANY") selskap.push(r);
      else unscoped.push(r);
    }
    const isMulti = konsern.length > 0 && selskap.length > 0;
    if (isMulti && unscoped.length > 0) {
      // Attach unscoped rows to the section with the nearest preceding page
      for (const r of unscoped) {
        const nearestKonsern = konsern.length > 0 ? Math.abs(r.pageNumber - konsern[konsern.length - 1].pageNumber) : Infinity;
        const nearestSelskap = selskap.length > 0 ? Math.abs(r.pageNumber - selskap[selskap.length - 1].pageNumber) : Infinity;
        (nearestKonsern <= nearestSelskap ? konsern : selskap).push(r);
      }
      konsern.sort((a, b) => a.pageNumber - b.pageNumber);
      selskap.sort((a, b) => a.pageNumber - b.pageNumber);
    }
    return { konsern, selskap, isMulti };
  }

  const incomeSplit = splitByScope(incomeRows);
  const balanceSplit = splitByScope(balanceRows);

  if (effectiveRows.length === 0) {
    return (
      <div className="py-4 space-y-2">
        <p className="text-xs text-slate-400">
          Ingen ekstraherte rader funnet i EXTRACTION_JSON.
        </p>
        {mappedFacts.length === 0 && (
          <p className="text-xs text-slate-300">
            Artefaktet inneholder heller ingen mappede facts. Filen kan mangle data eller være fra
            en eldre versjon av ekstraheringspipelinen.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {isSynthetic && (
        <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          <strong>Fallback-visning:</strong> Denne rapportfilen ble behandlet med en eldre versjon
          av ekstraheringspipelinen som ikke lagret rådata-rader. Viser kun{" "}
          <em>kanonisk-mappede</em> linjer ({mappedFacts.filter((f) => !f.isDerived).length} stk) —
          umappede linjer er ikke tilgjengelig.
        </div>
      )}

      {!isSynthetic && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-slate-400">
            Foreslåtte tall hentes fra ekstraheringen. Fyll inn manuell verdi for å overstyre — endelig tall er det som lagres.
          </p>
          <button
            onClick={() => setShowPriorYear((v) => !v)}
            className="shrink-0 rounded border border-[rgba(15,23,42,0.10)] bg-white px-2 py-1 text-xs text-slate-500 hover:bg-slate-50"
          >
            {showPriorYear ? `Skjul ${priorYear}` : `Vis ${priorYear}`}
          </button>
        </div>
      )}

      {incomeRows.length > 0 && (
        incomeSplit.isMulti ? (
          <>
            <AsReportedSection
              title="Resultatregnskap — Konsern"
              rows={incomeSplit.konsern}
              scopeTag="CONSOLIDATED"
              canonicalByLabel={canonicalByLabel}
              dbValueByKey={dbValueByKey}
              priorValueByKey={priorValueByKey}
              confidenceByKey={confidenceByKey}
              precedenceByKey={precedenceByKey}
              mainYear={mainYear}
              priorYear={priorYear}
              showPriorYear={showPriorYear}
              editableFacts={editableFacts}
              setEditableFacts={setEditableFacts}
              priorYearEdits={priorYearEdits}
              setPriorYearEdits={setPriorYearEdits}
              rowEdits={rowEdits}
              setRowEdits={setRowEdits}
              customKeys={customKeys}
              addCustomKey={addCustomKey}
              addedRows={addedRows}
              setAddedRows={setAddedRows}
            />
            <AsReportedSection
              title="Resultatregnskap — Morselskap"
              rows={incomeSplit.selskap}
              scopeTag="COMPANY"
              canonicalByLabel={canonicalByLabel}
              dbValueByKey={dbValueByKey}
              priorValueByKey={priorValueByKey}
              confidenceByKey={confidenceByKey}
              precedenceByKey={precedenceByKey}
              mainYear={mainYear}
              priorYear={priorYear}
              showPriorYear={showPriorYear}
              editableFacts={editableFacts}
              setEditableFacts={setEditableFacts}
              priorYearEdits={priorYearEdits}
              setPriorYearEdits={setPriorYearEdits}
              rowEdits={rowEdits}
              setRowEdits={setRowEdits}
              customKeys={customKeys}
              addCustomKey={addCustomKey}
              addedRows={addedRows}
              setAddedRows={setAddedRows}
            />
          </>
        ) : (
          <>
            <div className="mb-2 flex items-center gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-700">
              <span className="font-semibold">OBS:</span>
              <span>Systemet klarte ikke å skille konsern- og morselskaprader automatisk. Radene under kan inneholde begge oppstillinger blandet — bruk PDF-en til venstre for å identifisere riktig scope.</span>
            </div>
            <AsReportedSection
              title="Resultatregnskap"
              rows={incomeRows}
              canonicalByLabel={canonicalByLabel}
              dbValueByKey={dbValueByKey}
              priorValueByKey={priorValueByKey}
              confidenceByKey={confidenceByKey}
              precedenceByKey={precedenceByKey}
              mainYear={mainYear}
              priorYear={priorYear}
              showPriorYear={showPriorYear}
              editableFacts={editableFacts}
              setEditableFacts={setEditableFacts}
              priorYearEdits={priorYearEdits}
              setPriorYearEdits={setPriorYearEdits}
              rowEdits={rowEdits}
              setRowEdits={setRowEdits}
              customKeys={customKeys}
              addCustomKey={addCustomKey}
              addedRows={addedRows}
              setAddedRows={setAddedRows}
            />
          </>
        )
      )}

      {balanceRows.length > 0 && (
        balanceSplit.isMulti ? (
          <>
            <AsReportedSection
              title="Balanse — Konsern"
              rows={balanceSplit.konsern}
              scopeTag="CONSOLIDATED"
              canonicalByLabel={canonicalByLabel}
              dbValueByKey={dbValueByKey}
              priorValueByKey={priorValueByKey}
              confidenceByKey={confidenceByKey}
              precedenceByKey={precedenceByKey}
              mainYear={mainYear}
              priorYear={priorYear}
              showPriorYear={showPriorYear}
              editableFacts={editableFacts}
              setEditableFacts={setEditableFacts}
              priorYearEdits={priorYearEdits}
              setPriorYearEdits={setPriorYearEdits}
              rowEdits={rowEdits}
              setRowEdits={setRowEdits}
              customKeys={customKeys}
              addCustomKey={addCustomKey}
              addedRows={addedRows}
              setAddedRows={setAddedRows}
            />
            <AsReportedSection
              title="Balanse — Morselskap"
              rows={balanceSplit.selskap}
              scopeTag="COMPANY"
              canonicalByLabel={canonicalByLabel}
              dbValueByKey={dbValueByKey}
              priorValueByKey={priorValueByKey}
              confidenceByKey={confidenceByKey}
              precedenceByKey={precedenceByKey}
              mainYear={mainYear}
              priorYear={priorYear}
              showPriorYear={showPriorYear}
              editableFacts={editableFacts}
              setEditableFacts={setEditableFacts}
              priorYearEdits={priorYearEdits}
              setPriorYearEdits={setPriorYearEdits}
              rowEdits={rowEdits}
              setRowEdits={setRowEdits}
              customKeys={customKeys}
              addCustomKey={addCustomKey}
              addedRows={addedRows}
              setAddedRows={setAddedRows}
            />
          </>
        ) : (
          <AsReportedSection
            title="Balanse"
            rows={balanceRows}
            canonicalByLabel={canonicalByLabel}
            dbValueByKey={dbValueByKey}
            priorValueByKey={priorValueByKey}
            confidenceByKey={confidenceByKey}
            precedenceByKey={precedenceByKey}
            mainYear={mainYear}
            priorYear={priorYear}
            showPriorYear={showPriorYear}
            editableFacts={editableFacts}
            setEditableFacts={setEditableFacts}
            priorYearEdits={priorYearEdits}
            setPriorYearEdits={setPriorYearEdits}
            rowEdits={rowEdits}
            setRowEdits={setRowEdits}
            customKeys={customKeys}
            addCustomKey={addCustomKey}
            addedRows={addedRows}
            setAddedRows={setAddedRows}
          />
        )
      )}

      {otherRows.length > 0 && (
        <AsReportedSection
          title="Noter og øvrige"
          rows={otherRows}
          canonicalByLabel={canonicalByLabel}
          dbValueByKey={dbValueByKey}
          priorValueByKey={priorValueByKey}
          confidenceByKey={confidenceByKey}
          precedenceByKey={precedenceByKey}
          mainYear={mainYear}
          priorYear={priorYear}
          showPriorYear={showPriorYear}
          editableFacts={editableFacts}
          setEditableFacts={setEditableFacts}
          priorYearEdits={priorYearEdits}
          setPriorYearEdits={setPriorYearEdits}
          rowEdits={rowEdits}
          setRowEdits={setRowEdits}
          customKeys={customKeys}
          addCustomKey={addCustomKey}
          addedRows={addedRows}
          setAddedRows={setAddedRows}
        />
      )}

      {/* Manually added rows — for lines the model missed entirely. */}
      <AddedRowsPanel
        addedRows={addedRows}
        setAddedRows={setAddedRows}
        mainYear={mainYear}
        priorYear={priorYear}
        showPriorYear={showPriorYear}
        defaultScope={primaryScope}
        customKeys={customKeys}
        addCustomKey={addCustomKey}
      />

      {/* Deleted-rows tray with undo. Covers both extracted rows soft-deleted
          via rowEdits and manually-added rows that were removed. */}
      <DeletedAsReportedTray
        effectiveRows={effectiveRows}
        rowEdits={rowEdits}
        setRowEdits={setRowEdits}
        addedRows={addedRows}
        setAddedRows={setAddedRows}
      />

      <p className="text-[10px] text-slate-300">
        {effectiveRows.length} rader totalt · motor: {data.engine ?? "—"} / {data.mode ?? "—"}
        {isSynthetic && " · (syntetisert fra mappedFacts)"}
      </p>
    </div>
  );
}

/**
 * Panel for rows the reviewer adds manually because the model never produced
 * them. Each row has an editable label, a free-text (canonical-autocompleted)
 * key, and value field(s). Rows can be deleted (and restored from the tray).
 */
function AddedRowsPanel({
  addedRows,
  setAddedRows,
  mainYear,
  priorYear,
  showPriorYear,
  defaultScope,
  customKeys,
  addCustomKey,
}: {
  addedRows: AddedRow[];
  setAddedRows: React.Dispatch<React.SetStateAction<AddedRow[]>>;
  mainYear: number;
  priorYear: number;
  showPriorYear: boolean;
  /** Default konsern/selskap for new rows — the review's primary scope. */
  defaultScope: "COMPANY" | "CONSOLIDATED";
  customKeys: CustomKeyState;
  addCustomKey: (category: MetricCategory, key: string) => void;
}) {
  // Only rows still being composed show in this tray. Once committed they
  // move into their statement section.
  const visible = addedRows.filter((r) => !r.deleted && !r.committed);

  const update = (id: string, patch: Partial<AddedRow>) =>
    setAddedRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const add = (statementType: AddedRow["statementType"]) =>
    setAddedRows((prev) => [
      ...prev,
      {
        id: newEditableFactId(),
        label: "",
        metricKey: "",
        mainValue: "",
        priorValue: "",
        statementType,
        statementScope: defaultScope,
        committed: false,
        deleted: false,
      },
    ]);

  return (
    <div className="mb-4 rounded-r-lg border border-[rgba(15,23,42,0.06)] border-l-4 border-l-violet-300 bg-violet-50/30 px-3 py-2.5">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-bold text-violet-800">Manuelt lagt til rader</h3>
        <span className="text-xs text-slate-400">{visible.length} rader</span>
      </div>

      {visible.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[rgba(15,23,42,0.08)]">
                <th className="pb-1.5 pr-2 text-left font-medium text-slate-400">Label</th>
                <th className="pb-1.5 pr-1 text-left font-medium text-slate-400">Nøkkel</th>
                <th className="pb-1.5 pr-1 text-left font-medium text-slate-400">Scope</th>
                <th className="pb-1.5 pr-1 text-left font-medium text-slate-400">Oppstilling</th>
                <th className="pb-1.5 pr-1 text-left font-medium text-slate-400">Verdi {mainYear}</th>
                {showPriorYear && (
                  <th className="pb-1.5 pr-1 text-left font-medium text-slate-400">Verdi {priorYear}</th>
                )}
                <th className="pb-1.5 pr-1 text-center font-medium text-slate-400">&nbsp;</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                return (
                  <tr key={r.id} className="border-b border-[rgba(15,23,42,0.04)] last:border-0">
                    <td className="py-1 pr-2">
                      <input
                        value={r.label}
                        onChange={(e) => update(r.id, { label: e.target.value })}
                        placeholder="Label…"
                        className="w-full min-w-[140px] rounded border border-[rgba(15,23,42,0.10)] bg-white px-1.5 py-0.5 text-xs text-slate-700 placeholder-slate-300 focus:border-[var(--px-accent)] focus:outline-none"
                      />
                    </td>
                    <td className="py-1 pr-1">
                      <MetricKeyCombobox
                        value={r.metricKey}
                        category={r.statementType === "BALANCE_SHEET" ? "BALANCE" : "INCOME"}
                        customKeys={customKeys}
                        onAddKey={addCustomKey}
                        onChange={(key) => update(r.id, { metricKey: key })}
                        placeholder="nøkkel…"
                      />
                    </td>
                    <td className="py-1 pr-1">
                      <select
                        value={r.statementScope}
                        onChange={(e) =>
                          update(r.id, { statementScope: e.target.value as AddedRow["statementScope"] })
                        }
                        className={`rounded border px-1.5 py-0.5 text-xs focus:outline-none ${
                          r.statementScope === "CONSOLIDATED"
                            ? "border-blue-300 bg-blue-50 text-blue-700"
                            : "border-slate-300 bg-slate-50 text-slate-600"
                        } focus:border-[var(--px-accent)]`}
                      >
                        <option value="CONSOLIDATED">Konsern</option>
                        <option value="COMPANY">Selskap</option>
                      </select>
                    </td>
                    <td className="py-1 pr-1">
                      <select
                        value={r.statementType}
                        onChange={(e) =>
                          update(r.id, { statementType: e.target.value as AddedRow["statementType"] })
                        }
                        className="rounded border border-[rgba(15,23,42,0.10)] bg-white px-1.5 py-0.5 text-xs text-slate-600 focus:border-[var(--px-accent)] focus:outline-none"
                      >
                        <option value="INCOME_STATEMENT">Resultat</option>
                        <option value="BALANCE_SHEET">Balanse</option>
                      </select>
                    </td>
                    <td className="py-1 pr-1">
                      <input
                        value={r.mainValue}
                        onChange={(e) => update(r.id, { mainValue: e.target.value })}
                        placeholder="—"
                        className="w-full min-w-[90px] rounded border border-[rgba(15,23,42,0.10)] bg-white px-1.5 py-0.5 font-mono text-xs text-slate-600 focus:border-[var(--px-accent)] focus:outline-none"
                      />
                    </td>
                    {showPriorYear && (
                      <td className="py-1 pr-1">
                        <input
                          value={r.priorValue}
                          onChange={(e) => update(r.id, { priorValue: e.target.value })}
                          placeholder="—"
                          className="w-full min-w-[90px] rounded border border-[rgba(15,23,42,0.10)] bg-white px-1.5 py-0.5 font-mono text-xs text-slate-600 focus:border-[var(--px-accent)] focus:outline-none"
                        />
                      </td>
                    )}
                    <td className="py-1 pr-1 text-center whitespace-nowrap">
                      <button
                        type="button"
                        disabled={r.metricKey.trim() === ""}
                        onClick={() => update(r.id, { committed: true })}
                        title={
                          r.metricKey.trim() === ""
                            ? "Velg en nøkkel først"
                            : "Legg raden inn i regnskapet"
                        }
                        className={
                          "mr-1 rounded px-2 py-0.5 text-xs font-medium " +
                          (r.metricKey.trim() === ""
                            ? "cursor-not-allowed text-slate-300"
                            : "text-violet-600 hover:bg-violet-100/60")
                        }
                      >
                        Legg til
                      </button>
                      <button
                        type="button"
                        onClick={() => update(r.id, { deleted: true })}
                        title="Slett rad (kan angres)"
                        className="rounded px-1.5 py-0.5 text-slate-300 hover:bg-red-50 hover:text-red-500"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => add("INCOME_STATEMENT")}
          className="rounded-lg border border-dashed border-violet-300 px-3 py-1 text-xs font-medium text-violet-600 hover:bg-violet-100/50"
        >
          ＋ Resultatrad
        </button>
        <button
          type="button"
          onClick={() => add("BALANCE_SHEET")}
          className="rounded-lg border border-dashed border-violet-300 px-3 py-1 text-xs font-medium text-violet-600 hover:bg-violet-100/50"
        >
          ＋ Balanserad
        </button>
      </div>
    </div>
  );
}

/**
 * Tray listing soft-deleted rows (both extracted rows removed via rowEdits and
 * manually-added rows) with an undo button each. Nothing is lost until save.
 */
function DeletedAsReportedTray({
  effectiveRows,
  rowEdits,
  setRowEdits,
  addedRows,
  setAddedRows,
}: {
  effectiveRows: RawRow[];
  rowEdits: Record<string, RowEdit>;
  setRowEdits: React.Dispatch<React.SetStateAction<Record<string, RowEdit>>>;
  addedRows: AddedRow[];
  setAddedRows: React.Dispatch<React.SetStateAction<AddedRow[]>>;
}) {
  const deletedExtracted = effectiveRows.filter((r) => rowEdits[getRowId(r)]?.deleted);
  const deletedAdded = addedRows.filter((r) => r.deleted);
  const [open, setOpen] = useState(false);
  if (deletedExtracted.length === 0 && deletedAdded.length === 0) return null;

  const restoreExtracted = (rowId: string) =>
    setRowEdits((prev) => {
      const existing = prev[rowId];
      if (!existing) return prev;
      const { deleted, ...rest } = existing;
      void deleted;
      return { ...prev, [rowId]: rest };
    });

  const restoreAdded = (id: string) =>
    setAddedRows((prev) => prev.map((r) => (r.id === id ? { ...r, deleted: false } : r)));

  return (
    <div className="mb-4 rounded-lg border border-dashed border-red-200 bg-red-50/40 p-3">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-red-400">
          Slettede rader ({deletedExtracted.length + deletedAdded.length})
        </h4>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="shrink-0 text-xs font-medium text-[var(--px-accent)] hover:underline"
        >
          {open ? "Skjul" : "Se mer"}
        </button>
      </div>
      {open && (
      <ul className="mt-2 space-y-1">
        {deletedExtracted.map((row, idx) => {
          const rowId = getRowId(row);
          return (
            <li key={rowId + "#" + idx} className="flex items-center justify-between gap-3 rounded bg-white/70 px-2 py-1 text-xs">
              <span className="truncate text-slate-500">
                <span className="text-slate-400">s.{row.pageNumber}</span> · {row.label}
              </span>
              <button
                type="button"
                onClick={() => restoreExtracted(rowId)}
                className="shrink-0 rounded px-2 py-0.5 font-medium text-[var(--px-accent)] hover:bg-[var(--px-accent)]/10"
              >
                ↩ Angre
              </button>
            </li>
          );
        })}
        {deletedAdded.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-3 rounded bg-white/70 px-2 py-1 text-xs">
            <span className="truncate text-slate-500">
              <span className="italic text-violet-400">lagt til</span>
              {r.metricKey ? ` · ${r.metricKey}` : ""}
              {r.label ? ` · ${r.label}` : ""}
            </span>
            <button
              type="button"
              onClick={() => restoreAdded(r.id)}
              className="shrink-0 rounded px-2 py-0.5 font-medium text-[var(--px-accent)] hover:bg-[var(--px-accent)]/10"
            >
              ↩ Angre
            </button>
          </li>
        ))}
      </ul>
      )}
    </div>
  );
}

function AsReportedSection({
  title,
  rows,
  scopeTag,
  canonicalByLabel,
  dbValueByKey,
  priorValueByKey,
  confidenceByKey,
  precedenceByKey,
  mainYear,
  priorYear,
  showPriorYear,
  editableFacts,
  setEditableFacts,
  priorYearEdits,
  setPriorYearEdits,
  rowEdits,
  setRowEdits,
  customKeys,
  addCustomKey,
  addedRows,
  setAddedRows,
}: {
  title: string;
  rows: RawRow[];
  scopeTag?: "COMPANY" | "CONSOLIDATED";
  canonicalByLabel: Map<string, string>;
  dbValueByKey: Map<string, string>;
  priorValueByKey: Map<string, string>;
  confidenceByKey: Map<string, number>;
  precedenceByKey: Map<string, string>;
  mainYear: number;
  priorYear: number;
  showPriorYear: boolean;
  editableFacts: EditableFact[];
  setEditableFacts: React.Dispatch<React.SetStateAction<EditableFact[]>>;
  priorYearEdits: Record<string, string>;
  setPriorYearEdits: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  rowEdits: Record<string, RowEdit>;
  setRowEdits: React.Dispatch<React.SetStateAction<Record<string, RowEdit>>>;
  customKeys: CustomKeyState;
  addCustomKey: (category: MetricCategory, key: string) => void;
  addedRows: AddedRow[];
  setAddedRows: React.Dispatch<React.SetStateAction<AddedRow[]>>;
}) {
  // Show rows without an assigned key by default so the reviewer sees every
  // extracted line; offer hiding them instead.
  const [showUnmapped, setShowUnmapped] = useState(true);

  const isMappedRow = (r: RawRow) =>
    canonicalByLabel.has((r.normalizedLabel ?? r.label ?? "").toLowerCase().trim());

  // Category for this section's key picker — income sections only offer
  // income keys, balance sections only balance keys. Derived from the rows'
  // sectionType (all rows in a section share a family); notes fall back to
  // OTHER which offers everything.
  const sectionCategory: MetricCategory =
    rows.length > 0 && INCOME_SECTIONS.has(rows[0]!.sectionType)
      ? "INCOME"
      : rows.length > 0 && BALANCE_SECTIONS.has(rows[0]!.sectionType)
        ? "BALANCE"
        : "OTHER";

  // Hide soft-deleted rows from the table (they live in the deleted tray).
  const liveRows = rows.filter((r) => !rowEdits[getRowId(r)]?.deleted);
  const mappedCount = liveRows.filter(isMappedRow).length;
  const unmappedCount = liveRows.length - mappedCount;
  const displayRows = showUnmapped ? liveRows : liveRows.filter(isMappedRow);

  // Committed manually-added rows that belong in THIS section: the statement
  // category must match EXACTLY (an income row never lands in a balance or
  // notes section), and — when the section is scope-split — konsern/selskap
  // must match too. Sorted by the canonical order of their key.
  const sectionAddedRows = addedRows
    .filter((r) => {
      if (!r.committed || r.deleted) return false;
      const cat: MetricCategory = r.statementType === "BALANCE_SHEET" ? "BALANCE" : "INCOME";
      if (cat !== sectionCategory) return false;
      if (scopeTag && r.statementScope !== scopeTag) return false;
      return true;
    })
    .sort(
      (a, b) =>
        (CANONICAL_ORDER_MAP.get(a.metricKey) ?? Number.MAX_SAFE_INTEGER) -
        (CANONICAL_ORDER_MAP.get(b.metricKey) ?? Number.MAX_SAFE_INTEGER),
    );

  // Position each added row by canonical key order: it renders immediately
  // after the LAST extracted row whose canonical key order is ≤ the added
  // row's order (slot = that row's index; -1 = before all extracted rows).
  // This places e.g. depreciation_amortization right after payroll_expense.
  const orderOfExtracted = (row: RawRow): number => {
    const rowEdit = rowEdits[getRowId(row)];
    const key =
      (rowEdit?.metricKey && rowEdit.metricKey.trim()) ||
      canonicalByLabel.get((row.normalizedLabel ?? row.label ?? "").toLowerCase().trim()) ||
      "";
    return key ? CANONICAL_ORDER_MAP.get(key) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
  };
  const addedBySlot = new Map<number, AddedRow[]>();
  for (const ar of sectionAddedRows) {
    const arOrder = CANONICAL_ORDER_MAP.get(ar.metricKey) ?? Number.MAX_SAFE_INTEGER;
    let slot = -1;
    for (let i = 0; i < displayRows.length; i++) {
      if (orderOfExtracted(displayRows[i]!) <= arOrder) slot = i;
    }
    const bucket = addedBySlot.get(slot) ?? [];
    bucket.push(ar);
    addedBySlot.set(slot, bucket);
  }

  const renderAddedRow = (r: AddedRow) => {
    const updateAdded = (patch: Partial<AddedRow>) =>
      setAddedRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, ...patch } : x)));
    return (
      <tr
        key={"added-" + r.id}
        className="border-b border-[rgba(15,23,42,0.04)] last:border-0 bg-violet-50/30"
      >
        <td className="py-1 pr-2">
          <div className="flex items-center gap-1.5 border-l-2 border-violet-300 pl-2">
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400"
              title="Manuelt lagt til"
            />
            <input
              value={r.label}
              onChange={(e) => updateAdded({ label: e.target.value })}
              placeholder="Label…"
              className="w-full min-w-[130px] rounded border border-[rgba(15,23,42,0.10)] bg-white px-1.5 py-0.5 text-xs text-slate-700 placeholder-slate-300 focus:border-[var(--px-accent)] focus:outline-none"
            />
          </div>
        </td>
        <td className="py-1 pr-1">
          <span className="font-mono text-[11px] text-violet-700">{r.metricKey}</span>
        </td>
        <td className="py-1 pr-1 text-right text-slate-300">—</td>
        <td className="py-1 pr-1">
          <input
            value={r.mainValue}
            onChange={(e) => updateAdded({ mainValue: e.target.value })}
            placeholder="—"
            className="w-full min-w-[80px] rounded border border-violet-200 bg-white px-1.5 py-0.5 font-mono text-xs text-slate-700 focus:border-[var(--px-accent)] focus:outline-none"
          />
        </td>
        <td className="py-1 pr-1 text-right font-mono tabular-nums font-medium text-violet-800">
          {r.mainValue.trim() !== "" ? formatIntegerString(r.mainValue.trim()) : "—"}
        </td>
        {showPriorYear && (
          <>
            <td className="py-1 pr-1 text-right text-slate-300">—</td>
            <td className="py-1 pr-1">
              <input
                value={r.priorValue}
                onChange={(e) => updateAdded({ priorValue: e.target.value })}
                placeholder="—"
                className="w-full min-w-[80px] rounded border border-violet-200 bg-white px-1.5 py-0.5 font-mono text-xs text-slate-700 focus:border-[var(--px-accent)] focus:outline-none"
              />
            </td>
            <td className="py-1 pr-1 text-right font-mono tabular-nums font-medium text-violet-800">
              {r.priorValue.trim() !== "" ? formatIntegerString(r.priorValue.trim()) : "—"}
            </td>
          </>
        )}
        <td className="py-1 pr-1 text-right">
          <span className="rounded bg-violet-100 px-1 py-0.5 text-[9px] uppercase tracking-wide text-violet-500">
            lagt til
          </span>
        </td>
        <td className="py-1 pr-1 text-right font-mono text-slate-300">—</td>
        <td className="py-1 text-center">
          <button
            type="button"
            onClick={() => updateAdded({ deleted: true })}
            title="Slett rad (kan angres)"
            className="rounded px-1.5 py-0.5 text-slate-300 hover:bg-red-50 hover:text-red-500"
          >
            ✕
          </button>
        </td>
      </tr>
    );
  };

  const scopeLabel = scopeTag === "CONSOLIDATED" ? "Konsern" : scopeTag === "COMPANY" ? "Morselskap" : null;
  const scopePillClass = scopeTag === "CONSOLIDATED"
    ? "bg-blue-100 text-blue-700"
    : scopeTag === "COMPANY"
      ? "bg-slate-100 text-slate-600"
      : "";
  const borderClass = scopeTag === "CONSOLIDATED"
    ? "border-l-4 border-blue-400"
    : scopeTag === "COMPANY"
      ? "border-l-4 border-slate-300"
      : "border-l-4 border-slate-200";

  return (
    <div className="mb-4">
      <div className={`mb-2 flex items-center justify-between gap-2 rounded-r-lg border border-[rgba(15,23,42,0.06)] bg-slate-50 px-3 py-2.5 ${borderClass}`}>
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-slate-800">{title}</h3>
          {scopeLabel && (
            <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${scopePillClass}`}>
              {scopeLabel}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-slate-500">{mappedCount} mappede</span>
          {unmappedCount > 0 && (
            <button
              onClick={() => setShowUnmapped((v) => !v)}
              className={`rounded border px-2 py-0.5 transition-colors ${
                showUnmapped
                  ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
                  : "border-[rgba(15,23,42,0.10)] bg-white text-slate-400 hover:bg-slate-50"
              }`}
            >
              {showUnmapped ? `Skjul umappede (${unmappedCount})` : `+ Vis ${unmappedCount} umappede`}
            </button>
          )}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[rgba(15,23,42,0.08)]">
              <th className="pb-1.5 pr-2 text-left font-medium text-slate-400">Label (rapportert)</th>
              <th className="pb-1.5 pr-1 text-left font-medium text-slate-400">Nøkkel</th>
              <th className="pb-1.5 pr-1 text-right font-medium text-slate-400">Foreslått {mainYear}</th>
              <th className="pb-1.5 pr-1 text-left font-medium text-slate-400">Manuell {mainYear}</th>
              <th className="pb-1.5 pr-1 text-right font-medium text-emerald-600">Endelig {mainYear}</th>
              {showPriorYear && (
                <>
                  <th className="pb-1.5 pr-1 text-right font-medium text-slate-400">Foreslått {priorYear}</th>
                  <th className="pb-1.5 pr-1 text-left font-medium text-slate-400">Manuell {priorYear}</th>
                  <th className="pb-1.5 pr-1 text-right font-medium text-emerald-600">Endelig {priorYear}</th>
                </>
              )}
              <th className="pb-1.5 pr-1 text-right font-medium text-slate-400">Side</th>
              <th className="pb-1.5 pr-1 text-right font-medium text-slate-400">Conf</th>
              <th className="pb-1.5 text-center font-medium text-slate-400">&nbsp;</th>
            </tr>
          </thead>
          <tbody>
            {/* Added rows that sort before every extracted row. */}
            {(addedBySlot.get(-1) ?? []).map((r) => renderAddedRow(r))}
            {displayRows.map((row, i) => {
              const lookupKey = (row.normalizedLabel ?? row.label ?? "").toLowerCase().trim();
              const canonicalKey = canonicalByLabel.get(lookupKey) ?? null;
              const isMapped = canonicalKey !== null;
              const rowId = getRowId(row);
              const rowEdit = rowEdits[rowId] ?? {
                metricKey: "",
                mainValue: "",
                priorValue: "",
                sourceMetricKey: canonicalKey,
              };
              const selectedMetricKey = rowEdit.metricKey || canonicalKey || "";
              const hasKeyOverride =
                isMapped && canonicalKey !== null && selectedMetricKey !== "" && selectedMetricKey !== canonicalKey;

              const mainProposed = isMapped && canonicalKey
                ? (dbValueByKey.get(canonicalKey) ?? null)
                : null;
              const priorProposed = isMapped && canonicalKey
                ? (priorValueByKey.get(canonicalKey) ?? null)
                : null;
              const [reconstructedMain, reconstructedPrior] = isMapped
                ? [null, null]
                : reconstructYearValues(row.values);

              const fallbackMainValue = mainProposed ?? (
                reconstructedMain !== null
                  ? String(Math.round(reconstructedMain * row.unitScale))
                  : null
              );
              const fallbackPriorValue = priorProposed ?? (
                reconstructedPrior !== null
                  ? String(Math.round(reconstructedPrior * row.unitScale))
                  : null
              );

              // Manual values for mapped rows live in rowEdits, keyed by the
              // per-row rowId (which includes pageNumber+values, so a konsern
              // and a morselskap row sharing the same metricKey stay distinct).
              // editableFacts is scope-blind (one slot per key) and would let a
              // konsern edit overwrite the morselskap value and vice-versa — the
              // "value reverts on save" bug. We read rowEdits first and only fall
              // back to the legacy scope-blind editableFacts slot for display.
              // Once a row has a rowEdit entry, that entry is AUTHORITATIVE: an
              // empty value means the reviewer intentionally cleared the field,
              // not "fall back to the legacy scope-blind editableFacts /
              // priorYearEdits slot". Falling back on empty made cleared fields
              // resurface a stale legacy value (the "can't clear payroll 2023"
              // bug). The legacy fallback only applies when there is NO rowEdit.
              const hasRowEdit = rowEdits[rowId] !== undefined;
              const editIdx = isMapped && canonicalKey
                ? editableFacts.findIndex((e) => e.metricKey === canonicalKey)
                : -1;
              const legacyMappedMain = editIdx >= 0 ? editableFacts[editIdx].value : "";
              const legacyMappedPrior =
                isMapped && canonicalKey ? (priorYearEdits[canonicalKey] ?? "") : "";
              const mappedMainManual = hasRowEdit
                ? (rowEdit.mainValue ?? "")
                : legacyMappedMain;
              const mappedPriorManual = hasRowEdit
                ? (rowEdit.priorValue ?? "")
                : legacyMappedPrior;
              const mainManualValue =
                hasKeyOverride || !isMapped ? rowEdit.mainValue : mappedMainManual;
              const priorManualValue =
                hasKeyOverride || !isMapped ? rowEdit.priorValue : mappedPriorManual;

              const hasMainManual =
                mainManualValue.trim() !== "" && mainManualValue.trim() !== (fallbackMainValue ?? "");
              const hasPriorManual =
                priorManualValue.trim() !== "" && priorManualValue.trim() !== (fallbackPriorValue ?? "");

              const effectiveMainValue = mainManualValue.trim() !== ""
                ? mainManualValue.trim()
                : fallbackMainValue;
              const effectivePriorValue = priorManualValue.trim() !== ""
                ? priorManualValue.trim()
                : fallbackPriorValue;

              const confidence = isMapped && canonicalKey
                ? confidenceByKey.get(canonicalKey)
                : row.confidence;
              const precedence = isMapped && canonicalKey
                ? precedenceByKey.get(canonicalKey)
                : null;

              return (
                <React.Fragment key={row.pageNumber + "-" + i}>
                <tr
                  className={`border-b border-[rgba(15,23,42,0.04)] last:border-0 hover:bg-slate-50/50 ${!isMapped ? "bg-amber-50/20" : ""}`}
                >
                  <td className="py-1 pr-2">
                    <input
                      value={rowEdit.labelOverride ?? row.label}
                      onChange={(e) => {
                        const value = e.target.value;
                        setRowEdits((prev) => ({
                          ...prev,
                          [rowId]: {
                            ...(prev[rowId] ?? {
                              metricKey: selectedMetricKey,
                              mainValue: "",
                              priorValue: "",
                              sourceMetricKey: canonicalKey,
                            }),
                            labelOverride: value,
                            statementScope: scopeTag,
                          },
                        }));
                      }}
                      className={
                        "w-full min-w-[150px] rounded border px-1.5 py-0.5 text-xs focus:outline-none border-[rgba(15,23,42,0.10)] bg-white focus:border-[var(--px-accent)] " +
                        (isMapped ? "text-slate-700" : "text-slate-500")
                      }
                    />
                  </td>

                  <td className="py-1 pr-1">
                    <div className="flex flex-col gap-1">
                      <MetricKeyCombobox
                        value={selectedMetricKey}
                        category={sectionCategory}
                        customKeys={customKeys}
                        onAddKey={addCustomKey}
                        onChange={(value) => {
                          setRowEdits((prev) => {
                            if (!value || (isMapped && value === canonicalKey)) {
                              // Reverting to the machine key — drop only the key
                              // override but keep any label/value/deleted edits.
                              const existing = prev[rowId];
                              if (!existing) return prev;
                              const cleared: RowEdit = {
                                ...existing,
                                metricKey: "",
                                sourceMetricKey: canonicalKey,
                              };
                              // If nothing else is set, remove the entry entirely.
                              if (
                                !cleared.mainValue &&
                                !cleared.priorValue &&
                                cleared.labelOverride === undefined &&
                                !cleared.deleted
                              ) {
                                return removeRowEdit(prev, rowId);
                              }
                              return { ...prev, [rowId]: cleared };
                            }
                            // Assigning a new key. The manual value for a
                            // mapped row lives in editableFacts (keyed by the
                            // canonical key), but once a key override exists the
                            // UI reads the value from rowEdit instead. Carry the
                            // currently-shown value across so it doesn't vanish.
                            const prevEdit = prev[rowId];
                            return {
                              ...prev,
                              [rowId]: {
                                ...(prevEdit ?? { mainValue: "", priorValue: "" }),
                                metricKey: value,
                                sourceMetricKey: canonicalKey,
                                statementScope: scopeTag,
                                mainValue:
                                  (prevEdit?.mainValue ?? "") !== ""
                                    ? prevEdit!.mainValue
                                    : mainManualValue,
                                priorValue:
                                  (prevEdit?.priorValue ?? "") !== ""
                                    ? prevEdit!.priorValue
                                    : priorManualValue,
                              },
                            };
                          });
                        }}
                        placeholder={isMapped ? canonicalKey ?? "" : "tildel/ny nøkkel…"}
                      />
                      {hasKeyOverride && canonicalKey && (
                        <span className="font-mono text-[10px] text-slate-400">
                          Oppr.: {canonicalKey}
                        </span>
                      )}
                      {!hasKeyOverride && precedence && precedence !== "STATUTORY_NOK" && (
                        <span className="text-[10px] text-slate-400">
                          {precedence === "NOTE_DERIVED" ? "Avledet fra note" : "Avledet fra ODL"}
                        </span>
                      )}
                    </div>
                  </td>

                  <td
                    className={
                      "py-1 pr-1 text-right font-mono tabular-nums " +
                      (hasMainManual
                        ? "text-slate-300 line-through"
                        : isMapped
                          ? "text-slate-700"
                          : "text-slate-400")
                    }
                  >
                    {fallbackMainValue !== null ? formatIntegerString(fallbackMainValue) : "—"}
                  </td>

                  <td className="py-1 pr-1">
                    {hasKeyOverride || !isMapped ? (
                      <input
                        value={mainManualValue}
                        onChange={(e) => {
                          const value = e.target.value;
                          setRowEdits((prev) => ({
                            ...prev,
                            [rowId]: {
                              ...(prev[rowId] ?? { metricKey: selectedMetricKey, priorValue: "" }),
                              metricKey: selectedMetricKey,
                              mainValue: value,
                              sourceMetricKey: canonicalKey,
                            },
                          }));
                        }}
                        placeholder="—"
                        className={
                          "w-full min-w-[80px] rounded-xl border px-1.5 py-0.5 font-mono text-xs focus:outline-none " +
                          (hasMainManual
                            ? "border-amber-300 bg-amber-50 text-amber-800"
                            : "border-[rgba(15,23,42,0.10)] bg-white text-slate-500 focus:border-[var(--px-accent)]")
                        }
                      />
                    ) : isMapped ? (
                      <input
                        value={mainManualValue}
                        onChange={(e) => {
                          const value = e.target.value;
                          // Write to rowEdits (scope-safe via rowId), NOT the
                          // scope-blind editableFacts. sourceMetricKey carries
                          // the canonical key so handleCorrect emits a correction
                          // for this exact row/scope.
                          setRowEdits((prev) => ({
                            ...prev,
                            [rowId]: {
                              ...(prev[rowId] ?? {
                                metricKey: selectedMetricKey,
                                priorValue: "",
                              }),
                              metricKey: selectedMetricKey,
                              mainValue: value,
                              sourceMetricKey: canonicalKey,
                              statementScope: scopeTag,
                            },
                          }));
                        }}
                        placeholder="—"
                        className={
                          "w-full min-w-[80px] rounded border px-1.5 py-0.5 font-mono text-xs focus:outline-none " +
                          (hasMainManual
                            ? "border-amber-300 bg-amber-50 text-amber-800"
                            : "border-[rgba(15,23,42,0.10)] bg-white text-slate-600 focus:border-[var(--px-accent)]")
                        }
                      />
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>

                  <td
                    className={
                      "py-1 pr-1 text-right font-mono tabular-nums font-medium " +
                      (hasMainManual
                        ? "text-amber-700"
                        : isMapped
                          ? "text-slate-700"
                          : "text-slate-400")
                    }
                  >
                    {effectiveMainValue !== null ? formatIntegerString(effectiveMainValue) : "—"}
                  </td>

                  {showPriorYear && (
                    <>
                      <td
                        className={
                          "py-1 pr-1 text-right font-mono tabular-nums " +
                          (hasPriorManual ? "text-slate-300 line-through" : "text-slate-400")
                        }
                      >
                        {fallbackPriorValue !== null ? formatIntegerString(fallbackPriorValue) : "—"}
                      </td>

                      <td className="py-1 pr-1">
                        {hasKeyOverride || !isMapped ? (
                          <input
                            value={priorManualValue}
                            onChange={(e) => {
                              const value = e.target.value;
                              setRowEdits((prev) => ({
                                ...prev,
                                [rowId]: {
                                  ...(prev[rowId] ?? { metricKey: selectedMetricKey, mainValue: "" }),
                                  metricKey: selectedMetricKey,
                                  priorValue: value,
                                  sourceMetricKey: canonicalKey,
                                },
                              }));
                            }}
                            placeholder="—"
                            className={
                              "w-full min-w-[80px] rounded-xl border px-1.5 py-0.5 font-mono text-xs focus:outline-none " +
                              (hasPriorManual
                                ? "border-amber-300 bg-amber-50 text-amber-800"
                                : "border-[rgba(15,23,42,0.10)] bg-white text-slate-500 focus:border-[var(--px-accent)]")
                            }
                          />
                        ) : isMapped ? (
                          <input
                            value={priorManualValue}
                            onChange={(e) => {
                              const value = e.target.value;
                              // rowEdits (scope-safe), not priorYearEdits which
                              // is keyed by metricKey only and collides across
                              // konsern/morselskap.
                              setRowEdits((prev) => ({
                                ...prev,
                                [rowId]: {
                                  ...(prev[rowId] ?? {
                                    metricKey: selectedMetricKey,
                                    mainValue: "",
                                  }),
                                  metricKey: selectedMetricKey,
                                  priorValue: value,
                                  sourceMetricKey: canonicalKey,
                                  statementScope: scopeTag,
                                },
                              }));
                            }}
                            placeholder="—"
                            className={
                              "w-full min-w-[80px] rounded border px-1.5 py-0.5 font-mono text-xs focus:outline-none " +
                              (hasPriorManual
                                ? "border-amber-300 bg-amber-50 text-amber-800"
                                : "border-[rgba(15,23,42,0.10)] bg-white text-slate-500 focus:border-[var(--px-accent)]")
                            }
                          />
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>

                      <td
                        className={
                          "py-1 pr-1 text-right font-mono tabular-nums font-medium " +
                          (hasPriorManual ? "text-amber-700" : "text-slate-400")
                        }
                      >
                        {effectivePriorValue !== null ? formatIntegerString(effectivePriorValue) : "—"}
                      </td>
                    </>
                  )}

                  <td className="py-1 pr-1 text-right font-mono text-slate-400">
                    {row.pageNumber}
                  </td>
                  <td className="py-1 pr-1 text-right font-mono text-slate-400">
                    {confidence != null ? (confidence * 100).toFixed(0) + "%" : "—"}
                  </td>
                  <td className="py-1 text-center">
                    <button
                      type="button"
                      onClick={() => {
                        setRowEdits((prev) => ({
                          ...prev,
                          [rowId]: {
                            ...(prev[rowId] ?? {
                              metricKey: selectedMetricKey,
                              mainValue: "",
                              priorValue: "",
                              sourceMetricKey: canonicalKey,
                            }),
                            deleted: true,
                          },
                        }));
                      }}
                      title="Slett rad (kan angres)"
                      className="rounded px-1.5 py-0.5 text-slate-300 hover:bg-red-50 hover:text-red-500"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
                {(addedBySlot.get(i) ?? []).map((added) => renderAddedRow(added))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type DocumentSection = {
  kind: string;
  startPage: number;
  endPage: number;
  confidenceScore: number;
  pageCount: number;
};

type DocumentDiagnostics = {
  qualityRisk?: string;
  recommendedRouteHint?: string;
  parserRiskReasons?: string[];
  extractionWarnings?: string[];
  textLayerDensityScore?: number;
};

function DocumentSummaryPanel({ payload }: { payload: Record<string, unknown> | null }) {
  const diagnostics = payload?.documentDiagnostics as DocumentDiagnostics | null | undefined;
  const sections = payload?.documentSections as DocumentSection[] | null | undefined;

  if (!diagnostics && (!sections || sections.length === 0)) return null;

  const riskColor =
    diagnostics?.qualityRisk === "HIGH"
      ? "text-red-600"
      : diagnostics?.qualityRisk === "MEDIUM"
        ? "text-amber-600"
        : "text-emerald-600";

  return (
    <div className="rounded-lg border border-[rgba(15,23,42,0.08)] bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">
        Hva systemet fant i dokumentet
      </h2>

      {diagnostics && (
        <div className="mb-3 space-y-1 text-xs">
          {diagnostics.qualityRisk && (
            <div>
              <span className="text-slate-500">Risiko: </span>
              <span className={`font-semibold ${riskColor}`}>{diagnostics.qualityRisk}</span>
              {diagnostics.recommendedRouteHint && (
                <span className="ml-2 font-mono text-slate-400">
                  ({diagnostics.recommendedRouteHint})
                </span>
              )}
            </div>
          )}
          {diagnostics.textLayerDensityScore != null && (
            <div>
              <span className="text-slate-500">Teksttetthet: </span>
              <span className="font-mono text-slate-600">
                {(diagnostics.textLayerDensityScore * 100).toFixed(0)}%
              </span>
            </div>
          )}
          {diagnostics.parserRiskReasons && diagnostics.parserRiskReasons.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-red-600">
              {diagnostics.parserRiskReasons.map((r, i) => (
                <li key={i}>⚠ {r}</li>
              ))}
            </ul>
          )}
          {diagnostics.extractionWarnings && diagnostics.extractionWarnings.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-amber-600">
              {diagnostics.extractionWarnings.map((w, i) => (
                <li key={i}>ℹ {w}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {sections && sections.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-slate-400">Seksjoner</p>
          <ul className="space-y-0.5">
            {sections.map((s, i) => (
              <li key={i} className="flex items-center gap-2 text-xs">
                <span className="w-36 font-mono text-slate-600">{s.kind}</span>
                <span className="text-slate-400">
                  s.{s.startPage}–{s.endPage}
                </span>
                <span className="text-slate-400">
                  ({(s.confidenceScore * 100).toFixed(0)}%)
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PDF Decision Panel
// ---------------------------------------------------------------------------

type PdfDecision = {
  version?: string | null;
  route?: string | null;
  risk?: string | null;
  riskLevel?: string | null;
  confidenceScore?: number | null;
  reasons?: string[] | null;
  financialFacts?: boolean | null;
  manualReviewRequired?: boolean | null;
  manualReviewReasons?: string[] | null;
  blockingRuleCodes?: string[] | null;
  odlEnabled?: boolean | null;
  engineVersion?: string | null;
  decidedAt?: string | null;
  pageHintSummary?: {
    hasReliableHints?: boolean | null;
    includePageCount?: number | null;
    excludePageCount?: number | null;
    reasons?: string[] | null;
  } | null;
  enabledExtractors?: {
    financialFacts?: boolean | null;
    boardReport?: boolean | null;
    auditorReport?: boolean | null;
    notes?: boolean | null;
  } | null;
  pageHints?: {
    hasReliableHints?: boolean | null;
    includePages?: number[] | null;
    excludePages?: number[] | null;
    preferredIncomeStatementPages?: number[] | null;
    preferredBalancePages?: number[] | null;
    notePages?: number[] | null;
    reasons?: string[] | null;
  } | null;
  diagnostics?: {
    detectedSections?: Array<{ kind?: string | null }> | null;
    missingCoreSections?: string[] | null;
  } | null;
  preflightSignals?: {
    hasTextLayer?: boolean | null;
    hasReliableTextLayer?: boolean | null;
    pageCount?: number | null;
    qualityRisk?: string | null;
    financialStatementPageCount?: number | null;
    likelyImageOnlyPageCount?: number | null;
    sectionsFound?: number | null;
    sectionKinds?: string[] | null;
    missingExpectedSections?: string[] | null;
  } | null;
};

function PdfDecisionPanel({ payload }: { payload: Record<string, unknown> | null }) {
  const decision = payload?.pdfDecision as PdfDecision | null | undefined;

  if (!decision) return null;

  decision.risk = decision.risk ?? decision.riskLevel ?? null;
  decision.financialFacts =
    decision.financialFacts ?? decision.enabledExtractors?.financialFacts ?? null;
  decision.manualReviewRequired =
    decision.manualReviewRequired ??
    (decision.route === "MANUAL_REVIEW" || Boolean(decision.manualReviewReasons?.length));

  const riskLevel = decision.riskLevel ?? decision.risk ?? null;
  const confidence =
    typeof decision.confidenceScore === "number"
      ? `${(decision.confidenceScore * 100).toFixed(0)}%`
      : "—";
  const financialFactsEnabled =
    decision.enabledExtractors?.financialFacts ?? decision.financialFacts ?? null;
  const sectionKinds =
    decision.preflightSignals?.sectionKinds ??
    decision.diagnostics?.detectedSections
      ?.map((section) => section.kind)
      .filter((kind): kind is string => typeof kind === "string") ??
    [];
  const hints = decision.pageHints
    ? {
        hasReliableHints: decision.pageHints.hasReliableHints,
        includePageCount: decision.pageHints.includePages?.length ?? null,
        excludePageCount: decision.pageHints.excludePages?.length ?? null,
        incomePageCount: decision.pageHints.preferredIncomeStatementPages?.length ?? null,
        balancePageCount: decision.pageHints.preferredBalancePages?.length ?? null,
        notePageCount: decision.pageHints.notePages?.length ?? null,
        reasons: decision.pageHints.reasons ?? [],
      }
    : decision.pageHintSummary
      ? {
          hasReliableHints: decision.pageHintSummary.hasReliableHints,
          includePageCount: decision.pageHintSummary.includePageCount ?? null,
          excludePageCount: decision.pageHintSummary.excludePageCount ?? null,
          incomePageCount: null,
          balancePageCount: null,
          notePageCount: null,
          reasons: decision.pageHintSummary.reasons ?? [],
        }
      : null;

  const riskColor =
    riskLevel === "HIGH"
      ? "text-red-600 font-semibold"
      : riskLevel === "MEDIUM"
        ? "text-amber-600 font-semibold"
        : "text-emerald-600 font-semibold";

  const routeColor =
    decision.route === "MANUAL_REVIEW"
      ? "text-red-600 font-semibold"
      : decision.route === "FORCE_OCR" || decision.route === "OPENDATALOADER_HYBRID"
        ? "text-amber-600 font-semibold"
        : "text-emerald-600 font-semibold";

  const signals = decision.preflightSignals;
  const missingReliableTextLayer = signals?.hasReliableTextLayer === false;
  const noStructuredSections = sectionKinds.length === 0;

  return (
    <div className="rounded-lg border border-[rgba(15,23,42,0.08)] bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">
        Systemets vurdering
      </h2>

      <div className="mb-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <span className="text-slate-500">Rute</span>
        <span className={routeColor}>{decision.route ?? "—"}</span>

        <span className="text-slate-500">Confidence</span>
        <span className="font-mono text-slate-600">{confidence}</span>

        <span className="text-slate-500">Risiko</span>
        <span className={riskColor}>{decision.risk ?? "—"}</span>

        <span className="text-slate-500">Finansielle seksjoner</span>
        <span className={`font-semibold ${decision.financialFacts ? "text-emerald-600" : "text-red-600"}`}>
          {decision.financialFacts === true ? "Ja" : decision.financialFacts === false ? "Nei" : "—"}
        </span>

        <span className="text-slate-500">Manuell gjennomgang</span>
        <span className={`font-semibold ${decision.manualReviewRequired ? "text-red-600" : "text-emerald-600"}`}>
          {decision.manualReviewRequired === true ? "Ja" : decision.manualReviewRequired === false ? "Nei" : "—"}
        </span>

        <span className="text-slate-500">ODL aktivert</span>
        <span className="font-mono text-slate-600">
          {decision.odlEnabled === true ? "Ja" : decision.odlEnabled === false ? "Nei" : "—"}
        </span>

        {signals?.pageCount != null && (
          <>
            <span className="text-slate-500">Sider</span>
            <span className="font-mono text-slate-600">{signals.pageCount}</span>
          </>
        )}

        {signals?.financialStatementPageCount != null && (
          <>
            <span className="text-slate-500">Regnskapssider</span>
            <span className="font-mono text-slate-600">{signals.financialStatementPageCount}</span>
          </>
        )}

        {signals?.likelyImageOnlyPageCount != null && signals.likelyImageOnlyPageCount > 0 && (
          <>
            <span className="text-slate-500">Bilds.-sider</span>
            <span className="font-mono text-amber-600">{signals.likelyImageOnlyPageCount}</span>
          </>
        )}

        {signals?.hasReliableTextLayer != null && (
          <>
            <span className="text-slate-500">Pålitelig tekstlag</span>
            <span className={`font-semibold ${signals.hasReliableTextLayer ? "text-emerald-600" : "text-red-600"}`}>
              {signals.hasReliableTextLayer ? "Ja" : "Nei"}
            </span>
          </>
        )}
      </div>

      {missingReliableTextLayer && decision.odlEnabled === false ? (
        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
          Dokumentet mangler pålitelig tekstlag, og OpenDataLoader er deaktivert. Derfor kan
          refresh fortsatt ende med 0 verdier i unified-løypa.
        </div>
      ) : null}

      {decision.odlEnabled === true && noStructuredSections && financialFactsEnabled === false ? (
        <div className="mb-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-3 text-sm text-blue-800">
          Refresh er mulig, men systemet har foreløpig ikke funnet tydelige tabeller eller seksjoner
          i ODL-resultatet for dette dokumentet.
        </div>
      ) : null}

      {decision.enabledExtractors && (
        <div className="mb-2">
          <p className="mb-1 text-xs font-medium text-slate-400">Aktive ekstraktorer</p>
          <p className="font-mono text-xs text-slate-500">
            {[
              decision.enabledExtractors.financialFacts ? "financialFacts" : null,
              decision.enabledExtractors.boardReport ? "boardReport" : null,
              decision.enabledExtractors.auditorReport ? "auditorReport" : null,
              decision.enabledExtractors.notes ? "notes" : null,
            ]
              .filter(Boolean)
              .join(", ") || "Ingen"}
          </p>
        </div>
      )}

      {decision.reasons && decision.reasons.length > 0 && (
        <div className="mb-2">
          <p className="mb-1 text-xs font-medium text-slate-400">Rute- og risikogrunnlag</p>
          <ul className="space-y-0.5">
            {decision.reasons.map((r, i) => (
              <li key={i} className="text-xs text-slate-600">
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      {decision.manualReviewReasons && decision.manualReviewReasons.length > 0 && (
        <div className="mb-2">
          <p className="mb-1 text-xs font-medium text-red-500">Grunner til manuell gjennomgang</p>
          <ul className="space-y-0.5">
            {decision.manualReviewReasons.map((r, i) => (
              <li key={i} className="text-xs text-red-600">
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      {hints && (
        <div className="mb-2">
          <p className="mb-1 text-xs font-medium text-slate-400">Side-hint</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
            <span className="text-slate-500">Pålitelig</span>
            <span className={hints.hasReliableHints ? "text-emerald-600" : "text-slate-400"}>
              {hints.hasReliableHints ? "Ja" : "Nei"}
            </span>
            {hints.includePageCount != null && (
              <>
                <span className="text-slate-500">Inkluderte</span>
                <span className="font-mono text-slate-600">{hints.includePageCount}</span>
              </>
            )}
            {hints.excludePageCount != null && (
              <>
                <span className="text-slate-500">Ekskluderte</span>
                <span className="font-mono text-slate-600">{hints.excludePageCount}</span>
              </>
            )}
            {hints.incomePageCount != null && (
              <>
                <span className="text-slate-500">Resultat</span>
                <span className="font-mono text-slate-600">{hints.incomePageCount}</span>
              </>
            )}
            {hints.balancePageCount != null && (
              <>
                <span className="text-slate-500">Balanse</span>
                <span className="font-mono text-slate-600">{hints.balancePageCount}</span>
              </>
            )}
            {hints.notePageCount != null && (
              <>
                <span className="text-slate-500">Noter</span>
                <span className="font-mono text-slate-600">{hints.notePageCount}</span>
              </>
            )}
          </div>
          {hints.reasons.length > 0 && (
            <p className="mt-1 text-xs text-slate-500">{hints.reasons.join(" | ")}</p>
          )}
        </div>
      )}

      {sectionKinds.length > 0 && (
        <div className="mb-2">
          <p className="mb-1 text-xs font-medium text-slate-400">Seksjonstyper</p>
          <p className="font-mono text-xs text-slate-500">
            {sectionKinds.join(", ")}
          </p>
        </div>
      )}

      {(decision.version || decision.engineVersion) && (
        <p className="mt-2 font-mono text-[10px] text-slate-300">
          {decision.version ?? decision.engineVersion}
        </p>
      )}
    </div>
  );
}

function ReviewedFactTable({ facts }: { facts: ReviewedFact[] }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-emerald-200">
          <th className="pb-1 text-left font-medium text-emerald-600">Nøkkel</th>
          <th className="pb-1 text-right font-medium text-emerald-600">Verdi (NOK)</th>
          <th className="pb-1 text-right font-medium text-emerald-600">Skala</th>
          <th className="pb-1 text-right font-medium text-emerald-600">Side</th>
          <th className="pb-1 text-right font-medium text-emerald-600">Kilde</th>
        </tr>
      </thead>
      <tbody>
        {facts.map((f) => (
          <tr key={f.id} className="border-b border-emerald-100 last:border-0">
            <td className="py-1 font-mono text-emerald-800">{f.metricKey}</td>
            <td className="py-1 text-right font-mono text-[#162233]">
              {formatIntegerString(f.value)}
            </td>
            <td className="py-1 text-right font-mono text-slate-400">{f.unitScale}</td>
            <td className="py-1 text-right font-mono text-slate-400">{f.sourcePage ?? "—"}</td>
            <td className="py-1 text-right font-mono">
              <span
                className={
                  f.correctionSource === "MANUAL_CORRECTION"
                    ? "text-amber-600"
                    : "text-slate-400"
                }
              >
                {f.correctionSource === "MANUAL_CORRECTION" ? "KORRIGERT" : "MASKIN"}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
