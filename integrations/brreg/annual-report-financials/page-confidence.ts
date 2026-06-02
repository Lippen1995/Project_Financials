import { StatementSectionType } from "@/integrations/brreg/annual-report-financials/taxonomy";
import {
  AnnualReportParsedInputPage,
  PageClassification,
  ReconstructedRow,
} from "@/integrations/brreg/annual-report-financials/types";

// ─────────────────────────────────────────────────────────────────────────
// Per-page extraction confidence
//
// The aggregate filing score (calculateConfidenceScore) collapses the whole
// document into one number. That is fine for a publish gate, but it hides
// *where* a document is weak — and the self-correcting extraction loop needs
// exactly that: which page to rework, and whether the weakness is character
// recognition or structural reconstruction.
//
// This module keeps the confidence localised and split into the signals the
// loop's diagnosis step depends on:
//   - recognition   — were the characters read correctly (OCR concern only)
//   - reconstruction — were rows and year columns assembled correctly
// Recognition failure and reconstruction failure leave different
// fingerprints: weak OCR drags recognition down; a clean read whose grid
// could not be rebuilt drags reconstruction down while recognition stays
// high. The loop routes on that distinction.
//
// This is a measurement layer only — it does not change publish behaviour.
// ─────────────────────────────────────────────────────────────────────────

/** Below this, character recognition is too weak to trust — re-OCR. */
const RECOGNITION_WEAK = 0.7;
/** Below this, row/column reconstruction is shaky — try another rebuild. */
const RECONSTRUCTION_WEAK = 0.7;
/**
 * Below this, the page classification itself is uncertain. Matches the 0.74
 * page-confidence threshold the publish gate already uses.
 */
const CLASSIFICATION_WEAK = 0.74;

export type PageConfidenceDiagnosis =
  | "ok"
  | "recognition"
  | "reconstruction"
  | "classification";

export type PageConfidence = {
  pageNumber: number;
  sectionType: StatementSectionType;
  /** Overall extraction confidence for this page (0..1). */
  overall: number;
  /** How sure the classifier is the page is the type it was labelled. */
  classification: number;
  /** Unit-scale confidence for this page. */
  unitScale: number;
  /**
   * Recognition confidence — how cleanly characters were read. Embedded text
   * and structured engines score 1 (recognition is not their failure mode);
   * weak OCR scores low.
   */
  recognition: number;
  /**
   * Reconstruction confidence — how cleanly rows and year columns assembled,
   * independent of recognition.
   */
  reconstruction: number;
  /** Reconstructed statement rows attributed to this page. */
  rowCount: number;
  /** The dominant weakness, for the loop's diagnosis step. */
  diagnosis: PageConfidenceDiagnosis;
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function round4(value: number): number {
  return Number(value.toFixed(4));
}

function numberFrom(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function pageMetadata(
  page: AnnualReportParsedInputPage | undefined,
): Record<string, unknown> | undefined {
  return page && "metadata" in page ? page.metadata : undefined;
}

/**
 * Recognition is only a real concern for pages that were pixel-OCR'd. For an
 * embedded text layer or a structured engine the characters came verbatim
 * from the document, so recognition is not the failure mode.
 */
function recognitionConfidence(page: AnnualReportParsedInputPage | undefined): number {
  const ocrDerived = pageMetadata(page)?.ocrDerived === true;
  if (!ocrDerived) {
    return 1;
  }
  if (!page || page.lines.length === 0) {
    // An OCR page that yielded no lines at all is genuinely weak.
    return 0.5;
  }
  const total = page.lines.reduce(
    (sum, line) => sum + (Number.isFinite(line.confidence) ? line.confidence : 0),
    0,
  );
  return clamp01(total / page.lines.length);
}

function reconstructionConfidence(input: {
  page: AnnualReportParsedInputPage | undefined;
  classification: PageClassification;
  rowCount: number;
}): number {
  const metadata = pageMetadata(input.page);
  const rowCandidateCount = numberFrom(metadata?.rowCandidateCount);
  const ambiguousRowCount = numberFrom(metadata?.ambiguousRowCount);
  if (rowCandidateCount !== null && rowCandidateCount > 0 && ambiguousRowCount !== null) {
    // OCR pages carry a direct row-ambiguity measurement: the share of
    // candidate rows whose columns could not be assigned confidently.
    return clamp01(1 - ambiguousRowCount / rowCandidateCount);
  }
  // Pages without an ambiguity metric (embedded text, structured engines):
  // judge by whether a table-like page actually yielded its numeric rows.
  if (!input.classification.tableLike) {
    return 0.5;
  }
  const expectedRows = Math.max(input.classification.numericRowCount, 1);
  const ratio = Math.min(1, input.rowCount / expectedRows);
  return clamp01(0.3 + 0.65 * ratio);
}

function diagnose(signals: {
  classification: number;
  unitScale: number;
  recognition: number;
  reconstruction: number;
}): PageConfidenceDiagnosis {
  // Recognition is checked first: if the characters are wrong, reconstruction
  // built on top of them is meaningless. Then reconstruction, then the
  // classification/unit-scale signals.
  if (signals.recognition < RECOGNITION_WEAK) return "recognition";
  if (signals.reconstruction < RECONSTRUCTION_WEAK) return "reconstruction";
  if (Math.min(signals.classification, signals.unitScale) < CLASSIFICATION_WEAK) {
    return "classification";
  }
  return "ok";
}

/**
 * Computes a per-page extraction confidence for every classified page. Pure
 * and side-effect free — the self-correcting loop reads the result to decide
 * which page to rework and how.
 */
export function computePageConfidences(input: {
  parsedPages: AnnualReportParsedInputPage[];
  classifications: PageClassification[];
  rows: ReconstructedRow[];
}): PageConfidence[] {
  const pageByNumber = new Map(
    input.parsedPages.map((page) => [page.pageNumber, page]),
  );
  const rowCountByPage = new Map<number, number>();
  for (const row of input.rows) {
    rowCountByPage.set(row.pageNumber, (rowCountByPage.get(row.pageNumber) ?? 0) + 1);
  }

  return input.classifications.map((classification) => {
    const page = pageByNumber.get(classification.pageNumber);
    const rowCount = rowCountByPage.get(classification.pageNumber) ?? 0;
    const classificationConfidence = clamp01(classification.confidence);
    const unitScaleConfidence = clamp01(classification.unitScaleConfidence);
    const recognition = recognitionConfidence(page);
    const reconstruction = reconstructionConfidence({ page, classification, rowCount });
    const overall = clamp01(
      classificationConfidence * 0.25 +
        unitScaleConfidence * 0.15 +
        recognition * 0.3 +
        reconstruction * 0.3,
    );

    return {
      pageNumber: classification.pageNumber,
      sectionType: classification.type,
      overall: round4(overall),
      classification: round4(classificationConfidence),
      unitScale: round4(unitScaleConfidence),
      recognition: round4(recognition),
      reconstruction: round4(reconstruction),
      rowCount,
      diagnosis: diagnose({
        classification: classificationConfidence,
        unitScale: unitScaleConfidence,
        recognition,
        reconstruction,
      }),
    };
  });
}
