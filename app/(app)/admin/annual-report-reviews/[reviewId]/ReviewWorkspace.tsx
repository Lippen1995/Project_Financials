"use client";

import React, { useState, useEffect } from "react";
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
  metricKey: string;
  fiscalYear: number;
  value: string;
  rawLabel: string;
  sourcePage: string;
  unitScale: string;
};

type RowEdit = {
  metricKey: string;
  mainValue: string;
  priorValue: string;
  sourceMetricKey?: string | null;
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
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
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
  "long_term_liabilities", "trade_payables", "tax_payable",
  "public_duties_payable", "other_current_liabilities", "current_liabilities",
  "total_liabilities", "total_equity_and_liabilities",
];
const CANONICAL_ORDER_MAP = new Map<string, number>(
  [...INCOME_METRIC_ORDER, ...BALANCE_METRIC_ORDER].map((k, i) => [k, i]),
);
function sortByCanonical(facts: Fact[]): Fact[] {
  return [...facts].sort((a, b) => {
    const ia = CANONICAL_ORDER_MAP.get(a.metricKey) ?? 9999;
    const ib = CANONICAL_ORDER_MAP.get(b.metricKey) ?? 9999;
    return ia - ib;
  });
}

function getRowId(row: RawRow): string {
  const lookupKey = (row.normalizedLabel ?? row.label ?? "").toLowerCase().trim();
  return `${row.pageNumber}_${lookupKey}`;
}

function getMetricOptionsForSection(sectionType: string): string[] {
  if (INCOME_SECTIONS.has(sectionType)) return INCOME_METRIC_ORDER;
  if (BALANCE_SECTIONS.has(sectionType)) return BALANCE_METRIC_ORDER;
  return [...INCOME_METRIC_ORDER, ...BALANCE_METRIC_ORDER];
}

function removeRowEdit(
  edits: Record<string, RowEdit>,
  rowId: string,
): Record<string, RowEdit> {
  const next = { ...edits };
  delete next[rowId];
  return next;
}

function upsertFactCorrection(
  factMap: Map<string, {
    metricKey: string;
    fiscalYear: number;
    value: string | null;
    rawLabel: string | null;
    sourcePage: number | null;
    unitScale: number | null;
    sourceMetricKey?: string | null;
  }>,
  fact: {
    metricKey: string;
    fiscalYear: number;
    value: string | null;
    rawLabel: string | null;
    sourcePage: number | null;
    unitScale: number | null;
    sourceMetricKey?: string | null;
  },
) {
  factMap.set(`${fact.metricKey}:${fact.fiscalYear}`, fact);
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

  // "Som rapportert" vs "Standardisert" toggle
  const [viewMode, setViewMode] = useState<"standardized" | "as-reported">("as-reported");
  const [extractionData, setExtractionData] = useState<ExtractionData | null>(null);
  const [extractionLoading, setExtractionLoading] = useState(false);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const hasExtractionArtifact = review.filing.artifacts.some(
    (a) => a.artifactType === "EXTRACTION_JSON",
  );

  useEffect(() => {
    if (viewMode !== "as-reported" || extractionData || extractionLoading) return;
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
  }, [viewMode, extractionData, extractionLoading, review.id]);

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

  const allFacts = review.extractionRun?.facts ?? [];
  const scopedFacts = allFacts.filter(
    (fact) => (fact.statementScope ?? "COMPANY") === reviewScope,
  );
  // Fall back to the unfiltered list if scope tagging is absent (older runs)
  // so the workspace is never accidentally empty.
  const facts = scopedFacts.length > 0 ? scopedFacts : allFacts;
  const { income, balance, other } = groupFacts(facts);
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
    const canonicalKeys = [...INCOME_METRIC_ORDER, ...BALANCE_METRIC_ORDER];
    const entries: EditableFact[] = canonicalKeys.map((key) => {
      const f = factsByKey.get(key);
      return {
        metricKey: key,
        fiscalYear: f?.fiscalYear ?? review.fiscalYear,
        value: f ? bigintToDisplay(f.value) : "",
        rawLabel: f?.rawLabel ?? "",
        sourcePage: String(f?.sourcePage ?? ""),
        unitScale: String(f?.unitScale ?? 1000),
      };
    });
    for (const f of facts) {
      if (!CANONICAL_ORDER_MAP.has(f.metricKey)) {
        entries.push({
          metricKey: f.metricKey,
          fiscalYear: f.fiscalYear,
          value: bigintToDisplay(f.value),
          rawLabel: f.rawLabel ?? "",
          sourcePage: String(f.sourcePage ?? ""),
          unitScale: String(f.unitScale),
        });
      }
    }
    return entries;
  });
  const [priorYearEdits, setPriorYearEdits] = useState<Record<string, string>>({});
  const [rowEdits, setRowEdits] = useState<Record<string, RowEdit>>({});

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
        { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
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
        { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
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
    const factCorrections = new Map<string, {
      metricKey: string;
      fiscalYear: number;
      value: string | null;
      rawLabel: string | null;
      sourcePage: number | null;
      unitScale: number | null;
      sourceMetricKey?: string | null;
    }>();
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
    const reassignedSourceMetricKeys = new Set<string>();

    for (const row of effectiveRows) {
      const rowId = getRowId(row);
      const rowEdit = rowEdits[rowId];
      if (!rowEdit) continue;

      const targetMetricKey = rowEdit.metricKey.trim();
      if (!targetMetricKey) continue;

      const lookupKey = (row.normalizedLabel ?? row.label ?? "").toLowerCase().trim();
      const sourceMetricKey =
        rowEdit.sourceMetricKey?.trim() || canonicalByLabel.get(lookupKey) || null;
      const mainProposed = sourceMetricKey ? (dbValueByKey.get(sourceMetricKey) ?? null) : null;
      const priorProposed = sourceMetricKey ? (priorValueByKey.get(sourceMetricKey) ?? null) : null;
      const [reconstructedMain, reconstructedPrior] = sourceMetricKey
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

      const mainValue =
        rowEdit.mainValue.trim() !== "" ? rowEdit.mainValue.trim() : fallbackMainValue;
      const priorValue =
        rowEdit.priorValue.trim() !== "" ? rowEdit.priorValue.trim() : fallbackPriorValue;

      if (sourceMetricKey && sourceMetricKey !== targetMetricKey) {
        reassignedSourceMetricKeys.add(sourceMetricKey);
      }

      if (mainValue !== null) {
        upsertFactCorrection(factCorrections, {
          metricKey: targetMetricKey,
          fiscalYear: review.fiscalYear,
          value: mainValue,
          rawLabel: row.label || null,
          sourcePage: row.pageNumber,
          unitScale: row.unitScale,
          sourceMetricKey,
        });
      }
      if (priorValue !== null) {
        upsertFactCorrection(factCorrections, {
          metricKey: targetMetricKey,
          fiscalYear: priorFiscalYear,
          value: priorValue,
          rawLabel: row.label || null,
          sourcePage: row.pageNumber,
          unitScale: row.unitScale,
          sourceMetricKey,
        });
      }
    }

    for (const fact of editableFacts) {
      if (reassignedSourceMetricKeys.has(fact.metricKey)) continue;
      const trimmed = fact.value.trim();
      if (!trimmed) continue;
      const original = dbValueByKey.get(fact.metricKey) ?? "";
      if (trimmed === original) continue;
      upsertFactCorrection(factCorrections, {
        metricKey: fact.metricKey,
        fiscalYear: fact.fiscalYear,
        value: trimmed,
        rawLabel: fact.rawLabel || null,
        sourcePage: fact.sourcePage.trim() !== "" ? parseInt(fact.sourcePage, 10) : null,
        unitScale: fact.unitScale.trim() !== "" ? parseInt(fact.unitScale, 10) : null,
      });
    }

    for (const [metricKey, value] of Object.entries(priorYearEdits)) {
      if (reassignedSourceMetricKeys.has(metricKey)) continue;
      if (!value.trim()) continue;
      upsertFactCorrection(factCorrections, {
        metricKey,
        fiscalYear: priorFiscalYear,
        value: value.trim(),
        rawLabel: null,
        sourcePage: null,
        unitScale: null,
      });
    }

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

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      {/* ---- Left: PDF viewer ---- */}
      <div className="flex flex-col gap-4">
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
                className="h-[800px] w-full rounded border border-[rgba(15,23,42,0.08)]"
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
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Artefakter
              </h3>
              <ul className="space-y-1">
                {review.filing.artifacts.map((a) => (
                  <li key={a.id} className="font-mono text-xs text-slate-500">
                    {a.artifactType} — {a.storageKey}
                  </li>
                ))}
              </ul>
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
      <div className="flex flex-col gap-4">

        {/* Foreslåtte tall — med toggle mellom standardisert og som rapportert */}
        {facts.length > 0 && (
          <div className="rounded-lg border border-[rgba(15,23,42,0.08)] bg-white p-4">
            {/* Header med toggle-knapper */}
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
                Finansielle tall
              </h2>
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
                  Fyll inn manuell verdi for å overstyre maskinforslag. Effektivt tall er det som lagres.
                </p>
                {income.length > 0 && (
                  <InlineFactTable
                    title="Resultatregnskap"
                    facts={sortByCanonical(income)}
                    editableFacts={editableFacts}
                    setEditableFacts={setEditableFacts}
                  />
                )}
                {balance.length > 0 && (
                  <InlineFactTable
                    title="Balanse"
                    facts={sortByCanonical(balance)}
                    editableFacts={editableFacts}
                    setEditableFacts={setEditableFacts}
                  />
                )}
                {other.length > 0 && (
                  <InlineFactTable
                    title="Andre"
                    facts={other}
                    editableFacts={editableFacts}
                    setEditableFacts={setEditableFacts}
                  />
                )}
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
                    editableFacts={editableFacts}
                    setEditableFacts={setEditableFacts}
                    priorYearEdits={priorYearEdits}
                    setPriorYearEdits={setPriorYearEdits}
                    rowEdits={rowEdits}
                    setRowEdits={setRowEdits}
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

        {/* Validation issues */}
        {issues.length > 0 && (
          <div className="rounded-lg border border-[rgba(15,23,42,0.08)] bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">
              Valideringsfeil ({issues.length})
            </h2>
            <ul className="space-y-2">
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
          </div>
        )}

        {/* Reviewed facts — shown after accept/correct */}
        {hasReviewedFacts && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-emerald-700">
              Godkjente tall ({reviewedFacts.length})
            </h2>
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
              </p>
            ) : (
              <>
                <p className="mb-2 text-sm font-medium text-red-700">
                  Validering feilet ({validationResult.blockingIssues.length} blokkeringer):
                </p>
                <ul className="space-y-1">
                  {validationResult.blockingIssues.map((issue, i) => (
                    <li key={i} className="text-sm">
                      <span className="font-mono text-xs font-semibold text-red-600">
                        {issue.ruleCode}
                      </span>
                      <span className="ml-2 text-red-800">{issue.message}</span>
                    </li>
                  ))}
                </ul>
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
          <div className="rounded bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Denne saken er avsluttet med status <strong>{review.status}</strong>.
            {isAccepted && hasReviewedFacts
              ? " Godkjente tall er lagret og publisert til aktivt regnskapssnapshot."
              : ""}
          </div>
        )}
      </div>
    </div>
  );
}

function InlineFactTable({
  title,
  facts,
  editableFacts,
  setEditableFacts,
}: {
  title: string;
  facts: Fact[];
  editableFacts: EditableFact[];
  setEditableFacts: React.Dispatch<React.SetStateAction<EditableFact[]>>;
}) {
  const suggestedByKey = new Map(facts.map((f) => [f.metricKey, f]));

  return (
    <div className="mb-4">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[rgba(15,23,42,0.08)]">
              <th className="pb-1 pr-2 text-left font-medium text-slate-400">Nøkkel</th>
              <th className="pb-1 pr-1 text-right font-medium text-slate-400">Foreslått</th>
              <th className="pb-1 pr-1 text-left font-medium text-slate-400">Manuell</th>
              <th className="pb-1 pr-1 text-right font-medium text-slate-400">Effektivt</th>
              <th className="pb-1 pr-1 text-right font-medium text-slate-400">Diff</th>
              <th className="pb-1 text-right font-medium text-slate-400">Conf</th>
            </tr>
          </thead>
          <tbody>
            {facts.map((f) => {
              const original = suggestedByKey.get(f.metricKey);
              const editIdx = editableFacts.findIndex((e) => e.metricKey === f.metricKey);
              const editable = editIdx >= 0 ? editableFacts[editIdx] : null;

              const suggestedStr = original ? bigintToDisplay(original.value) : "";
              const manualStr = editable?.value ?? "";
              const hasManual = manualStr.trim() !== "" && manualStr.trim() !== suggestedStr;

              let diff: bigint | null = null;
              if (hasManual && manualStr.trim() !== "" && suggestedStr !== "") {
                try {
                  diff = BigInt(manualStr.trim()) - BigInt(suggestedStr);
                } catch {
                  // non-parseable input
                }
              }

              const effectiveStr = hasManual ? manualStr.trim() : suggestedStr;

              return (
                <tr key={f.id} className="border-b border-[rgba(15,23,42,0.04)] last:border-0 hover:bg-slate-50/50">
                  <td className="py-1 pr-2 font-mono text-slate-600">{f.metricKey}</td>
                  <td
                    className={`py-1 pr-1 text-right font-mono tabular-nums ${
                      hasManual ? "text-slate-300 line-through" : "text-[var(--px-text)]"
                    }`}
                  >
                    {suggestedStr ? formatIntegerString(suggestedStr) : "—"}
                  </td>
                  <td className="py-1 pr-1">
                    <input
                      value={manualStr}
                      onChange={(e) => {
                        if (editIdx >= 0) {
                          setEditableFacts((prev) => {
                            const next = [...prev];
                            next[editIdx] = { ...next[editIdx], value: e.target.value };
                            return next;
                          });
                        }
                      }}
                      placeholder="—"
                      className={`w-full min-w-[90px] rounded border px-1.5 py-0.5 font-mono text-xs focus:outline-none ${
                        hasManual
                          ? "border-amber-300 bg-amber-50 text-amber-800 focus:border-amber-400"
                          : "border-[rgba(15,23,42,0.10)] bg-white text-slate-600 focus:border-[var(--px-accent)]"
                      }`}
                    />
                  </td>
                  <td
                    className={`py-1 pr-1 text-right font-mono tabular-nums font-medium ${
                      hasManual ? "text-amber-700" : "text-[var(--px-text)]"
                    }`}
                  >
                    {effectiveStr ? formatIntegerString(effectiveStr) : "—"}
                  </td>
                  <td
                    className={`py-1 pr-1 text-right font-mono tabular-nums ${
                      diff === null
                        ? "text-slate-300"
                        : diff > 0n
                          ? "text-green-600"
                          : diff < 0n
                            ? "text-red-600"
                            : "text-slate-400"
                    }`}
                  >
                    {diff !== null
                      ? (diff >= 0n ? "+" : "") + formatIntegerString(diff)
                      : "—"}
                  </td>
                  <td className="py-1 text-right font-mono text-slate-400">
                    {f.confidenceScore != null
                      ? `${(f.confidenceScore * 100).toFixed(0)}%`
                      : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
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
  editableFacts,
  setEditableFacts,
  priorYearEdits,
  setPriorYearEdits,
  rowEdits,
  setRowEdits,
}: {
  data: ExtractionData;
  fiscalYear: number;
  facts: Fact[];
  editableFacts: EditableFact[];
  setEditableFacts: React.Dispatch<React.SetStateAction<EditableFact[]>>;
  priorYearEdits: Record<string, string>;
  setPriorYearEdits: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  rowEdits: Record<string, RowEdit>;
  setRowEdits: React.Dispatch<React.SetStateAction<Record<string, RowEdit>>>;
}) {
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
        <p className="text-xs text-slate-400">
          Foreslåtte tall hentes fra ekstraheringen. Fyll inn manuell verdi for å overstyre —
          endelig tall er det som lagres. Umappede linjer (oransje) teller ikke med.
        </p>
      )}

      {incomeRows.length > 0 && (
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
          editableFacts={editableFacts}
          setEditableFacts={setEditableFacts}
          priorYearEdits={priorYearEdits}
          setPriorYearEdits={setPriorYearEdits}
          rowEdits={rowEdits}
          setRowEdits={setRowEdits}
        />
      )}
      {balanceRows.length > 0 && (
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
          editableFacts={editableFacts}
          setEditableFacts={setEditableFacts}
          priorYearEdits={priorYearEdits}
          setPriorYearEdits={setPriorYearEdits}
          rowEdits={rowEdits}
          setRowEdits={setRowEdits}
        />
      )}
      {otherRows.length > 0 && (
        <AsReportedSection
          title={`Andre seksjoner (${[...new Set(otherRows.map((r) => sectionLabel(r.sectionType)))].join(", ")})`}
          rows={otherRows}
          canonicalByLabel={canonicalByLabel}
          dbValueByKey={dbValueByKey}
          priorValueByKey={priorValueByKey}
          confidenceByKey={confidenceByKey}
          precedenceByKey={precedenceByKey}
          mainYear={mainYear}
          priorYear={priorYear}
          editableFacts={editableFacts}
          setEditableFacts={setEditableFacts}
          priorYearEdits={priorYearEdits}
          setPriorYearEdits={setPriorYearEdits}
          rowEdits={rowEdits}
          setRowEdits={setRowEdits}
        />
      )}

      <p className="text-[10px] text-slate-300">
        {effectiveRows.length} rader totalt · motor: {data.engine ?? "—"} / {data.mode ?? "—"}
        {isSynthetic && " · (syntetisert fra mappedFacts)"}
      </p>
    </div>
  );
}

function AsReportedSection({
  title,
  rows,
  canonicalByLabel,
  dbValueByKey,
  priorValueByKey,
  confidenceByKey,
  precedenceByKey,
  mainYear,
  priorYear,
  editableFacts,
  setEditableFacts,
  priorYearEdits,
  setPriorYearEdits,
  rowEdits,
  setRowEdits,
}: {
  title: string;
  rows: RawRow[];
  canonicalByLabel: Map<string, string>;
  dbValueByKey: Map<string, string>;
  priorValueByKey: Map<string, string>;
  confidenceByKey: Map<string, number>;
  precedenceByKey: Map<string, string>;
  mainYear: number;
  priorYear: number;
  editableFacts: EditableFact[];
  setEditableFacts: React.Dispatch<React.SetStateAction<EditableFact[]>>;
  priorYearEdits: Record<string, string>;
  setPriorYearEdits: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  rowEdits: Record<string, RowEdit>;
  setRowEdits: React.Dispatch<React.SetStateAction<Record<string, RowEdit>>>;
}) {
  return (
    <div className="mb-2">
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
        {title}
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[rgba(15,23,42,0.08)]">
              <th className="pb-1 pr-2 text-left font-medium text-slate-400">Label (rapportert)</th>
              <th className="pb-1 pr-1 text-left font-medium text-slate-400">Nøkkel</th>
              <th className="pb-1 pr-1 text-right font-medium text-slate-400">
                Foreslått {mainYear}
              </th>
              <th className="pb-1 pr-1 text-left font-medium text-slate-400">
                Manuell {mainYear}
              </th>
              <th className="pb-1 pr-1 text-right font-medium text-emerald-600">
                Endelig {mainYear}
              </th>
              <th className="pb-1 pr-1 text-right font-medium text-slate-400">
                Foreslått {priorYear}
              </th>
              <th className="pb-1 pr-1 text-left font-medium text-slate-400">
                Manuell {priorYear}
              </th>
              <th className="pb-1 pr-1 text-right font-medium text-emerald-600">
                Endelig {priorYear}
              </th>
              <th className="pb-1 pr-1 text-right font-medium text-slate-400">Side</th>
              <th className="pb-1 text-right font-medium text-slate-400">Conf</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
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
              const allowedMetricKeys = getMetricOptionsForSection(row.sectionType);

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

              const editIdx = isMapped && canonicalKey
                ? editableFacts.findIndex((e) => e.metricKey === canonicalKey)
                : -1;
              const mappedMainManual = editIdx >= 0 ? editableFacts[editIdx].value : "";
              const mappedPriorManual =
                isMapped && canonicalKey ? (priorYearEdits[canonicalKey] ?? "") : "";
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
                <tr
                  key={row.pageNumber + "-" + i}
                  className="border-b border-[rgba(15,23,42,0.04)] last:border-0 hover:bg-slate-50/50"
                >
                  <td className={"py-1 pr-2 " + (isMapped ? "text-slate-700" : "text-slate-400")}>
                    {row.label}
                  </td>

                  <td className="py-1 pr-1">
                    <div className="flex flex-col gap-1">
                      <select
                        value={selectedMetricKey}
                        onChange={(e) => {
                          const value = e.target.value;
                          setRowEdits((prev) => {
                            if (!value || (isMapped && value === canonicalKey)) {
                              return removeRowEdit(prev, rowId);
                            }
                            return {
                              ...prev,
                              [rowId]: {
                                ...(prev[rowId] ?? { mainValue: "", priorValue: "" }),
                                metricKey: value,
                                sourceMetricKey: canonicalKey,
                              },
                            };
                          });
                        }}
                        className={
                          "w-full min-w-[160px] rounded-xl border px-2 py-1 font-mono text-xs focus:outline-none " +
                          (!isMapped || hasKeyOverride
                            ? "border-amber-300 bg-amber-50 text-amber-900 focus:border-amber-400"
                            : "border-[rgba(15,23,42,0.10)] bg-white text-[var(--px-accent)] focus:border-[var(--px-accent)]")
                        }
                      >
                        {!isMapped && <option value="">tildel nøkkel…</option>}
                        {allowedMetricKeys.map((metricKey) => (
                          <option key={metricKey} value={metricKey}>
                            {metricKey}
                          </option>
                        ))}
                      </select>
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
                    ) : isMapped && editIdx >= 0 ? (
                      <input
                        value={mainManualValue}
                        onChange={(e) => {
                          setEditableFacts((prev) => {
                            const next = [...prev];
                            next[editIdx] = { ...next[editIdx], value: e.target.value };
                            return next;
                          });
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
                    ) : isMapped && canonicalKey ? (
                      <input
                        value={priorManualValue}
                        onChange={(e) => {
                          const value = e.target.value;
                          setPriorYearEdits((prev) => ({ ...prev, [canonicalKey]: value }));
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

                  <td className="py-1 pr-1 text-right font-mono text-slate-400">
                    {row.pageNumber}
                  </td>
                  <td className="py-1 text-right font-mono text-slate-400">
                    {confidence != null ? (confidence * 100).toFixed(0) + "%" : "—"}
                  </td>
                </tr>
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
