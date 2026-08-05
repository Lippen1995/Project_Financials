export type PdfDecisionRuleConfigVersion =
  | "pdf-decision-rules-v1"
  | "pdf-decision-rules-v1.1-conservative"
  | "pdf-decision-rules-v1.1-page-hints-sensitive";

export type PdfDecisionRuleConfig = {
  version: PdfDecisionRuleConfigVersion;
  confidence: {
    base: number;
    min: number;
    max: number;
    penalties: {
      noReliableTextLayer: number;
      highQualityRisk: number;
      mediumQualityRisk: number;
      missingFinancialSections: number;
      missingIncomeStatement: number;
      missingBalance: number;
      weakPageHints: number;
      validationBlockingErrors: number;
      highRiskWithoutOcrOrOdl: number;
      parserRiskReasons: number;
    };
    bonuses: {
      reliablePageHints: number;
      incomeAndBalanceDetected: number;
      boardOrAuditorNarrativeDetected: number;
      postValidationDecision: number;
    };
  };
  risk: {
    lowConfidenceThreshold: number;
    mediumConfidenceThreshold: number;
    highRiskQualityRiskValues: string[];
    mediumRiskQualityRiskValues: string[];
  };
  activeLearning?: {
    lowConfidenceThreshold: number;
    mediumConfidenceThreshold: number;
  };
};

export type PdfDecisionRuleConfigOverrides = {
  version?: PdfDecisionRuleConfigVersion;
  confidence?: Partial<Omit<PdfDecisionRuleConfig["confidence"], "penalties" | "bonuses">> & {
    penalties?: Partial<PdfDecisionRuleConfig["confidence"]["penalties"]>;
    bonuses?: Partial<PdfDecisionRuleConfig["confidence"]["bonuses"]>;
  };
  risk?: Partial<PdfDecisionRuleConfig["risk"]>;
  activeLearning?: Partial<NonNullable<PdfDecisionRuleConfig["activeLearning"]>>;
};

export const DEFAULT_PDF_DECISION_RULE_CONFIG: PdfDecisionRuleConfig = {
  version: "pdf-decision-rules-v1",
  confidence: {
    base: 0.85,
    min: 0,
    max: 1,
    penalties: {
      noReliableTextLayer: 0.22,
      highQualityRisk: 0.24,
      mediumQualityRisk: 0.08,
      missingFinancialSections: 0.18,
      missingIncomeStatement: 0.12,
      missingBalance: 0.12,
      weakPageHints: 0.1,
      validationBlockingErrors: 0.22,
      highRiskWithoutOcrOrOdl: 0.08,
      parserRiskReasons: 0,
    },
    bonuses: {
      reliablePageHints: 0.05,
      incomeAndBalanceDetected: 0.06,
      boardOrAuditorNarrativeDetected: 0.03,
      postValidationDecision: 0.08,
    },
  },
  risk: {
    lowConfidenceThreshold: 0.7,
    mediumConfidenceThreshold: 0.45,
    highRiskQualityRiskValues: ["HIGH"],
    mediumRiskQualityRiskValues: ["MEDIUM"],
  },
  activeLearning: {
    lowConfidenceThreshold: 0.45,
    mediumConfidenceThreshold: 0.65,
  },
};

export const PDF_DECISION_RULE_CONFIGS: Record<
  PdfDecisionRuleConfigVersion,
  PdfDecisionRuleConfig
> = {
  "pdf-decision-rules-v1": DEFAULT_PDF_DECISION_RULE_CONFIG,
  "pdf-decision-rules-v1.1-conservative": {
    ...DEFAULT_PDF_DECISION_RULE_CONFIG,
    version: "pdf-decision-rules-v1.1-conservative",
    confidence: {
      ...DEFAULT_PDF_DECISION_RULE_CONFIG.confidence,
      penalties: {
        ...DEFAULT_PDF_DECISION_RULE_CONFIG.confidence.penalties,
        highQualityRisk:
          DEFAULT_PDF_DECISION_RULE_CONFIG.confidence.penalties.highQualityRisk + 0.06,
        missingFinancialSections:
          DEFAULT_PDF_DECISION_RULE_CONFIG.confidence.penalties.missingFinancialSections + 0.04,
      },
    },
  },
  "pdf-decision-rules-v1.1-page-hints-sensitive": {
    ...DEFAULT_PDF_DECISION_RULE_CONFIG,
    version: "pdf-decision-rules-v1.1-page-hints-sensitive",
    confidence: {
      ...DEFAULT_PDF_DECISION_RULE_CONFIG.confidence,
      penalties: {
        ...DEFAULT_PDF_DECISION_RULE_CONFIG.confidence.penalties,
        weakPageHints:
          DEFAULT_PDF_DECISION_RULE_CONFIG.confidence.penalties.weakPageHints + 0.05,
      },
      bonuses: {
        ...DEFAULT_PDF_DECISION_RULE_CONFIG.confidence.bonuses,
        reliablePageHints:
          DEFAULT_PDF_DECISION_RULE_CONFIG.confidence.bonuses.reliablePageHints + 0.04,
      },
    },
  },
};

export function getPdfDecisionRuleConfigByVersion(
  version?: string | null,
): PdfDecisionRuleConfig | null {
  if (!version) return null;
  return PDF_DECISION_RULE_CONFIGS[version as PdfDecisionRuleConfigVersion] ?? null;
}

export function getActivePdfDecisionRuleConfig(): PdfDecisionRuleConfig {
  const selectedVersion = process.env.PDF_DECISION_RULE_CONFIG_VERSION;
  return (
    getPdfDecisionRuleConfigByVersion(selectedVersion) ??
    DEFAULT_PDF_DECISION_RULE_CONFIG
  );
}

function mergeRecord<T extends Record<string, unknown>>(base: T, override?: Partial<T>): T {
  return { ...base, ...(override ?? {}) };
}

export function normalizePdfDecisionRuleConfig(
  config?: PdfDecisionRuleConfigOverrides | null,
): PdfDecisionRuleConfig {
  const defaults = DEFAULT_PDF_DECISION_RULE_CONFIG;
  return {
    version: config?.version ?? defaults.version,
    confidence: {
      ...defaults.confidence,
      ...(config?.confidence ?? {}),
      penalties: mergeRecord(
        defaults.confidence.penalties,
        config?.confidence?.penalties,
      ),
      bonuses: mergeRecord(defaults.confidence.bonuses, config?.confidence?.bonuses),
    },
    risk: {
      ...defaults.risk,
      ...(config?.risk ?? {}),
      highRiskQualityRiskValues:
        config?.risk?.highRiskQualityRiskValues ?? defaults.risk.highRiskQualityRiskValues,
      mediumRiskQualityRiskValues:
        config?.risk?.mediumRiskQualityRiskValues ?? defaults.risk.mediumRiskQualityRiskValues,
    },
    activeLearning: defaults.activeLearning
      ? {
          ...defaults.activeLearning,
          ...(config?.activeLearning ?? {}),
        }
      : undefined,
  };
}

export function clampPdfDecisionConfidence(
  value: number,
  config: PdfDecisionRuleConfig = DEFAULT_PDF_DECISION_RULE_CONFIG,
): number {
  if (!Number.isFinite(value)) return config.confidence.min;
  const clamped = Math.max(config.confidence.min, Math.min(config.confidence.max, value));
  return Number(clamped.toFixed(4));
}
