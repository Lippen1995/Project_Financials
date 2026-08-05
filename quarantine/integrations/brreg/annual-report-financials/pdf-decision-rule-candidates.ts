import {
  DEFAULT_PDF_DECISION_RULE_CONFIG,
  normalizePdfDecisionRuleConfig,
} from "@/integrations/brreg/annual-report-financials/pdf-decision-rule-config";
import type { PdfDecisionRuleTuningCandidate } from "@/integrations/brreg/annual-report-financials/pdf-decision-rule-tuning";

export type PdfDecisionRuleCandidateFamily =
  | "CONSERVATIVE"
  | "AGGRESSIVE"
  | "OCR_SENSITIVE"
  | "PAGE_HINT_SENSITIVE"
  | "VALIDATION_SENSITIVE";

export type PdfDecisionRuleCandidate = PdfDecisionRuleTuningCandidate & {
  family: PdfDecisionRuleCandidateFamily;
  description: string;
  rationale: string;
  expectedEffect: string;
};

export type PdfDecisionRuleCandidateSet = {
  version: "pdf-decision-rule-candidates-v1";
  candidates: PdfDecisionRuleCandidate[];
};

export const PDF_DECISION_RULE_CANDIDATE_SET_VERSION =
  "pdf-decision-rule-candidates-v1";

const defaults = DEFAULT_PDF_DECISION_RULE_CONFIG;

export const CONSERVATIVE_RULE_CANDIDATES: PdfDecisionRuleCandidate[] = [
  {
    id: "more-conservative-high-risk",
    family: "CONSERVATIVE",
    description: "Increase penalties for high quality risk and missing financial sections.",
    rationale: "High quality risk and missing core financial sections should be harder to trust.",
    expectedEffect: "Lower confidence for weak documents without changing production routing.",
    ruleConfigOverride: {
      confidence: {
        penalties: {
          highQualityRisk: defaults.confidence.penalties.highQualityRisk + 0.06,
          missingFinancialSections:
            defaults.confidence.penalties.missingFinancialSections + 0.04,
        },
      },
    },
  },
];

export const AGGRESSIVE_RULE_CANDIDATES: PdfDecisionRuleCandidate[] = [
  {
    id: "less-punitive-medium-risk",
    family: "AGGRESSIVE",
    description: "Reduce the medium quality risk penalty slightly.",
    rationale: "Medium quality risk may be too broad for otherwise well-structured filings.",
    expectedEffect: "Raise confidence for borderline medium-risk documents.",
    ruleConfigOverride: {
      confidence: {
        penalties: {
          mediumQualityRisk: Math.max(0, defaults.confidence.penalties.mediumQualityRisk - 0.03),
        },
      },
    },
  },
];

export const OCR_SENSITIVE_RULE_CANDIDATES: PdfDecisionRuleCandidate[] = [
  {
    id: "stronger-no-text-layer-penalty",
    family: "OCR_SENSITIVE",
    description: "Increase penalty for filings without a reliable text layer.",
    rationale: "No reliable text layer is a strong signal that parser output may drift.",
    expectedEffect: "Lower confidence for OCR-prone filings.",
    ruleConfigOverride: {
      confidence: {
        penalties: {
          noReliableTextLayer: defaults.confidence.penalties.noReliableTextLayer + 0.05,
          highRiskWithoutOcrOrOdl:
            defaults.confidence.penalties.highRiskWithoutOcrOrOdl + 0.03,
        },
      },
    },
  },
];

export const PAGE_HINT_SENSITIVE_RULE_CANDIDATES: PdfDecisionRuleCandidate[] = [
  {
    id: "reward-reliable-page-hints",
    family: "PAGE_HINT_SENSITIVE",
    description: "Slightly reward reliable page hints.",
    rationale: "Reliable hints help narrow extraction to financial statement pages.",
    expectedEffect: "Raise confidence for well-structured filings with reliable page hints.",
    ruleConfigOverride: {
      confidence: {
        bonuses: {
          reliablePageHints: defaults.confidence.bonuses.reliablePageHints + 0.04,
        },
      },
    },
  },
  {
    id: "stricter-weak-page-hints",
    family: "PAGE_HINT_SENSITIVE",
    description: "Increase confidence penalty for weak page hints.",
    rationale: "Weak hints leave more room for extracting narrative or notes as facts.",
    expectedEffect: "Lower confidence when page selection evidence is weak.",
    ruleConfigOverride: {
      confidence: {
        penalties: {
          weakPageHints: defaults.confidence.penalties.weakPageHints + 0.05,
        },
      },
    },
  },
];

export const VALIDATION_SENSITIVE_RULE_CANDIDATES: PdfDecisionRuleCandidate[] = [
  {
    id: "stronger-validation-blocking-penalty",
    family: "VALIDATION_SENSITIVE",
    description: "Increase penalty for post-validation blocking errors.",
    rationale: "Blocking validation issues should dominate post-validation trust.",
    expectedEffect: "Lower confidence for documents with blocking validation errors.",
    ruleConfigOverride: {
      confidence: {
        penalties: {
          validationBlockingErrors:
            defaults.confidence.penalties.validationBlockingErrors + 0.05,
        },
      },
    },
  },
];

export const DEFAULT_PDF_DECISION_RULE_CANDIDATES: PdfDecisionRuleCandidate[] = [
  ...CONSERVATIVE_RULE_CANDIDATES,
  ...PAGE_HINT_SENSITIVE_RULE_CANDIDATES,
];

const ALL_CANDIDATES: PdfDecisionRuleCandidate[] = [
  ...CONSERVATIVE_RULE_CANDIDATES,
  ...AGGRESSIVE_RULE_CANDIDATES,
  ...OCR_SENSITIVE_RULE_CANDIDATES,
  ...PAGE_HINT_SENSITIVE_RULE_CANDIDATES,
  ...VALIDATION_SENSITIVE_RULE_CANDIDATES,
];

export function listPdfDecisionRuleCandidates(input?: {
  family?: PdfDecisionRuleCandidateFamily;
}): PdfDecisionRuleCandidate[] {
  const candidates = input?.family
    ? ALL_CANDIDATES.filter((candidate) => candidate.family === input.family)
    : DEFAULT_PDF_DECISION_RULE_CANDIDATES;
  return candidates.map((candidate) => ({
    ...candidate,
    ruleConfigOverride: normalizePdfDecisionRuleConfig(candidate.ruleConfigOverride),
  }));
}

export function getPdfDecisionRuleCandidateById(
  id: string,
): PdfDecisionRuleCandidate | undefined {
  const candidate = ALL_CANDIDATES.find((item) => item.id === id);
  return candidate
    ? {
        ...candidate,
        ruleConfigOverride: normalizePdfDecisionRuleConfig(candidate.ruleConfigOverride),
      }
    : undefined;
}

export const PDF_DECISION_RULE_CANDIDATE_SET: PdfDecisionRuleCandidateSet = {
  version: PDF_DECISION_RULE_CANDIDATE_SET_VERSION,
  candidates: ALL_CANDIDATES,
};
