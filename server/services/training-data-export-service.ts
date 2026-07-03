/**
 * Training Data Export Service
 *
 * Converts reviewer feedback (PdfTrainingLabel rows) into machine-learning
 * training datasets. Each task type has a different shape — the unit-scale
 * classifier needs raw page text + the chosen scale, the page-type classifier
 * needs page text + the section type, and so on.
 *
 * The output format is JSONL: one JSON object per line. This is the
 * de-facto standard for ML training data — it streams cleanly, the Python
 * trainer can read it line-by-line without parsing megabytes of JSON, and
 * splits (train/val/test) are just slicing the file.
 *
 * For reviewers (business view):
 *  - This service does not train any model. It only produces the *input*
 *    a model trainer reads.
 *  - The export is non-destructive — you can run it as many times as you
 *    like; reviewer corrections are never modified.
 *  - Each export is a snapshot of training data at a point in time. The
 *    next export will reflect newer corrections.
 */
import { type MlTaskType, PdfTrainingLabelType } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const DEFAULT_VALIDATION_FRACTION = 0.15;
const DEFAULT_TEST_FRACTION = 0.15;

export type TrainingExample = {
  filingId: string;
  /** Free-form text features for the model. Shape depends on task type. */
  features: Record<string, unknown>;
  /** The reviewer-approved label. Shape depends on task type. */
  label: unknown;
  /** Optional: machine's proposed label, for diagnostic comparison. */
  proposedLabel?: unknown;
};

export type TrainingDatasetSplit = {
  taskType: MlTaskType;
  generatedAt: string;
  totalExamples: number;
  train: TrainingExample[];
  validation: TrainingExample[];
  test: TrainingExample[];
  /** Distribution of labels — useful to spot class imbalance before training. */
  labelDistribution: Record<string, number>;
};

// ──────────────────────────────────────────────────────────────────────────────
// Feature extractors per task type
// ──────────────────────────────────────────────────────────────────────────────

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    const parsed = asString(value);
    if (parsed) return parsed;
  }
  return null;
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    const parsed = asNumber(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

type UnitScaleLabelInput = {
  id: string;
  filingId: string;
  proposedValue: unknown;
  acceptedValue: unknown;
  sourcePayload: unknown;
};

type FinancialFactLabelInput = UnitScaleLabelInput;
type FinancialFactFields = NonNullable<ReturnType<typeof readFinancialFactFields>>;

type UnitScalePageGroup = {
  filingId: string;
  sourcePage: number;
  statementScope: string | null;
  sourceSection: string | null;
  proposedUnitScales: Set<number>;
  acceptedUnitScales: Set<number>;
  rowLabels: string[];
  contextSnippets: string[];
};

function readLabelFields(label: UnitScaleLabelInput) {
  if (!isObject(label.acceptedValue)) return null;
  const source = isObject(label.sourcePayload) ? label.sourcePayload : {};
  const proposed = isObject(label.proposedValue) ? label.proposedValue : {};

  const acceptedUnitScale = firstNumber(label.acceptedValue.unitScale, source.unitScale);
  const sourcePage = firstNumber(label.acceptedValue.sourcePage, source.sourcePage);
  if (acceptedUnitScale === null || sourcePage === null) return null;

  const rawLabel = firstString(label.acceptedValue.rawLabel, source.rawLabel);
  const rowText = firstString(source.sourceRowText, source.rowText);
  const statementScope = firstString(label.acceptedValue.statementScope, source.statementScope);
  const sourceSection = firstString(label.acceptedValue.sourceSection, source.sourceSection);
  const proposedUnitScale = firstNumber(proposed.unitScale, source.sourceUnitScale);
  const unitDeclarationText = firstString(
    source.unitDeclarationText,
    source.pageHeaderText,
    source.headerText,
  );

  return {
    acceptedUnitScale,
    sourcePage,
    rawLabel,
    rowText,
    statementScope,
    sourceSection,
    proposedUnitScale,
    unitDeclarationText,
  };
}

function unitScalePageGroupKey(input: {
  filingId: string;
  sourcePage: number;
  statementScope: string | null;
  sourceSection: string | null;
}) {
  return [
    input.filingId,
    input.sourcePage,
    input.statementScope ?? "UNKNOWN_SCOPE",
    input.sourceSection ?? "UNKNOWN_SECTION",
  ].join("::");
}

function pushUniqueCapped(values: string[], candidate: string | null, max: number) {
  if (!candidate || values.length >= max) return;
  const normalized = normalizeWhitespace(candidate);
  if (!normalized || values.includes(normalized)) return;
  values.push(normalized);
}

function buildPageContextText(group: UnitScalePageGroup) {
  const parts = [
    `page=${group.sourcePage}`,
    group.statementScope ? `scope=${group.statementScope}` : null,
    group.sourceSection ? `section=${group.sourceSection}` : null,
    ...group.contextSnippets,
    ...group.rowLabels,
  ].filter((item): item is string => Boolean(item));

  return normalizeWhitespace(parts.join(" | ")).slice(0, 1200);
}

/**
 * Unit-scale task: predicts whether values on a page are denominated in
 *   1 (kroner), 1000 (tusen kroner), or 1_000_000 (millioner kroner).
 *
 * Feature surface:
 *   - one example per reviewed statement page/scope, not one per row
 *   - page context assembled from persisted section/scope/page metadata and
 *     reviewed row labels
 *   - `rawLabel` is kept as a compatibility alias for older trainers
 *   - `proposedUnitScale` if the machine had one
 *
 * Label: the reviewer's chosen `unitScale`.
 */
function buildUnitScalePageExamples(labels: UnitScaleLabelInput[]): TrainingExample[] {
  const groups = new Map<string, UnitScalePageGroup>();

  for (const label of labels) {
    const fields = readLabelFields(label);
    if (!fields) continue;

    const key = unitScalePageGroupKey({
      filingId: label.filingId,
      sourcePage: fields.sourcePage,
      statementScope: fields.statementScope,
      sourceSection: fields.sourceSection,
    });

    let group = groups.get(key);
    if (!group) {
      group = {
        filingId: label.filingId,
        sourcePage: fields.sourcePage,
        statementScope: fields.statementScope,
        sourceSection: fields.sourceSection,
        proposedUnitScales: new Set(),
        acceptedUnitScales: new Set(),
        rowLabels: [],
        contextSnippets: [],
      };
      groups.set(key, group);
    }

    group.acceptedUnitScales.add(fields.acceptedUnitScale);
    if (fields.proposedUnitScale !== null) group.proposedUnitScales.add(fields.proposedUnitScale);
    pushUniqueCapped(group.contextSnippets, fields.unitDeclarationText, 4);
    pushUniqueCapped(group.rowLabels, fields.rawLabel, 24);
    pushUniqueCapped(group.rowLabels, fields.rowText, 24);
  }

  const examples: TrainingExample[] = [];

  for (const group of groups.values()) {
    if (group.acceptedUnitScales.size !== 1) continue;
    const acceptedUnitScale = [...group.acceptedUnitScales][0]!;
    const proposedUnitScale =
      group.proposedUnitScales.size === 1 ? [...group.proposedUnitScales][0]! : null;
    const pageContextText = buildPageContextText(group);
    if (!pageContextText) continue;

    examples.push({
      filingId: group.filingId,
      features: {
        pageContextText,
        rawLabel: pageContextText,
        sourcePage: group.sourcePage,
        sourceSection: group.sourceSection,
        statementScope: group.statementScope,
        rowLabels: group.rowLabels,
        proposedUnitScale,
      },
      label: acceptedUnitScale,
      proposedLabel: proposedUnitScale,
    });
  }

  return examples;
}

function readFinancialFactFields(label: FinancialFactLabelInput) {
  if (!isObject(label.acceptedValue)) return null;
  const source = isObject(label.sourcePayload) ? label.sourcePayload : {};
  const proposed = isObject(label.proposedValue) ? label.proposedValue : {};

  const metricKey = firstString(
    label.acceptedValue.metricKey,
    label.acceptedValue.canonicalMetricKey,
    source.metricKey,
    source.canonicalMetricKey,
  );
  const rawLabel = firstString(label.acceptedValue.rawLabel, source.rawLabel);
  const sourceRowText = firstString(
    source.sourceRowText,
    source.rowText,
    label.acceptedValue.sourceRowText,
  );
  const value = firstNumber(label.acceptedValue.value, source.value);
  const unitScale = firstNumber(label.acceptedValue.unitScale, source.unitScale);
  const sourcePage = firstNumber(label.acceptedValue.sourcePage, source.sourcePage);
  const fiscalYear = firstNumber(label.acceptedValue.fiscalYear, source.fiscalYear);
  const statementType = firstString(label.acceptedValue.statementType, source.statementType);
  const statementScope = firstString(label.acceptedValue.statementScope, source.statementScope);
  const sourceSection = firstString(label.acceptedValue.sourceSection, source.sourceSection);
  const noteReference = firstString(label.acceptedValue.noteReference, source.noteReference);
  const proposedMetricKey = firstString(
    proposed.metricKey,
    proposed.canonicalMetricKey,
    source.proposedMetricKey,
  );

  if (!metricKey || (!rawLabel && !sourceRowText)) return null;

  return {
    metricKey,
    rawLabel,
    sourceRowText,
    value,
    unitScale,
    sourcePage,
    fiscalYear,
    statementType,
    statementScope,
    sourceSection,
    noteReference,
    proposedMetricKey,
  };
}

function financialFactPageGroupKey(input: {
  filingId: string;
  sourcePage: number | null;
  statementScope: string | null;
  statementType: string | null;
  sourceSection: string | null;
}) {
  return [
    input.filingId,
    input.sourcePage ?? "UNKNOWN_PAGE",
    input.statementScope ?? "UNKNOWN_SCOPE",
    input.statementType ?? "UNKNOWN_STATEMENT",
    input.sourceSection ?? "UNKNOWN_SECTION",
  ].join("::");
}

function compactFinancialFactRow(fields: FinancialFactFields) {
  const parts = [fields.rawLabel, fields.sourceRowText].filter((value): value is string =>
    Boolean(value?.trim()),
  );
  return normalizeWhitespace(Array.from(new Set(parts)).join(" | ")).slice(0, 240);
}

function buildFinancialFactContextText(fields: FinancialFactFields, nearbyRows: string[] = []) {
  if (!fields) return "";
  const parts = [
    fields.sourcePage !== null ? `page=${fields.sourcePage}` : null,
    fields.fiscalYear !== null ? `fiscalYear=${fields.fiscalYear}` : null,
    fields.statementType ? `statementType=${fields.statementType}` : null,
    fields.statementScope ? `scope=${fields.statementScope}` : null,
    fields.sourceSection ? `section=${fields.sourceSection}` : null,
    fields.noteReference ? `note=${fields.noteReference}` : null,
    fields.unitScale !== null ? `unitScale=${fields.unitScale}` : null,
    fields.value !== null ? `value=${fields.value}` : null,
    fields.proposedMetricKey ? `proposedMetricKey=${fields.proposedMetricKey}` : null,
    fields.rawLabel ? `label=${fields.rawLabel}` : null,
    fields.sourceRowText ? `row=${fields.sourceRowText}` : null,
    nearbyRows.length > 0 ? `nearbyRowCount=${nearbyRows.length}` : null,
    ...nearbyRows.map((row, index) => `nearbyRow${index + 1}=${row}`),
  ].filter((item): item is string => Boolean(item));

  return normalizeWhitespace(parts.join(" | ")).slice(0, 2400);
}

/**
 * Financial-fact task: predicts the canonical metric key for one extracted
 * financial statement row/value candidate. This is the first supervised
 * model surface for "which regnskapstall did this row contain?".
 *
 * The numeric value is still parsed by the PDF/text pipeline. The model learns
 * the fact identity from page context + row text + observed value, then runs in
 * shadow/apply modes before it is allowed to replace alias matching.
 */
function buildFinancialFactExamples(labels: FinancialFactLabelInput[]): TrainingExample[] {
  const examples: TrainingExample[] = [];
  const acceptedFacts: Array<{ label: FinancialFactLabelInput; fields: FinancialFactFields }> = [];
  const groups = new Map<string, Array<{ label: FinancialFactLabelInput; fields: FinancialFactFields }>>();

  for (const label of labels) {
    const fields = readFinancialFactFields(label);
    if (!fields) continue;
    acceptedFacts.push({ label, fields });
    const key = financialFactPageGroupKey({
      filingId: label.filingId,
      sourcePage: fields.sourcePage,
      statementScope: fields.statementScope,
      statementType: fields.statementType,
      sourceSection: fields.sourceSection,
    });
    const group = groups.get(key) ?? [];
    group.push({ label, fields });
    groups.set(key, group);
  }

  for (const item of acceptedFacts) {
    const key = financialFactPageGroupKey({
      filingId: item.label.filingId,
      sourcePage: item.fields.sourcePage,
      statementScope: item.fields.statementScope,
      statementType: item.fields.statementType,
      sourceSection: item.fields.sourceSection,
    });
    const group = groups.get(key) ?? [];
    const index = group.findIndex((candidate) => candidate.label.id === item.label.id);
    const nearbyRows =
      index === -1
        ? []
        : group
            .slice(Math.max(0, index - 3), Math.min(group.length, index + 4))
            .filter((candidate) => candidate.label.id !== item.label.id)
            .map((candidate) => compactFinancialFactRow(candidate.fields))
            .filter((row) => row.length > 0);

    const factContextText = buildFinancialFactContextText(item.fields, nearbyRows);
    if (!factContextText) continue;

    examples.push({
      filingId: item.label.filingId,
      features: {
        factContextText,
        rawLabel: item.fields.rawLabel,
        sourceRowText: item.fields.sourceRowText,
        sourcePage: item.fields.sourcePage,
        fiscalYear: item.fields.fiscalYear,
        statementType: item.fields.statementType,
        statementScope: item.fields.statementScope,
        sourceSection: item.fields.sourceSection,
        noteReference: item.fields.noteReference,
        unitScale: item.fields.unitScale,
        value: item.fields.value,
        proposedMetricKey: item.fields.proposedMetricKey,
        nearbyRows,
      },
      label: item.fields.metricKey,
      proposedLabel: item.fields.proposedMetricKey,
    });
  }

  return examples;
}

// ──────────────────────────────────────────────────────────────────────────────
// Deterministic split
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Deterministic hash-based assignment to train/val/test. Same example always
 * lands in the same split, so repeated exports don't shuffle examples
 * between buckets — important when comparing model versions trained at
 * different times.
 */
function assignSplit(
  key: string,
  validationFraction: number,
  testFraction: number,
): "train" | "validation" | "test" {
  // Simple FNV-1a hash → float in [0,1)
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const normalized = ((hash >>> 0) % 10_000) / 10_000;

  if (normalized < validationFraction) return "validation";
  if (normalized < validationFraction + testFraction) return "test";
  return "train";
}

// ──────────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────────

export type ExportOptions = {
  validationFraction?: number;
  testFraction?: number;
};

/**
 * Builds an in-memory dataset for the unit-scale classifier. Reads all
 * FACT_VALUE training labels with reviewer-approved unit scales, extracts
 * features, splits deterministically into train/val/test.
 *
 * The Python trainer will receive this exact structure as JSONL.
 */
export async function exportUnitScaleDataset(
  options: ExportOptions = {},
): Promise<TrainingDatasetSplit> {
  const validationFraction = options.validationFraction ?? DEFAULT_VALIDATION_FRACTION;
  const testFraction = options.testFraction ?? DEFAULT_TEST_FRACTION;

  const labels = await prisma.pdfTrainingLabel.findMany({
    where: { labelType: PdfTrainingLabelType.FACT_VALUE },
    select: {
      filingId: true,
      proposedValue: true,
      acceptedValue: true,
      sourcePayload: true,
      id: true,
    },
  });

  const examples: TrainingExample[] = [];
  const labelDistribution: Record<string, number> = {};

  for (const example of buildUnitScalePageExamples(labels)) {
    examples.push(example);
    const key = String(example.label);
    labelDistribution[key] = (labelDistribution[key] ?? 0) + 1;
  }

  const buckets = { train: [], validation: [], test: [] } as {
    train: TrainingExample[];
    validation: TrainingExample[];
    test: TrainingExample[];
  };

  for (const example of examples) {
    const splitKey = example.filingId;
    const bucket = assignSplit(splitKey, validationFraction, testFraction);
    buckets[bucket].push(example);
  }

  return {
    taskType: "UNIT_SCALE_CLASSIFIER",
    generatedAt: new Date().toISOString(),
    totalExamples: examples.length,
    train: buckets.train,
    validation: buckets.validation,
    test: buckets.test,
    labelDistribution,
  };
}

/**
 * Builds an in-memory dataset for the supervised financial-fact extractor.
 * Reads reviewer-approved FACT_VALUE labels and emits one example per reviewed
 * fact value. Split assignment stays filing-level to avoid leaking the same
 * annual report across train/validation/test.
 */
export async function exportFinancialFactDataset(
  options: ExportOptions = {},
): Promise<TrainingDatasetSplit> {
  const validationFraction = options.validationFraction ?? DEFAULT_VALIDATION_FRACTION;
  const testFraction = options.testFraction ?? DEFAULT_TEST_FRACTION;

  const labels = await prisma.pdfTrainingLabel.findMany({
    where: { labelType: PdfTrainingLabelType.FACT_VALUE },
    select: {
      filingId: true,
      proposedValue: true,
      acceptedValue: true,
      sourcePayload: true,
      id: true,
    },
  });

  const examples = buildFinancialFactExamples(labels);
  const labelDistribution: Record<string, number> = {};
  for (const example of examples) {
    const key = String(example.label);
    labelDistribution[key] = (labelDistribution[key] ?? 0) + 1;
  }

  const buckets = { train: [], validation: [], test: [] } as {
    train: TrainingExample[];
    validation: TrainingExample[];
    test: TrainingExample[];
  };

  for (const example of examples) {
    const bucket = assignSplit(example.filingId, validationFraction, testFraction);
    buckets[bucket].push(example);
  }

  return {
    taskType: "OTHER",
    generatedAt: new Date().toISOString(),
    totalExamples: examples.length,
    train: buckets.train,
    validation: buckets.validation,
    test: buckets.test,
    labelDistribution,
  };
}

/**
 * Serialises a dataset split to JSONL format — one example per line, ready
 * for the Python trainer.
 */
export function serializeDatasetAsJsonl(split: TrainingDatasetSplit): {
  trainJsonl: string;
  validationJsonl: string;
  testJsonl: string;
} {
  const toJsonl = (examples: TrainingExample[]) =>
    examples.map((ex) => JSON.stringify(ex)).join("\n");
  return {
    trainJsonl: toJsonl(split.train),
    validationJsonl: toJsonl(split.validation),
    testJsonl: toJsonl(split.test),
  };
}
