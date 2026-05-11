import fs from "node:fs/promises";
import path from "node:path";

import {
  buildAnnualReportManualReviewRound,
  readLatestAnnualReportManualReviewRound,
  type AnnualReportManualReviewCandidate,
  type AnnualReportManualReviewRound,
  type AnnualReportManualReviewSeverity,
} from "@/server/services/annual-report-manual-review-round-service";

const FAILURE_TAXONOMY_OUTPUT_DIR = path.join(
  process.cwd(),
  "output",
  "benchmarks",
  "annual-report-unified-failure-taxonomy",
);

const FAILURE_TAXONOMY_ISSUE_CLASSES = [
  "ARTIFACT_MISSING",
  "SOURCE_PDF_MISSING",
  "STRUCTURED_DOCUMENT_MISSING",
  "PREFLIGHT_UNAVAILABLE",
  "PARSER_RUNTIME_UNAVAILABLE",
  "OCR_REQUIRED_OR_LOW_QUALITY_SCAN",
  "OCR_TOKEN_NOISE",
  "TABLE_RECONSTRUCTION_ERROR",
  "MULTI_PAGE_BALANCE_ERROR",
  "COLUMN_ALIGNMENT_ERROR",
  "UNIT_SCALE_UNKNOWN",
  "UNIT_SCALE_MISMATCH",
  "NEGATIVE_NUMBER_FORMAT_ERROR",
  "NORWEGIAN_LABEL_MAPPING_ERROR",
  "PRIMARY_INCOME_STATEMENT_MISSING",
  "PRIMARY_BALANCE_SHEET_MISSING",
  "CASH_FLOW_MISSING",
  "CANONICAL_KEY_MISSING",
  "LARGE_NUMERIC_DEVIATION",
  "LEGACY_UNIFIED_MISMATCH",
  "NARRATIVE_SECTION_MISSING",
  "AUDITOR_REPORT_MISSING",
  "BOARD_REPORT_MISSING",
  "AMBIGUOUS_REPORT_STRUCTURE",
  "MANUAL_REVIEW_EXPECTED",
  "UNKNOWN_FAILURE",
] as const;

const FAILURE_TAXONOMY_SEVERITIES = ["HIGH", "MEDIUM", "LOW"] as const;

const PRIORITY_KEYS = new Set([
  "revenue",
  "operating_result",
  "net_income",
  "total_assets",
  "total_equity",
  "total_liabilities",
  "cash_and_cash_equivalents",
]);

type FailureIssueClass = (typeof FAILURE_TAXONOMY_ISSUE_CLASSES)[number];
type FailureSeverity = (typeof FAILURE_TAXONOMY_SEVERITIES)[number];

type FailureSource =
  | "manual_review_issue_class"
  | "confidence_gate_check"
  | "artifact_ref"
  | "financial_comparison"
  | "narrative_comparison"
  | "gold_set_tag"
  | "divergence_stage"
  | "candidate_text";

type FailureRemediationArea =
  | "artifact_pipeline"
  | "parser_runtime"
  | "ocr_quality"
  | "table_reconstruction"
  | "unit_scale_normalization"
  | "financial_mapping"
  | "narrative_segmentation"
  | "review_policy"
  | "unknown";

type FailureClassMeta = {
  severity: FailureSeverity;
  explanationNo: string;
  remediationArea: FailureRemediationArea;
};

const FAILURE_CLASS_META: Record<FailureIssueClass, FailureClassMeta> = {
  ARTIFACT_MISSING: {
    severity: "MEDIUM",
    explanationNo: "Et nødvendig mellomresultat mangler, så rapporten kan ikke vurderes fullt ut.",
    remediationArea: "artifact_pipeline",
  },
  SOURCE_PDF_MISSING: {
    severity: "HIGH",
    explanationNo: "Original PDF mangler, så grunnlaget for kontroll og ny kjøring er borte.",
    remediationArea: "artifact_pipeline",
  },
  STRUCTURED_DOCUMENT_MISSING: {
    severity: "HIGH",
    explanationNo: "Strukturert dokument mangler, så unified-løpet mister viktig mellomgrunnlag.",
    remediationArea: "artifact_pipeline",
  },
  PREFLIGHT_UNAVAILABLE: {
    severity: "MEDIUM",
    explanationNo: "PDF-kvalitetssjekken mangler eller kunne ikke brukes.",
    remediationArea: "artifact_pipeline",
  },
  PARSER_RUNTIME_UNAVAILABLE: {
    severity: "HIGH",
    explanationNo: "Parser- eller runtime-miljøet var ikke tilgjengelig da rapporten skulle behandles.",
    remediationArea: "parser_runtime",
  },
  OCR_REQUIRED_OR_LOW_QUALITY_SCAN: {
    severity: "MEDIUM",
    explanationNo: "PDF-en ser ut til å være skannet eller ha så lav kvalitet at OCR eller ekstra kontroll trengs.",
    remediationArea: "ocr_quality",
  },
  OCR_TOKEN_NOISE: {
    severity: "MEDIUM",
    explanationNo: "OCR-støy gjør at tall eller tekst blir delt opp, slått sammen eller lest feil.",
    remediationArea: "ocr_quality",
  },
  TABLE_RECONSTRUCTION_ERROR: {
    severity: "HIGH",
    explanationNo: "Tabellstrukturen ble ikke gjenoppbygd stabilt nok til å stole på radene og kolonnene.",
    remediationArea: "table_reconstruction",
  },
  MULTI_PAGE_BALANCE_ERROR: {
    severity: "HIGH",
    explanationNo: "Balansen ser ut til å være delt over flere sider på en måte som gir feil eller manglende totalsummer.",
    remediationArea: "table_reconstruction",
  },
  COLUMN_ALIGNMENT_ERROR: {
    severity: "MEDIUM",
    explanationNo: "Tall eller årskolonner ser ut til å være koblet til feil rad eller kolonne.",
    remediationArea: "table_reconstruction",
  },
  UNIT_SCALE_UNKNOWN: {
    severity: "HIGH",
    explanationNo: "Systemet vet ikke om tallene er oppgitt i kroner, tusen eller millioner.",
    remediationArea: "unit_scale_normalization",
  },
  UNIT_SCALE_MISMATCH: {
    severity: "HIGH",
    explanationNo: "Legacy og unified ser ut til å bruke ulik enhetsskala for de samme tallene.",
    remediationArea: "unit_scale_normalization",
  },
  NEGATIVE_NUMBER_FORMAT_ERROR: {
    severity: "MEDIUM",
    explanationNo: "Negative tall ser ut til å være tolket feil, for eksempel parenteser eller minustegn.",
    remediationArea: "financial_mapping",
  },
  NORWEGIAN_LABEL_MAPPING_ERROR: {
    severity: "HIGH",
    explanationNo: "Norske regnskapslinjer ser ut til å være mappet til feil canonical key eller tolket ulikt.",
    remediationArea: "financial_mapping",
  },
  PRIMARY_INCOME_STATEMENT_MISSING: {
    severity: "HIGH",
    explanationNo: "Resultatregnskapet ser ut til å mangle eller være for svakt identifisert.",
    remediationArea: "financial_mapping",
  },
  PRIMARY_BALANCE_SHEET_MISSING: {
    severity: "HIGH",
    explanationNo: "Balansen ser ut til å mangle eller være for svakt identifisert.",
    remediationArea: "financial_mapping",
  },
  CASH_FLOW_MISSING: {
    severity: "LOW",
    explanationNo: "Kontantstrømopplysninger mangler eller er ikke tydelig segmentert.",
    remediationArea: "narrative_segmentation",
  },
  CANONICAL_KEY_MISSING: {
    severity: "HIGH",
    explanationNo: "Minst ett sentralt nøkkelfelt mangler i én av ekstraksjonsrutene.",
    remediationArea: "financial_mapping",
  },
  LARGE_NUMERIC_DEVIATION: {
    severity: "HIGH",
    explanationNo: "Viktige tall avviker for mye mellom legacy og unified til å regnes som trygge.",
    remediationArea: "financial_mapping",
  },
  LEGACY_UNIFIED_MISMATCH: {
    severity: "MEDIUM",
    explanationNo: "Legacy og unified gir ulike resultater for samme rapport og krever forklaring.",
    remediationArea: "review_policy",
  },
  NARRATIVE_SECTION_MISSING: {
    severity: "MEDIUM",
    explanationNo: "Styreberetning, revisorberetning eller annen narrativ seksjon mangler eller er for svak.",
    remediationArea: "narrative_segmentation",
  },
  AUDITOR_REPORT_MISSING: {
    severity: "LOW",
    explanationNo: "Revisorberetningen ble ikke funnet eller segmentert tydelig.",
    remediationArea: "narrative_segmentation",
  },
  BOARD_REPORT_MISSING: {
    severity: "LOW",
    explanationNo: "Styrets beretning ble ikke funnet eller segmentert tydelig.",
    remediationArea: "narrative_segmentation",
  },
  AMBIGUOUS_REPORT_STRUCTURE: {
    severity: "MEDIUM",
    explanationNo: "Rapportstrukturen er uklar nok til at ekstra manuell kontroll er nødvendig.",
    remediationArea: "table_reconstruction",
  },
  MANUAL_REVIEW_EXPECTED: {
    severity: "LOW",
    explanationNo: "Denne rapporttypen er på forhånd markert som en sak som ofte krever manuell kontroll.",
    remediationArea: "review_policy",
  },
  UNKNOWN_FAILURE: {
    severity: "MEDIUM",
    explanationNo: "Det finnes et review-signal, men det er ikke mulig å klassifisere årsaken mer presist ennå.",
    remediationArea: "unknown",
  },
};

export type AnnualReportUnifiedFailureTaxonomyInput = {
  runId?: string;
  generatedBy?: string | null;
};

export type AnnualReportUnifiedFailureTaxonomyIssue = {
  candidateId: string;
  runId: string;
  filingId: string;
  orgNumber: string | null;
  companyName: string | null;
  accountingYear: number | null;
  issueClass: FailureIssueClass;
  severity: FailureSeverity;
  source: FailureSource;
  evidence: string[];
  affectedCanonicalKeys: string[];
  tags: string[];
  firstDivergenceStage: string | null;
  humanExplanationNo: string;
  remediationArea: FailureRemediationArea;
  reviewDecision: string | null;
};

export type AnnualReportUnifiedFailureTaxonomySummary = {
  totalCandidates: number;
  totalMappedIssues: number;
  highSeverityIssueCount: number;
  issueClassCounts: Array<{
    issueClass: FailureIssueClass;
    count: number;
    severity: FailureSeverity;
    remediationArea: FailureRemediationArea;
  }>;
  severityCounts: Record<FailureSeverity, number>;
  affectedTags: Array<{ tag: string; count: number }>;
  affectedCanonicalKeys: Array<{ canonicalKey: string; count: number }>;
  firstDivergenceStages: Array<{ stage: string; count: number }>;
  remediationAreaCounts: Array<{ remediationArea: FailureRemediationArea; count: number }>;
  representativeExamples: Array<{
    issueClass: FailureIssueClass;
    filingId: string;
    companyName: string | null;
    orgNumber: string | null;
    accountingYear: number | null;
    evidence: string[];
  }>;
};

export type AnnualReportUnifiedFailureTaxonomyReport = {
  version: "annual-report-unified-failure-taxonomy-v1";
  generatedAt: string;
  input: {
    runId: string | null;
    generatedBy: string | null;
  };
  sourceRun: {
    reviewRoundId: string | null;
    reviewRoundGeneratedAt: string | null;
    goldSetRunId: string | null;
    manifestName: string | null;
    gitCommitSha: string | null;
  };
  evidenceUsed: {
    totalCandidates: number;
    reviewedCandidates: number;
    pendingCandidates: number;
    blockedCandidates: number;
  };
  summary: AnnualReportUnifiedFailureTaxonomySummary;
  issues: AnnualReportUnifiedFailureTaxonomyIssue[];
  recommendations: {
    pr79ExtractionFixes: string[];
  };
  output: {
    jsonPath: string;
    markdownPath: string;
  };
  safety: {
    canUseForProductionRouting: false;
    productionRoutingChanged: false;
    productionFactsMutated: false;
    publishAffected: false;
  };
};

export type AnnualReportUnifiedFailureTaxonomyServiceDeps = {
  readLatestManualReviewRound?: typeof readLatestAnnualReportManualReviewRound;
  buildManualReviewRound?: typeof buildAnnualReportManualReviewRound;
  writeFile?: typeof fs.writeFile;
  readFile?: typeof fs.readFile;
  mkdir?: typeof fs.mkdir;
  now?: () => Date;
};

type MutableIssue = Omit<AnnualReportUnifiedFailureTaxonomyIssue, "evidence" | "affectedCanonicalKeys" | "tags"> & {
  evidence: Set<string>;
  affectedCanonicalKeys: Set<string>;
  tags: Set<string>;
};

function uniqueStrings(values: Iterable<string>) {
  return Array.from(new Set(Array.from(values).filter((value) => value.trim().length > 0)));
}

function compareSeverity(left: FailureSeverity, right: FailureSeverity) {
  const order: Record<FailureSeverity, number> = {
    HIGH: 3,
    MEDIUM: 2,
    LOW: 1,
  };
  return order[left] - order[right];
}

function outputPaths(now: Date) {
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  return {
    jsonPath: path.join(FAILURE_TAXONOMY_OUTPUT_DIR, `${stamp}.json`),
    markdownPath: path.join(FAILURE_TAXONOMY_OUTPUT_DIR, `${stamp}.md`),
  };
}

function containsKeyword(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

function combinedCandidateText(candidate: AnnualReportManualReviewCandidate) {
  return [
    ...candidate.reviewReasons,
    ...candidate.diagnostics,
    ...candidate.confidenceGateDiagnostics.map((item) => item.message),
  ].join(" | ");
}

function addIssue(
  issueMap: Map<FailureIssueClass, MutableIssue>,
  candidate: AnnualReportManualReviewCandidate,
  issueClass: FailureIssueClass,
  source: FailureSource,
  evidence: string,
  affectedCanonicalKeys: string[] = [],
) {
  const meta = FAILURE_CLASS_META[issueClass];
  const existing = issueMap.get(issueClass);

  if (existing) {
    existing.evidence.add(evidence);
    affectedCanonicalKeys.forEach((key) => existing.affectedCanonicalKeys.add(key));
    candidate.tags.forEach((tag) => existing.tags.add(tag));
    if (compareSeverity(meta.severity, existing.severity) > 0) {
      existing.severity = meta.severity;
    }
    return;
  }

  issueMap.set(issueClass, {
    candidateId: candidate.candidateId,
    runId: candidate.runId,
    filingId: candidate.filingId,
    orgNumber: candidate.orgNumber,
    companyName: candidate.companyName,
    accountingYear: candidate.accountingYear,
    issueClass,
    severity: meta.severity,
    source,
    evidence: new Set([evidence]),
    affectedCanonicalKeys: new Set(affectedCanonicalKeys),
    tags: new Set(candidate.tags),
    firstDivergenceStage: candidate.firstDivergenceStage,
    humanExplanationNo: meta.explanationNo,
    remediationArea: meta.remediationArea,
    reviewDecision: candidate.latestDecision?.decision ?? null,
  });
}

function mapArtifactRefIssues(
  candidate: AnnualReportManualReviewCandidate,
  issueMap: Map<FailureIssueClass, MutableIssue>,
) {
  for (const artifactRef of candidate.artifactRefs) {
    if (artifactRef.status === "available") {
      continue;
    }

    const evidence = `${artifactRef.label} er ${artifactRef.status}.`;
    if (artifactRef.key === "source_pdf") {
      addIssue(issueMap, candidate, "SOURCE_PDF_MISSING", "artifact_ref", evidence);
      addIssue(issueMap, candidate, "ARTIFACT_MISSING", "artifact_ref", evidence);
      continue;
    }
    if (artifactRef.key === "structured_document_json") {
      addIssue(issueMap, candidate, "STRUCTURED_DOCUMENT_MISSING", "artifact_ref", evidence);
      addIssue(issueMap, candidate, "ARTIFACT_MISSING", "artifact_ref", evidence);
      continue;
    }
    if (artifactRef.key === "preflight_artifact") {
      addIssue(issueMap, candidate, "PREFLIGHT_UNAVAILABLE", "artifact_ref", evidence);
      addIssue(issueMap, candidate, "ARTIFACT_MISSING", "artifact_ref", evidence);
      continue;
    }
    addIssue(issueMap, candidate, "ARTIFACT_MISSING", "artifact_ref", evidence);
  }
}

function mapConfidenceGateIssues(
  candidate: AnnualReportManualReviewCandidate,
  issueMap: Map<FailureIssueClass, MutableIssue>,
) {
  for (const diagnostic of candidate.confidenceGateDiagnostics) {
    const evidence = `${diagnostic.checkCode}: ${diagnostic.message}`;
    switch (diagnostic.checkCode) {
      case "UNIT_SCALE_RESOLVED":
        addIssue(issueMap, candidate, "UNIT_SCALE_UNKNOWN", "confidence_gate_check", evidence);
        break;
      case "INCOME_STATEMENT_COVERAGE":
      case "FINANCIAL_EXTRACTION_PRESENT":
        addIssue(
          issueMap,
          candidate,
          "PRIMARY_INCOME_STATEMENT_MISSING",
          "confidence_gate_check",
          evidence,
        );
        break;
      case "BALANCE_SHEET_COVERAGE":
        addIssue(
          issueMap,
          candidate,
          "PRIMARY_BALANCE_SHEET_MISSING",
          "confidence_gate_check",
          evidence,
        );
        break;
      case "REVENUE_FOUND":
      case "NET_INCOME_FOUND":
      case "TOTAL_ASSETS_FOUND":
      case "CANONICAL_KEY_COVERAGE":
        addIssue(issueMap, candidate, "CANONICAL_KEY_MISSING", "confidence_gate_check", evidence);
        break;
      case "NARRATIVE_EXTRACTION_PRESENT":
        addIssue(issueMap, candidate, "NARRATIVE_SECTION_MISSING", "confidence_gate_check", evidence);
        break;
      case "BOARD_REPORT_FOUND":
        addIssue(issueMap, candidate, "BOARD_REPORT_MISSING", "confidence_gate_check", evidence);
        break;
      case "AUDITOR_REPORT_FOUND":
        addIssue(issueMap, candidate, "AUDITOR_REPORT_MISSING", "confidence_gate_check", evidence);
        break;
      case "COMPARISON_MATCH_RATE":
      case "COMPARISON_NO_MAJOR_MISMATCHES":
        addIssue(issueMap, candidate, "LEGACY_UNIFIED_MISMATCH", "confidence_gate_check", evidence);
        break;
      default:
        addIssue(issueMap, candidate, "UNKNOWN_FAILURE", "confidence_gate_check", evidence);
        break;
    }
  }
}

function mapCandidateIssueClasses(
  candidate: AnnualReportManualReviewCandidate,
  issueMap: Map<FailureIssueClass, MutableIssue>,
) {
  for (const issueClass of candidate.issueClasses) {
    switch (issueClass) {
      case "missing_legacy_result":
      case "missing_unified_result":
      case "shadow_comparison_mismatch":
      case "confidence_gate_fail":
      case "confidence_gate_review":
        addIssue(
          issueMap,
          candidate,
          "LEGACY_UNIFIED_MISMATCH",
          "manual_review_issue_class",
          `Review issue class: ${issueClass}`,
        );
        break;
      case "artifact_or_runtime_blocker":
        addIssue(
          issueMap,
          candidate,
          "PARSER_RUNTIME_UNAVAILABLE",
          "manual_review_issue_class",
          "Review-runden markerte artifact/runtime-blokkering.",
        );
        break;
      case "missing_structured_document":
        addIssue(
          issueMap,
          candidate,
          "STRUCTURED_DOCUMENT_MISSING",
          "manual_review_issue_class",
          "Review-runden fant manglende strukturert dokument.",
        );
        addIssue(
          issueMap,
          candidate,
          "ARTIFACT_MISSING",
          "manual_review_issue_class",
          "Review-runden fant manglende strukturert dokument.",
        );
        break;
      case "unit_scale_ambiguity":
        addIssue(
          issueMap,
          candidate,
          "UNIT_SCALE_UNKNOWN",
          "manual_review_issue_class",
          "Review-runden fant uklar enhetsskala.",
        );
        break;
      case "large_relative_deviation":
        addIssue(
          issueMap,
          candidate,
          "LARGE_NUMERIC_DEVIATION",
          "manual_review_issue_class",
          "Review-runden fant stort relativt avvik.",
        );
        break;
      case "norwegian_statement_line_item_conflict":
        addIssue(
          issueMap,
          candidate,
          "NORWEGIAN_LABEL_MAPPING_ERROR",
          "manual_review_issue_class",
          "Review-runden fant konflikt i norske regnskapslinjer.",
        );
        break;
      case "narrative_mismatch":
        addIssue(
          issueMap,
          candidate,
          "NARRATIVE_SECTION_MISSING",
          "manual_review_issue_class",
          "Review-runden fant mismatch i narrative seksjoner.",
        );
        break;
      default:
        if (issueClass.startsWith("missing_artifact:")) {
          addIssue(
            issueMap,
            candidate,
            "ARTIFACT_MISSING",
            "manual_review_issue_class",
            `Review-runden mangler artifact: ${issueClass.replace("missing_artifact:", "")}`,
          );
        } else if (issueClass.startsWith("tag:")) {
          // Tags are handled separately to preserve stable mapping.
        } else {
          addIssue(
            issueMap,
            candidate,
            "UNKNOWN_FAILURE",
            "manual_review_issue_class",
            `Ukjent review issue class: ${issueClass}`,
          );
        }
        break;
    }
  }
}

function mapTagIssues(
  candidate: AnnualReportManualReviewCandidate,
  issueMap: Map<FailureIssueClass, MutableIssue>,
) {
  for (const tag of candidate.tags) {
    const evidence = `Gold-set-tag: ${tag}`;
    switch (tag) {
      case "manual_review_expected":
        addIssue(issueMap, candidate, "MANUAL_REVIEW_EXPECTED", "gold_set_tag", evidence);
        break;
      case "degraded_ambiguous":
        addIssue(issueMap, candidate, "AMBIGUOUS_REPORT_STRUCTURE", "gold_set_tag", evidence);
        break;
      case "scan_or_ocr":
        addIssue(issueMap, candidate, "OCR_REQUIRED_OR_LOW_QUALITY_SCAN", "gold_set_tag", evidence);
        break;
      case "ocr_token_noise":
        addIssue(issueMap, candidate, "OCR_TOKEN_NOISE", "gold_set_tag", evidence);
        break;
      case "continuation_complex":
        addIssue(issueMap, candidate, "MULTI_PAGE_BALANCE_ERROR", "gold_set_tag", evidence);
        break;
      case "unit_scale_sensitive":
        addIssue(issueMap, candidate, "UNIT_SCALE_MISMATCH", "gold_set_tag", evidence);
        break;
      case "formatting_edge":
        addIssue(issueMap, candidate, "TABLE_RECONSTRUCTION_ERROR", "gold_set_tag", evidence);
        break;
      default:
        break;
    }
  }
}

function mapDivergenceStageIssues(
  candidate: AnnualReportManualReviewCandidate,
  issueMap: Map<FailureIssueClass, MutableIssue>,
) {
  if (!candidate.firstDivergenceStage) {
    return;
  }

  const evidence = `Første divergenssteg: ${candidate.firstDivergenceStage}`;
  switch (candidate.firstDivergenceStage) {
    case "source_pdf":
      addIssue(issueMap, candidate, "SOURCE_PDF_MISSING", "divergence_stage", evidence);
      break;
    case "structured_document":
      addIssue(issueMap, candidate, "STRUCTURED_DOCUMENT_MISSING", "divergence_stage", evidence);
      break;
    case "parser_runtime":
      addIssue(issueMap, candidate, "PARSER_RUNTIME_UNAVAILABLE", "divergence_stage", evidence);
      break;
    case "unit_scale":
      addIssue(issueMap, candidate, "UNIT_SCALE_UNKNOWN", "divergence_stage", evidence);
      break;
    case "comparison":
      addIssue(issueMap, candidate, "LEGACY_UNIFIED_MISMATCH", "divergence_stage", evidence);
      break;
    case "narrative":
      addIssue(issueMap, candidate, "NARRATIVE_SECTION_MISSING", "divergence_stage", evidence);
      break;
    default:
      break;
  }
}

function mapFinancialComparisonIssues(
  candidate: AnnualReportManualReviewCandidate,
  issueMap: Map<FailureIssueClass, MutableIssue>,
) {
  for (const comparison of candidate.financialComparisons) {
    const canonicalKeys = comparison.canonicalKey ? [comparison.canonicalKey] : [];
    const evidence = `${comparison.canonicalKey} ${comparison.fiscalYear ?? "ukjent år"}: match=${comparison.match ?? "ukjent"} delta=${comparison.deltaNok ?? "ukjent"}`;

    if (
      comparison.match === "MISSING_IN_LEGACY" ||
      comparison.match === "MISSING_IN_UNIFIED"
    ) {
      addIssue(
        issueMap,
        candidate,
        "CANONICAL_KEY_MISSING",
        "financial_comparison",
        evidence,
        canonicalKeys,
      );
      if (comparison.canonicalKey === "cash_and_cash_equivalents") {
        addIssue(
          issueMap,
          candidate,
          "CASH_FLOW_MISSING",
          "financial_comparison",
          evidence,
          canonicalKeys,
        );
      }
    }

    if (comparison.match === "CONFLICTING_VALUES" && (comparison.relativeDeviation ?? 0) >= 0.2) {
      addIssue(
        issueMap,
        candidate,
        "LARGE_NUMERIC_DEVIATION",
        "financial_comparison",
        evidence,
        canonicalKeys,
      );
      if (PRIORITY_KEYS.has(comparison.canonicalKey)) {
        addIssue(
          issueMap,
          candidate,
          "LEGACY_UNIFIED_MISMATCH",
          "financial_comparison",
          evidence,
          canonicalKeys,
        );
      }
    }

    if (comparison.match === "UNIT_SCALE_ADJUSTED") {
      addIssue(
        issueMap,
        candidate,
        "UNIT_SCALE_MISMATCH",
        "financial_comparison",
        evidence,
        canonicalKeys,
      );
    }

    if (
      comparison.legacyUnitScale === null ||
      comparison.unifiedUnitScale === null ||
      comparison.unifiedUnitScale === "UNKNOWN"
    ) {
      addIssue(
        issueMap,
        candidate,
        "UNIT_SCALE_UNKNOWN",
        "financial_comparison",
        evidence,
        canonicalKeys,
      );
    }

    if (
      PRIORITY_KEYS.has(comparison.canonicalKey) &&
      comparison.legacyLabel !== null &&
      comparison.unifiedLabel !== null &&
      comparison.legacyLabel !== comparison.unifiedLabel
    ) {
      addIssue(
        issueMap,
        candidate,
        "NORWEGIAN_LABEL_MAPPING_ERROR",
        "financial_comparison",
        `Label mismatch: ${comparison.legacyLabel} vs ${comparison.unifiedLabel}`,
        canonicalKeys,
      );
    }

    if (
      (comparison.canonicalKey === "total_assets" ||
        comparison.canonicalKey === "total_equity" ||
        comparison.canonicalKey === "total_liabilities") &&
      candidate.tags.includes("continuation_complex")
    ) {
      addIssue(
        issueMap,
        candidate,
        "MULTI_PAGE_BALANCE_ERROR",
        "financial_comparison",
        evidence,
        canonicalKeys,
      );
    }
  }
}

function mapNarrativeIssues(
  candidate: AnnualReportManualReviewCandidate,
  issueMap: Map<FailureIssueClass, MutableIssue>,
) {
  for (const item of candidate.narrativeComparisons) {
    const kind = typeof item.kind === "string" ? item.kind : null;
    const unifiedFound = item.unifiedFound === true;
    const legacyFound = item.legacyFound === true;
    const textSimilarity =
      typeof item.textSimilarity === "number" && Number.isFinite(item.textSimilarity)
        ? item.textSimilarity
        : null;

    if (legacyFound && !unifiedFound) {
      const evidence = `${kind ?? "narrative section"} mangler i unified.`;
      addIssue(issueMap, candidate, "NARRATIVE_SECTION_MISSING", "narrative_comparison", evidence);
      if (kind === "AUDITOR_REPORT" || kind === "AUDITOR_OPINION") {
        addIssue(issueMap, candidate, "AUDITOR_REPORT_MISSING", "narrative_comparison", evidence);
      }
      if (kind === "BOARD_REPORT") {
        addIssue(issueMap, candidate, "BOARD_REPORT_MISSING", "narrative_comparison", evidence);
      }
    }

    if (textSimilarity !== null && textSimilarity < 0.5) {
      const evidence = `${kind ?? "narrative section"} har lav tekstlikhet (${textSimilarity.toFixed(2)}).`;
      addIssue(issueMap, candidate, "NARRATIVE_SECTION_MISSING", "narrative_comparison", evidence);
    }
  }
}

function mapTextualHeuristics(
  candidate: AnnualReportManualReviewCandidate,
  issueMap: Map<FailureIssueClass, MutableIssue>,
) {
  const text = combinedCandidateText(candidate);
  if (text.length === 0) {
    return;
  }

  if (containsKeyword(text, [/kolonne/i, /column/i, /alignment/i])) {
    addIssue(
      issueMap,
      candidate,
      "COLUMN_ALIGNMENT_ERROR",
      "candidate_text",
      "Tekstlig evidens peker på kolonne- eller linjejusteringsproblem.",
    );
  }

  if (containsKeyword(text, [/negativ/i, /minus/i, /parentes/i])) {
    addIssue(
      issueMap,
      candidate,
      "NEGATIVE_NUMBER_FORMAT_ERROR",
      "candidate_text",
      "Tekstlig evidens peker på problem med negative tall eller parentesformat.",
    );
  }

  if (containsKeyword(text, [/kontantstr[øo]m/i, /cash flow/i])) {
    addIssue(
      issueMap,
      candidate,
      "CASH_FLOW_MISSING",
      "candidate_text",
      "Tekstlig evidens peker på manglende eller svak kontantstrømseksjon.",
    );
  }

  if (containsKeyword(text, [/tabell/i, /table/i, /row label/i, /reconstruct/i])) {
    addIssue(
      issueMap,
      candidate,
      "TABLE_RECONSTRUCTION_ERROR",
      "candidate_text",
      "Tekstlig evidens peker på tabellrekonstruksjon som feilkilde.",
    );
  }

  if (containsKeyword(text, [/ocr/i, /skann/i])) {
    addIssue(
      issueMap,
      candidate,
      "OCR_REQUIRED_OR_LOW_QUALITY_SCAN",
      "candidate_text",
      "Tekstlig evidens peker på OCR eller lavkvalitets skann.",
    );
  }
}

function mapCandidateToIssues(candidate: AnnualReportManualReviewCandidate) {
  const issueMap = new Map<FailureIssueClass, MutableIssue>();

  mapArtifactRefIssues(candidate, issueMap);
  mapCandidateIssueClasses(candidate, issueMap);
  mapConfidenceGateIssues(candidate, issueMap);
  mapTagIssues(candidate, issueMap);
  mapDivergenceStageIssues(candidate, issueMap);
  mapFinancialComparisonIssues(candidate, issueMap);
  mapNarrativeIssues(candidate, issueMap);
  mapTextualHeuristics(candidate, issueMap);

  if (issueMap.size === 0) {
    addIssue(
      issueMap,
      candidate,
      "UNKNOWN_FAILURE",
      "candidate_text",
      candidate.reviewReasons[0] ?? "Ingen klassifiserbar evidens funnet.",
    );
  }

  return Array.from(issueMap.values()).map<AnnualReportUnifiedFailureTaxonomyIssue>((item) => ({
    ...item,
    evidence: Array.from(item.evidence).sort(),
    affectedCanonicalKeys: Array.from(item.affectedCanonicalKeys).sort(),
    tags: Array.from(item.tags).sort(),
  }));
}

function sortCountEntries(entries: Record<string, number>) {
  return Object.entries(entries)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([key, count]) => ({ key, count }));
}

function buildSummary(issues: AnnualReportUnifiedFailureTaxonomyIssue[], totalCandidates: number) {
  const severityCounts: Record<FailureSeverity, number> = {
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
  };
  const issueClassCounts: Record<string, number> = {};
  const tagCounts: Record<string, number> = {};
  const keyCounts: Record<string, number> = {};
  const stageCounts: Record<string, number> = {};
  const remediationAreaCounts: Record<string, number> = {};
  const representativeExamples = new Map<FailureIssueClass, AnnualReportUnifiedFailureTaxonomySummary["representativeExamples"][number]>();

  for (const issue of issues) {
    severityCounts[issue.severity] += 1;
    issueClassCounts[issue.issueClass] = (issueClassCounts[issue.issueClass] ?? 0) + 1;
    remediationAreaCounts[issue.remediationArea] = (remediationAreaCounts[issue.remediationArea] ?? 0) + 1;
    if (issue.firstDivergenceStage) {
      stageCounts[issue.firstDivergenceStage] = (stageCounts[issue.firstDivergenceStage] ?? 0) + 1;
    }
    for (const tag of issue.tags) {
      tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
    }
    for (const canonicalKey of issue.affectedCanonicalKeys) {
      keyCounts[canonicalKey] = (keyCounts[canonicalKey] ?? 0) + 1;
    }
    if (!representativeExamples.has(issue.issueClass)) {
      representativeExamples.set(issue.issueClass, {
        issueClass: issue.issueClass,
        filingId: issue.filingId,
        companyName: issue.companyName,
        orgNumber: issue.orgNumber,
        accountingYear: issue.accountingYear,
        evidence: issue.evidence.slice(0, 3),
      });
    }
  }

  return {
    totalCandidates,
    totalMappedIssues: issues.length,
    highSeverityIssueCount: severityCounts.HIGH,
    issueClassCounts: sortCountEntries(issueClassCounts).map(({ key, count }) => ({
      issueClass: key as FailureIssueClass,
      count,
      severity: FAILURE_CLASS_META[key as FailureIssueClass].severity,
      remediationArea: FAILURE_CLASS_META[key as FailureIssueClass].remediationArea,
    })),
    severityCounts,
    affectedTags: sortCountEntries(tagCounts).map(({ key, count }) => ({ tag: key, count })),
    affectedCanonicalKeys: sortCountEntries(keyCounts).map(({ key, count }) => ({
      canonicalKey: key,
      count,
    })),
    firstDivergenceStages: sortCountEntries(stageCounts).map(({ key, count }) => ({
      stage: key,
      count,
    })),
    remediationAreaCounts: sortCountEntries(remediationAreaCounts).map(({ key, count }) => ({
      remediationArea: key as FailureRemediationArea,
      count,
    })),
    representativeExamples: Array.from(representativeExamples.values()),
  } satisfies AnnualReportUnifiedFailureTaxonomySummary;
}

function buildRecommendations(summary: AnnualReportUnifiedFailureTaxonomySummary) {
  const topAreas = summary.remediationAreaCounts.slice(0, 3).map((item) => item.remediationArea);
  const actions: string[] = [];

  if (topAreas.includes("unit_scale_normalization")) {
    actions.push("Prioriter unit-scale-deteksjon og propagasjon i PR79.");
  }
  if (topAreas.includes("financial_mapping")) {
    actions.push("Prioriter norske label-mappinger og manglende canonical keys i PR79.");
  }
  if (topAreas.includes("table_reconstruction")) {
    actions.push("Prioriter fler-sidige balanser, tabellrekonstruksjon og kolonnejustering i PR79.");
  }
  if (topAreas.includes("artifact_pipeline")) {
    actions.push("Følg opp artifact-kjeden før nye quality-konklusjoner trekkes.");
  }
  if (topAreas.includes("ocr_quality")) {
    actions.push("Bruk taxonomy-data til å avgrense OCR-støy og skanningsproblemer før bredere utrulling.");
  }
  if (actions.length === 0) {
    actions.push("Samle flere review-beslutninger før PR79 velger de første parser-fixene.");
  }

  return actions;
}

async function resolveRound(
  input: AnnualReportUnifiedFailureTaxonomyInput,
  deps: AnnualReportUnifiedFailureTaxonomyServiceDeps,
): Promise<AnnualReportManualReviewRound> {
  if (input.runId) {
    const built = await (deps.buildManualReviewRound ?? buildAnnualReportManualReviewRound)({
      runId: input.runId,
    });
    if (!built) {
      throw new Error(`Manual review round ${input.runId} could not be built.`);
    }
    return built;
  }

  const latest = await (deps.readLatestManualReviewRound ?? readLatestAnnualReportManualReviewRound)();
  if (latest) {
    return latest;
  }

  const built = await (deps.buildManualReviewRound ?? buildAnnualReportManualReviewRound)({
    latest: true,
  });
  if (!built) {
    throw new Error("No persisted or buildable manual review round was found.");
  }
  return built;
}

export async function buildAnnualReportUnifiedFailureTaxonomyReport(
  input: AnnualReportUnifiedFailureTaxonomyInput = {},
  deps: AnnualReportUnifiedFailureTaxonomyServiceDeps = {},
): Promise<AnnualReportUnifiedFailureTaxonomyReport> {
  const now = deps.now?.() ?? new Date();
  const round = await resolveRound(input, deps);
  const paths = outputPaths(now);
  const issues = round.candidates.flatMap((candidate) => mapCandidateToIssues(candidate));
  const summary = buildSummary(issues, round.summary.reviewCandidateCount);

  return {
    version: "annual-report-unified-failure-taxonomy-v1",
    generatedAt: now.toISOString(),
    input: {
      runId: input.runId ?? round.reviewRoundId,
      generatedBy: input.generatedBy ?? null,
    },
    sourceRun: {
      reviewRoundId: round.reviewRoundId,
      reviewRoundGeneratedAt: round.generatedAt,
      goldSetRunId: round.sourceRun.runId,
      manifestName: round.sourceRun.manifestName,
      gitCommitSha: round.sourceRun.gitCommitSha,
    },
    evidenceUsed: {
      totalCandidates: round.summary.reviewCandidateCount,
      reviewedCandidates: round.summary.reviewedCount,
      pendingCandidates: round.summary.pendingCount,
      blockedCandidates: round.summary.blockedCount,
    },
    summary,
    issues,
    recommendations: {
      pr79ExtractionFixes: buildRecommendations(summary),
    },
    output: {
      jsonPath: paths.jsonPath,
      markdownPath: paths.markdownPath,
    },
    safety: {
      canUseForProductionRouting: false,
      productionRoutingChanged: false,
      productionFactsMutated: false,
      publishAffected: false,
    },
  };
}

export function renderAnnualReportUnifiedFailureTaxonomyMarkdown(
  report: AnnualReportUnifiedFailureTaxonomyReport,
) {
  const lines = [
    "# Unified failure taxonomy",
    "",
    `- Generated at: ${report.generatedAt}`,
    `- Review round: ${report.sourceRun.reviewRoundId ?? "unknown"}`,
    `- Gold-set run: ${report.sourceRun.goldSetRunId ?? "unknown"}`,
    `- Total candidates: ${report.evidenceUsed.totalCandidates}`,
    `- Total mapped issues: ${report.summary.totalMappedIssues}`,
    `- High severity issues: ${report.summary.highSeverityIssueCount}`,
    "",
    "## Top issue classes",
    "",
    ...report.summary.issueClassCounts.slice(0, 10).map(
      (item) =>
        `- ${item.issueClass}: ${item.count} (${item.severity.toLowerCase()}, remediation=${item.remediationArea})`,
    ),
    "",
    "## Affected canonical keys",
    "",
    ...(report.summary.affectedCanonicalKeys.length > 0
      ? report.summary.affectedCanonicalKeys.slice(0, 10).map(
          (item) => `- ${item.canonicalKey}: ${item.count}`,
        )
      : ["- none"]),
    "",
    "## First divergence stages",
    "",
    ...(report.summary.firstDivergenceStages.length > 0
      ? report.summary.firstDivergenceStages.map((item) => `- ${item.stage}: ${item.count}`)
      : ["- none"]),
    "",
    "## PR79 recommendations",
    "",
    ...report.recommendations.pr79ExtractionFixes.map((item) => `- ${item}`),
    "",
  ];

  if (report.summary.representativeExamples.length > 0) {
    lines.push("## Representative examples", "");
    for (const example of report.summary.representativeExamples.slice(0, 8)) {
      lines.push(
        `- ${example.issueClass}: ${example.companyName ?? example.filingId} (${example.orgNumber ?? "ukjent org.nr"})`,
        `  - Filing: ${example.filingId}`,
        `  - Evidence: ${example.evidence.join("; ") || "Ingen evidens"}`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

export async function persistAnnualReportUnifiedFailureTaxonomyArtifacts(
  report: AnnualReportUnifiedFailureTaxonomyReport,
  deps: AnnualReportUnifiedFailureTaxonomyServiceDeps = {},
) {
  const mkdir = deps.mkdir ?? fs.mkdir;
  const writeFile = deps.writeFile ?? fs.writeFile;
  const json = JSON.stringify(report, null, 2);
  const markdown = renderAnnualReportUnifiedFailureTaxonomyMarkdown(report);

  await mkdir(FAILURE_TAXONOMY_OUTPUT_DIR, { recursive: true });
  await writeFile(report.output.jsonPath, json, "utf8");
  await writeFile(report.output.markdownPath, markdown, "utf8");
  await writeFile(path.join(FAILURE_TAXONOMY_OUTPUT_DIR, "latest.json"), json, "utf8");
  await writeFile(path.join(FAILURE_TAXONOMY_OUTPUT_DIR, "latest.md"), markdown, "utf8");
}

export async function readLatestAnnualReportUnifiedFailureTaxonomyReport(
  deps: AnnualReportUnifiedFailureTaxonomyServiceDeps = {},
) {
  const readFile = deps.readFile ?? fs.readFile;
  try {
    const raw = await readFile(path.join(FAILURE_TAXONOMY_OUTPUT_DIR, "latest.json"), "utf8");
    const parsed = JSON.parse(raw) as AnnualReportUnifiedFailureTaxonomyReport;
    return parsed.version === "annual-report-unified-failure-taxonomy-v1" ? parsed : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}
