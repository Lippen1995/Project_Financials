import { normalizeCompanyName } from "@/server/news/company-alias-service";
import {
  EVENT_CLASSIFICATION_RULES,
  type EventClassification,
  type EventRule,
} from "@/server/news/company-event-taxonomy";

export type ClassifiableSourceDocument = {
  title: string;
  summary?: string | null;
  bodyText?: string | null;
  source?: {
    id: string;
    sourceType?: string | null;
    qualityScore?: number | null;
    metadata?: unknown;
  } | null;
  sourcePayload?: unknown;
};

function documentText(document: ClassifiableSourceDocument) {
  return [document.title, document.summary, document.bodyText, JSON.stringify(document.sourcePayload ?? {})]
    .filter(Boolean)
    .join(" ");
}

function keywordHits(rule: EventRule, normalizedText: string) {
  return rule.keywords.filter((keyword) => normalizedText.includes(normalizeCompanyName(keyword)));
}

function sourceBoost(rule: EventRule, document: ClassifiableSourceDocument) {
  const sourceType = document.source?.sourceType;
  const metadata = JSON.stringify(document.source?.metadata ?? {}).toLowerCase();
  if (sourceType === "financials" && ["annual_report", "financial_statement", "earnings"].includes(rule.eventType)) return 0.25;
  if (sourceType === "brreg" && ["bankruptcy", "liquidation", "board_change"].includes(rule.eventType)) return 0.18;
  if (sourceType === "newsweb" && ["buyback", "dividend", "capital_raise", "insider_transaction"].includes(rule.eventType)) return 0.16;
  if (metadata.includes("regulatory") && rule.eventType.startsWith("regulatory")) return 0.12;
  return 0;
}

function confidenceLevel(score: number): EventClassification["confidenceLevel"] {
  if (score >= 0.74) return "high";
  if (score >= 0.52) return "medium";
  return "low";
}

function defaultLowSignalClassification(reason: string): EventClassification {
  return {
    eventType: "low_signal_mention",
    eventTypeScore: 0.24,
    materialityScore: 0.18,
    financialImpactScore: 0.08,
    strategicImpactScore: 0.08,
    riskImpactScore: 0.08,
    direction: "unknown",
    impactHorizon: null,
    confidenceLevel: "low",
    explanation: { reason },
  };
}

export function classifyCompanyEvent(document: ClassifiableSourceDocument): EventClassification {
  const normalizedText = normalizeCompanyName(documentText(document));
  const matches = EVENT_CLASSIFICATION_RULES.flatMap((rule) => {
    const hits = keywordHits(rule, normalizedText);
    if (hits.length === 0) return [];
    const titleHits = keywordHits(rule, normalizeCompanyName(document.title));
    const score = Math.min(1, 0.34 + hits.length * 0.14 + titleHits.length * 0.18 + sourceBoost(rule, document));
    return [{ rule, hits, titleHits, score }];
  }).sort((a, b) => b.score - a.score);

  const best = matches[0];
  if (!best) {
    return defaultLowSignalClassification("No deterministic investor event keywords matched.");
  }

  return {
    eventType: best.rule.eventType,
    eventTypeScore: best.score,
    materialityScore: best.rule.materialityScore,
    financialImpactScore: best.rule.financialImpactScore,
    strategicImpactScore: best.rule.strategicImpactScore,
    riskImpactScore: best.rule.riskImpactScore,
    direction: best.rule.direction,
    impactHorizon: best.rule.impactHorizon,
    confidenceLevel: confidenceLevel(best.score),
    explanation: {
      matchedKeywords: best.hits,
      titleKeywords: best.titleHits,
      sourceType: document.source?.sourceType ?? null,
      candidateCount: matches.length,
    },
  };
}
