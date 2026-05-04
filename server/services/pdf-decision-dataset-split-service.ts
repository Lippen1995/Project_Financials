import type {
  PdfDecisionOutcomeDataset,
  PdfDecisionOutcomeDatasetRecord,
} from "@/server/services/pdf-decision-outcome-dataset-service";
import type { PdfDecisionDatasetQualityIssue } from "@/server/services/pdf-decision-dataset-quality-service";

export type PdfDecisionDatasetSplitName = "train" | "validation" | "test";

export type PdfDecisionDatasetSplitRecord = PdfDecisionOutcomeDatasetRecord & {
  split: PdfDecisionDatasetSplitName;
};

export type PdfDecisionDatasetSplitResult = {
  version: "pdf-decision-dataset-split-v1";
  generatedAt: string;
  seed: string;
  ratios: { train: number; validation: number; test: number };
  recordCount: number;
  splitCounts: Record<PdfDecisionDatasetSplitName, number>;
  leakageIssues: PdfDecisionDatasetQualityIssue[];
  records: PdfDecisionDatasetSplitRecord[];
};

const DEFAULT_RATIOS = { train: 0.7, validation: 0.15, test: 0.15 };
const DEFAULT_SEED = "pdf-decision-split-v1";

function stableHash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

function assignSplit(
  filingId: string,
  seed: string,
  ratios: { train: number; validation: number; test: number },
): PdfDecisionDatasetSplitName {
  const hash = stableHash(`${seed}:${filingId}`);
  const bucket = (hash % 100) / 100;
  if (bucket < ratios.train) return "train";
  if (bucket < ratios.train + ratios.validation) return "validation";
  return "test";
}

type StratifyField = "outcome" | "riskLevel" | "decisionRoute" | "fiscalYear" | "goldSetStatus";

function stratifyKey(record: PdfDecisionOutcomeDatasetRecord, fields: StratifyField[]): string {
  const parts = fields.map((field) => {
    switch (field) {
      case "outcome": return record.labels.outcome ?? "UNKNOWN";
      case "riskLevel": return record.features.riskLevel ?? "UNKNOWN";
      case "decisionRoute": return record.features.decisionRoute ?? "UNKNOWN";
      case "fiscalYear": return String(record.fiscalYear ?? "UNKNOWN");
      case "goldSetStatus": return record.features.goldSetStatus ?? "NONE";
    }
  });
  return parts.join("|");
}

function splitStratified(
  records: PdfDecisionOutcomeDatasetRecord[],
  seed: string,
  ratios: { train: number; validation: number; test: number },
  stratifyFields: StratifyField[],
): Map<string, PdfDecisionDatasetSplitName> {
  // Group by stratum
  const strata = new Map<string, PdfDecisionOutcomeDatasetRecord[]>();
  for (const record of records) {
    const key = stratifyKey(record, stratifyFields);
    const group = strata.get(key) ?? [];
    group.push(record);
    strata.set(key, group);
  }

  const splitMap = new Map<string, PdfDecisionDatasetSplitName>();

  for (const [, group] of strata) {
    // Sort within stratum deterministically
    const sorted = [...group].sort((a, b) => a.filingId.localeCompare(b.filingId));
    const n = sorted.length;
    const trainEnd = Math.round(n * ratios.train);
    const valEnd = trainEnd + Math.round(n * ratios.validation);

    for (let i = 0; i < sorted.length; i++) {
      const split: PdfDecisionDatasetSplitName =
        i < trainEnd ? "train" : i < valEnd ? "validation" : "test";
      splitMap.set(sorted[i].filingId, split);
    }
  }

  return splitMap;
}

export function splitPdfDecisionOutcomeDataset(input: {
  dataset: PdfDecisionOutcomeDataset;
  seed?: string;
  ratios?: { train: number; validation: number; test: number };
  stratifyBy?: StratifyField[];
}): PdfDecisionDatasetSplitResult {
  const seed = input.seed ?? DEFAULT_SEED;
  const ratios = input.ratios ?? DEFAULT_RATIOS;

  // Validate ratios
  const ratioSum = ratios.train + ratios.validation + ratios.test;
  if (Math.abs(ratioSum - 1) > 1e-9) {
    throw new Error(
      `Ratios must sum to 1, got ${ratioSum.toFixed(6)} (train=${ratios.train}, validation=${ratios.validation}, test=${ratios.test}).`,
    );
  }
  if (ratios.train <= 0 || ratios.validation <= 0 || ratios.test <= 0) {
    throw new Error("All split ratios must be positive.");
  }

  const records = input.dataset.records;

  // Deduplicate by filingId — keep first occurrence
  const seen = new Set<string>();
  const uniqueRecords: PdfDecisionOutcomeDatasetRecord[] = [];
  for (const record of records) {
    if (!seen.has(record.filingId)) {
      seen.add(record.filingId);
      uniqueRecords.push(record);
    }
  }

  let splitMap: Map<string, PdfDecisionDatasetSplitName>;

  if (input.stratifyBy && input.stratifyBy.length > 0) {
    splitMap = splitStratified(uniqueRecords, seed, ratios, input.stratifyBy);
  } else {
    splitMap = new Map<string, PdfDecisionDatasetSplitName>();
    for (const record of uniqueRecords) {
      splitMap.set(record.filingId, assignSplit(record.filingId, seed, ratios));
    }
  }

  // Leakage check: no same filingId in multiple splits (guaranteed by dedup + map, but verify)
  const leakageIssues: PdfDecisionDatasetQualityIssue[] = [];
  const filingToSplit = new Map<string, PdfDecisionDatasetSplitName>();
  for (const [filingId, split] of splitMap) {
    const existing = filingToSplit.get(filingId);
    if (existing && existing !== split) {
      leakageIssues.push({
        severity: "ERROR",
        code: "POTENTIAL_LEAKAGE",
        message: `Filing ${filingId} appears in both "${existing}" and "${split}" splits.`,
        filingId,
      });
    }
    filingToSplit.set(filingId, split);
  }

  const splitRecords: PdfDecisionDatasetSplitRecord[] = uniqueRecords.map((record) => ({
    ...record,
    split: splitMap.get(record.filingId) ?? "train",
  }));

  const splitCounts: Record<PdfDecisionDatasetSplitName, number> = {
    train: 0,
    validation: 0,
    test: 0,
  };
  for (const record of splitRecords) {
    splitCounts[record.split] += 1;
  }

  return {
    version: "pdf-decision-dataset-split-v1",
    generatedAt: new Date().toISOString(),
    seed,
    ratios,
    recordCount: splitRecords.length,
    splitCounts,
    leakageIssues,
    records: splitRecords,
  };
}
