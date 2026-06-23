import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { PrismaClient } from "@prisma/client";

import {
  serializeValidationPayload,
  validateReviewedFacts,
} from "../server/services/annual-report-reviewed-facts-validation";

const prisma = new PrismaClient({ log: ["warn", "error"] });

const EVIDENCE_SOURCE = "PDF_VISUALLY_VERIFIED_AS_REPORTED_GOLD_SET_2026_06_23";
const VISUAL_ROOT = "output/manual-review-visuals";
const ARTIFACT_ROOT = "output/annual-report-artifacts";
const REPORT_PATH = join(VISUAL_ROOT, "as-reported-gold-verification-report.json");
const JOTUN_REPORT_PATH = "output/annual-report-as-reported-gold-verification-jotun-2024.json";
const REITAN_FILING_ID = "cmq28bcjn0024vmecn1ob6usc";
const JOTUN_FILING_ID = "cmq28bbxo0008vmecm33zomyz";

type JsonObject = Record<string, unknown>;

type ExtractionFact = {
  sourcePage?: number | null;
  statementScope?: "COMPANY" | "CONSOLIDATED" | null;
};

type JotunReport = {
  rows: Array<{
    page: number;
    rawLabel: string;
    values: Record<string, number>;
  }>;
};

type VerificationIssue = {
  severity: "ERROR" | "WARNING";
  code: string;
  message: string;
  filingId?: string;
  reviewId?: string | null;
  labelId?: string;
  factId?: string;
  context?: JsonObject;
};

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

function asString(value: unknown) {
  return typeof value === "string" ? value : value === null || value === undefined ? null : String(value);
}

function cleanRawLabel(rawLabel: string) {
  return rawLabel
    .replace(/\bLenn/g, "Lønn")
    .replace(/\blenn/g, "lønn")
    .replace(/^sun\b/i, "Sum")
    .replace(/Resultat f\?r/g, "Resultat før")
    .replace(/\?rsresultat/g, "Årsresultat")
    .replace(/oml\?psmidler/g, "omløpsmidler")
    .replace(/Leverand\?rgjeld/g, "Leverandørgjeld")
    .trim();
}

function labelHasOcrDrift(rawLabel: string) {
  return /(?:\bLenn|\bsun\s|\?|Ã|�)/.test(rawLabel);
}

function factIdentity(input: {
  reviewId: string | null | undefined;
  metricKey: unknown;
  statementScope: unknown;
  fiscalYear: unknown;
  rawLabel: unknown;
}) {
  return [
    input.reviewId ?? "",
    asString(input.metricKey) ?? "",
    asString(input.statementScope) ?? "",
    String(input.fiscalYear ?? ""),
    (asString(input.rawLabel) ?? "").toLowerCase().trim(),
  ].join("|");
}

function jsonBigInt(value: bigint | number | string | null | undefined) {
  if (value === null || value === undefined) return null;
  return String(value);
}

function issue(
  issues: VerificationIssue[],
  input: Omit<VerificationIssue, "severity"> & { severity?: "ERROR" | "WARNING" },
) {
  issues.push({ severity: input.severity ?? "ERROR", ...input });
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function pageScopeMajority(mappedFacts: ExtractionFact[], page: number | null | undefined) {
  if (!page) return null;
  const counts = new Map<"COMPANY" | "CONSOLIDATED", number>();
  for (const fact of mappedFacts) {
    if (fact.sourcePage !== page) continue;
    if (fact.statementScope !== "COMPANY" && fact.statementScope !== "CONSOLIDATED") continue;
    counts.set(fact.statementScope, (counts.get(fact.statementScope) ?? 0) + 1);
  }
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return entries[0]?.[0] ?? null;
}

async function main() {
  const labels = await prisma.pdfTrainingLabel.findMany({
    where: {
      labelType: "FACT_VALUE",
      sourcePayload: { path: ["evidenceSource"], equals: EVIDENCE_SOURCE },
    },
    orderBy: [{ filingId: "asc" }, { createdAt: "asc" }],
  });

  const reviewIds = [...new Set(labels.map((label) => label.reviewId).filter(Boolean))] as string[];
  const facts = await prisma.annualReportReviewedFact.findMany({
    where: { reviewId: { in: reviewIds } },
    include: { filing: { include: { company: true } } },
    orderBy: [{ filingId: "asc" }, { sourcePage: "asc" }, { rawLabel: "asc" }, { fiscalYear: "desc" }],
  });

  const factsByIdentity = new Map(
    facts.map((fact) => [
      factIdentity({
        reviewId: fact.reviewId,
        metricKey: fact.metricKey,
        statementScope: fact.statementScope,
        fiscalYear: fact.fiscalYear,
        rawLabel: fact.rawLabel,
      }),
      fact,
    ]),
  );
  const factsByReview = Map.groupBy(facts, (fact) => fact.reviewId);
  const labelsByFiling = Map.groupBy(labels, (label) => label.filingId);
  const manifest = readJson<Array<{ filingId: string; targetPages: number[] }>>(join(VISUAL_ROOT, "manifest.json"));
  const manifestByFiling = new Map(manifest.map((entry) => [entry.filingId, entry]));

  const iterations: Array<{ name: string; issues: VerificationIssue[] }> = [
    { name: "1. label/fact parity and Som rapportert flags", issues: [] },
    { name: "2. fact value and training-label consistency", issues: [] },
    { name: "3. annual-report row value and note alignment", issues: [] },
    { name: "4. konsern/selskap scope consistency", issues: [] },
    { name: "5. reconciliation and anomaly scan", issues: [] },
  ];

  for (const label of labels) {
    const accepted = asObject(label.acceptedValue);
    const target = asObject(label.targetRef);
    const source = asObject(label.sourcePayload);
    const rawLabel = asString(accepted.rawLabel) ?? asString(target.rawLabel) ?? "";
    const identity = factIdentity({
      reviewId: label.reviewId,
      metricKey: accepted.metricKey ?? target.metricKey,
      statementScope: accepted.statementScope ?? target.statementScope,
      fiscalYear: accepted.fiscalYear ?? target.fiscalYear,
      rawLabel,
    });
    const fact = factsByIdentity.get(identity);

    if (!fact) {
      issue(iterations[0].issues, {
        code: "MISSING_REVIEWED_FACT",
        message: "Training label has no matching reviewed fact.",
        filingId: label.filingId,
        reviewId: label.reviewId,
        labelId: label.id,
        context: { rawLabel, metricKey: accepted.metricKey ?? target.metricKey },
      });
      continue;
    }

    if (accepted.asReported !== true || accepted.somRapportert !== true || target.somRapportert !== true) {
      issue(iterations[0].issues, {
        code: "SOM_RAPPORTERT_NOT_TRUE",
        message: "Som rapportert/asReported flags must all be true.",
        filingId: label.filingId,
        reviewId: label.reviewId,
        labelId: label.id,
        context: { rawLabel },
      });
    }
    if (source.evidenceSource !== EVIDENCE_SOURCE) {
      issue(iterations[0].issues, {
        code: "WRONG_EVIDENCE_SOURCE",
        message: "Training label does not carry the expected visual verification marker.",
        filingId: label.filingId,
        reviewId: label.reviewId,
        labelId: label.id,
        context: { evidenceSource: source.evidenceSource },
      });
    }
    if (labelHasOcrDrift(rawLabel)) {
      issue(iterations[0].issues, {
        code: "SUSPICIOUS_LABEL_TEXT",
        message: "Raw label still contains known OCR drift.",
        filingId: label.filingId,
        reviewId: label.reviewId,
        labelId: label.id,
        context: { rawLabel },
      });
    }

    const acceptedValue = asString(accepted.value);
    const acceptedFinalInput = asString(accepted.finalInput);
    if (acceptedValue !== jsonBigInt(fact.value) || acceptedFinalInput !== jsonBigInt(fact.finalInput)) {
      issue(iterations[1].issues, {
        code: "LABEL_FACT_VALUE_MISMATCH",
        message: "Accepted training-label value does not match reviewed fact value/finalInput.",
        filingId: label.filingId,
        reviewId: label.reviewId,
        labelId: label.id,
        factId: fact.id,
        context: { rawLabel, acceptedValue, acceptedFinalInput, factValue: jsonBigInt(fact.value), factFinalInput: jsonBigInt(fact.finalInput) },
      });
    }
    if (jsonBigInt(fact.value) !== jsonBigInt(fact.finalInput)) {
      issue(iterations[1].issues, {
        code: "FACT_VALUE_FINAL_INPUT_MISMATCH",
        message: "Reviewed fact value and finalInput differ.",
        filingId: label.filingId,
        reviewId: label.reviewId,
        factId: fact.id,
        context: { rawLabel, value: jsonBigInt(fact.value), finalInput: jsonBigInt(fact.finalInput) },
      });
    }
    if (fact.unitScale !== 1 || accepted.unitScale !== 1) {
      issue(iterations[1].issues, {
        code: "UNIT_SCALE_NOT_ONE",
        message: "Gold facts must be stored as whole NOK with unitScale 1.",
        filingId: label.filingId,
        reviewId: label.reviewId,
        labelId: label.id,
        factId: fact.id,
        context: { rawLabel, factUnitScale: fact.unitScale, acceptedUnitScale: accepted.unitScale },
      });
    }

    const evidencePages = Array.isArray(source.visualEvidencePages) ? source.visualEvidencePages : [];
    if (evidencePages.length === 0 || evidencePages.some((path) => typeof path !== "string" || !existsSync(path))) {
      issue(iterations[2].issues, {
        code: "MISSING_VISUAL_EVIDENCE_PAGE",
        message: "Visual evidence page path is missing or does not exist on disk.",
        filingId: label.filingId,
        reviewId: label.reviewId,
        labelId: label.id,
        context: { rawLabel, evidencePages },
      });
    }

    const proposed = asObject(label.proposedValue);
    if (label.filingId !== REITAN_FILING_ID && label.filingId !== JOTUN_FILING_ID) {
      if (asString(proposed.rawValue) !== acceptedValue) {
        issue(iterations[2].issues, {
          code: "SOURCE_ROW_VALUE_MISMATCH",
          message: "Accepted value does not match the annual-report row value captured during population.",
          filingId: label.filingId,
          reviewId: label.reviewId,
          labelId: label.id,
          factId: fact.id,
          context: { rawLabel, acceptedValue, sourceRawValue: proposed.rawValue, sourceRowText: source.sourceRowText },
        });
      }
    }

    const noteReference = asString(source.noteReference);
    if (noteReference && acceptedValue === noteReference) {
      issue(iterations[2].issues, {
        code: "NOTE_REFERENCE_USED_AS_VALUE",
        message: "Accepted value equals the note reference.",
        filingId: label.filingId,
        reviewId: label.reviewId,
        labelId: label.id,
        factId: fact.id,
        context: { rawLabel, noteReference, acceptedValue },
      });
    }

    if (
      fact.statementScope !== accepted.statementScope ||
      fact.statementScope !== target.statementScope ||
      fact.statementType !== accepted.statementType ||
      fact.statementType !== target.statementType
    ) {
      issue(iterations[3].issues, {
        code: "LABEL_FACT_SCOPE_TYPE_MISMATCH",
        message: "Training-label statement scope/type differs from reviewed fact.",
        filingId: label.filingId,
        reviewId: label.reviewId,
        labelId: label.id,
        factId: fact.id,
        context: {
          rawLabel,
          factScope: fact.statementScope,
          acceptedScope: accepted.statementScope,
          targetScope: target.statementScope,
          factType: fact.statementType,
          acceptedType: accepted.statementType,
          targetType: target.statementType,
        },
      });
    }
  }

  for (const [filingId, filingLabels] of labelsByFiling) {
    if (filingId === REITAN_FILING_ID) {
      for (const label of filingLabels) {
        const accepted = asObject(label.acceptedValue);
        if (accepted.statementScope !== "CONSOLIDATED" || accepted.sourceUnitScale !== 1_000_000) {
          issue(iterations[3].issues, {
            code: "REITAN_MANUAL_SCOPE_OR_SCALE_MISMATCH",
            message: "Reitan manual rows must be consolidated and sourced from NOK million.",
            filingId,
            reviewId: label.reviewId,
            labelId: label.id,
            context: { rawLabel: accepted.rawLabel, statementScope: accepted.statementScope, sourceUnitScale: accepted.sourceUnitScale },
          });
        }
      }
      continue;
    }

    if (filingId === JOTUN_FILING_ID) {
      for (const label of filingLabels) {
        const accepted = asObject(label.acceptedValue);
        if (accepted.statementScope !== "CONSOLIDATED") {
          issue(iterations[3].issues, {
            code: "JOTUN_SCOPE_MISMATCH",
            message: "Jotun 2024 gold rows are visually verified as consolidated statements.",
            filingId,
            reviewId: label.reviewId,
            labelId: label.id,
            context: { rawLabel: accepted.rawLabel, statementScope: accepted.statementScope },
          });
        }
      }
      continue;
    }

    const extractionPath = join(ARTIFACT_ROOT, filingId, "extraction_json", "extraction.json");
    if (!existsSync(extractionPath)) continue;
    const extraction = readJson<{ mappedFacts?: ExtractionFact[] }>(extractionPath);
    for (const label of filingLabels) {
      const accepted = asObject(label.acceptedValue);
      const page = Number(accepted.sourcePage);
      const expectedScope = pageScopeMajority(extraction.mappedFacts ?? [], page);
      if (expectedScope && accepted.statementScope !== expectedScope) {
        issue(iterations[3].issues, {
          code: "PAGE_SCOPE_MAJORITY_MISMATCH",
          message: "Saved konsern/selskap scope differs from the extraction page majority.",
          filingId,
          reviewId: label.reviewId,
          labelId: label.id,
          context: { rawLabel: accepted.rawLabel, page, acceptedScope: accepted.statementScope, expectedScope },
        });
      }
    }
  }

  if (existsSync(JOTUN_REPORT_PATH)) {
    const jotun = readJson<JotunReport>(JOTUN_REPORT_PATH);
    const jotunLabels = labelsByFiling.get(JOTUN_FILING_ID) ?? [];
    const jotunIndex = new Map(
      jotunLabels.map((label) => {
        const accepted = asObject(label.acceptedValue);
        return [
          `${cleanRawLabel(String(accepted.rawLabel))}|${String(accepted.fiscalYear)}|${String(accepted.sourcePage)}`,
          asString(accepted.value),
        ];
      }),
    );
    for (const row of jotun.rows) {
      for (const [year, value] of Object.entries(row.values)) {
        const key = `${cleanRawLabel(row.rawLabel)}|${year}|${row.page}`;
        const acceptedValue = jotunIndex.get(key);
        if (acceptedValue !== String(value)) {
          issue(iterations[2].issues, {
            code: "JOTUN_SOURCE_VALUE_MISMATCH",
            message: "Jotun value differs from the visually verified Jotun report row file.",
            filingId: JOTUN_FILING_ID,
            context: { rawLabel: cleanRawLabel(row.rawLabel), year, page: row.page, expected: String(value), acceptedValue },
          });
        }
      }
    }
  }

  for (const [reviewId, reviewFacts] of factsByReview) {
    const validation = validateReviewedFacts(
      reviewFacts.map((fact) => ({
        metricKey: fact.metricKey,
        fiscalYear: fact.fiscalYear,
        statementType: fact.statementType,
        statementScope: fact.statementScope,
        value: fact.value,
        unitScale: fact.unitScale,
        sourcePage: fact.sourcePage,
        rawLabel: fact.rawLabel,
      })),
    );
    if (validation.hasBlockingErrors) {
      issue(iterations[4].issues, {
        code: "BLOCKING_RECONCILIATION_ERROR",
        message: "Reviewed facts fail reconciliation validation.",
        filingId: reviewFacts[0]?.filingId,
        reviewId,
        context: serializeValidationPayload(validation, reviewFacts.length) as unknown as JsonObject,
      });
    }
  }

  const errorCount = iterations.reduce((sum, iteration) => sum + iteration.issues.filter((item) => item.severity === "ERROR").length, 0);
  const warningCount = iterations.reduce((sum, iteration) => sum + iteration.issues.filter((item) => item.severity === "WARNING").length, 0);
  const documentSummary = [...labelsByFiling.entries()].map(([filingId, filingLabels]) => {
    const firstFact = facts.find((fact) => fact.filingId === filingId);
    return {
      filingId,
      companyName: firstFact?.filing.company.name ?? null,
      fiscalYear: firstFact?.filing.fiscalYear ?? null,
      labels: filingLabels.length,
      facts: facts.filter((fact) => fact.filingId === filingId).length,
      manifestPages: manifestByFiling.get(filingId)?.targetPages ?? null,
    };
  });

  mkdirSync(VISUAL_ROOT, { recursive: true });
  writeFileSync(
    REPORT_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        evidenceSource: EVIDENCE_SOURCE,
        passed: errorCount === 0,
        iterations: iterations.map((iteration) => ({
          name: iteration.name,
          passed: iteration.issues.every((item) => item.severity !== "ERROR"),
          errorCount: iteration.issues.filter((item) => item.severity === "ERROR").length,
          warningCount: iteration.issues.filter((item) => item.severity === "WARNING").length,
          issues: iteration.issues,
        })),
        totals: {
          documents: documentSummary.length,
          labels: labels.length,
          reviewedFacts: facts.length,
          errors: errorCount,
          warnings: warningCount,
        },
        documents: documentSummary,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(readFileSync(REPORT_PATH, "utf8"));
  if (errorCount > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
