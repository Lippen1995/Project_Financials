import {
  validatePdfDecisionMlFeatureDataset,
  type PdfDecisionMlFeatureDataset,
  type PdfDecisionMlFeatureRecord,
} from "@/server/services/pdf-decision-ml-feature-schema-service";

function wrapAndValidate(records: PdfDecisionMlFeatureRecord[]): PdfDecisionMlFeatureDataset {
  const dataset: PdfDecisionMlFeatureDataset = {
    version: "pdf-decision-ml-feature-dataset-v1",
    generatedAt: new Date().toISOString(),
    schemaVersion: "pdf-decision-ml-features-v1",
    input: { limit: records.length, includeText: false },
    recordCount: records.length,
    records,
  };
  const { valid, issues } = validatePdfDecisionMlFeatureDataset(dataset);
  if (!valid) {
    throw new Error(`Invalid feature dataset: ${issues.slice(0, 3).join("; ")}`);
  }
  return dataset;
}

function parseJsonl(text: string): PdfDecisionMlFeatureDataset {
  const lines = text.split("\n").filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    throw new Error("JSONL input contains no records.");
  }
  const records: PdfDecisionMlFeatureRecord[] = [];
  for (let i = 0; i < lines.length; i++) {
    let record: unknown;
    try {
      record = JSON.parse(lines[i].trim());
    } catch (err) {
      throw new Error(
        `Invalid JSONL at line ${i + 1}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (!record || typeof record !== "object") {
      throw new Error(`Invalid JSONL at line ${i + 1}: expected an object.`);
    }
    records.push(record as PdfDecisionMlFeatureRecord);
  }
  return wrapAndValidate(records);
}

export function parsePdfDecisionMlFeatureDatasetFromJsonOrJsonl(
  input: string,
): PdfDecisionMlFeatureDataset {
  const trimmed = input.trim();

  // Try JSON parse first; fall through to JSONL if it fails
  let parsed: unknown = undefined;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    // Not valid single-value JSON — will try JSONL below
  }

  if (parsed !== undefined) {
    // Array of records
    if (Array.isArray(parsed)) {
      return wrapAndValidate(parsed as PdfDecisionMlFeatureRecord[]);
    }

    if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;

      // Full dataset envelope
      if (obj.version === "pdf-decision-ml-feature-dataset-v1") {
        const dataset = parsed as PdfDecisionMlFeatureDataset;
        const { valid, issues } = validatePdfDecisionMlFeatureDataset(dataset);
        if (!valid) {
          throw new Error(`Invalid feature dataset: ${issues.slice(0, 3).join("; ")}`);
        }
        return dataset;
      }

      // Single feature record (or anything else) — wrap and validate
      return wrapAndValidate([parsed as PdfDecisionMlFeatureRecord]);
    }
  }

  // JSON parse failed — try JSONL (multiple JSON objects, one per line)
  return parseJsonl(trimmed);
}
