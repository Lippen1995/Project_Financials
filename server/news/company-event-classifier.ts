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

function phraseMatches(normalizedText: string, keyword: string) {
  const normalizedKeyword = normalizeCompanyName(keyword);
  if (!normalizedKeyword) return false;
  const escaped = normalizedKeyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(normalizedText);
}

function keywordHits(rule: EventRule, normalizedText: string) {
  return rule.keywords.filter((keyword) => phraseMatches(normalizedText, keyword));
}

const BROAD_MARKET_EVENT_TYPES = new Set([
  "sector_news",
  "macro_news",
  "peer_read_across",
  "commodity_price_exposure",
  "interest_rate_exposure",
]);

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

function classificationFromRule(
  rule: EventRule,
  score: number,
  explanation: Record<string, unknown>,
): EventClassification {
  return {
    eventType: rule.eventType,
    eventTypeScore: score,
    materialityScore: rule.materialityScore,
    financialImpactScore: rule.financialImpactScore,
    strategicImpactScore: rule.strategicImpactScore,
    riskImpactScore: rule.riskImpactScore,
    direction: rule.direction,
    impactHorizon: rule.impactHorizon,
    confidenceLevel: confidenceLevel(score),
    explanation,
  };
}

function reportingCalendarOverride(document: ClassifiableSourceDocument) {
  const normalizedTitle = normalizeCompanyName(document.title);
  const isInvitation =
    (normalizedTitle.includes("invitation") || normalizedTitle.includes("invitasjon")) &&
    (
      normalizedTitle.includes("presentation") ||
      normalizedTitle.includes("presentasjon") ||
      normalizedTitle.includes("webcast")
    );
  const isScheduledPublication =
    /\bto publish (?:q[1-4]|first quarter|second quarter|third quarter|fourth quarter|interim report)\b/.test(
      normalizedTitle,
    );
  const isCalendar =
    normalizedTitle.includes("financial calendar") ||
    normalizedTitle.includes("finansiell kalender") ||
    normalizedTitle.includes("invitasjon til resultatpresentasjon");
  if (!isInvitation && !isScheduledPublication && !isCalendar) return null;

  const rule = EVENT_CLASSIFICATION_RULES.find(
    (candidate) => candidate.eventType === "reporting_calendar",
  );
  return rule
    ? classificationFromRule(rule, 0.86, {
        matchedKeywords: ["reporting_calendar_context"],
        titleKeywords: ["reporting_calendar_context"],
        sourceType: document.source?.sourceType ?? null,
        candidateCount: 1,
      })
    : null;
}

function financialReportOverride(document: ClassifiableSourceDocument) {
  const normalizedTitle = normalizeCompanyName(document.title);
  const isQuarterReport =
    /\b(?:first|second|third|fourth) quarter report\b/.test(normalizedTitle);
  if (!isQuarterReport) return null;

  const rule = EVENT_CLASSIFICATION_RULES.find(
    (candidate) => candidate.eventType === "financial_statement",
  );
  return rule
    ? classificationFromRule(rule, 0.9, {
        matchedKeywords: ["quarter_report_context"],
        titleKeywords: ["quarter_report_context"],
        sourceType: document.source?.sourceType ?? null,
        candidateCount: 1,
      })
    : null;
}

function legalSettlementOverride(document: ClassifiableSourceDocument) {
  const normalizedTitle = normalizeCompanyName(document.title);
  if (
    !normalizedTitle.includes("settlement agreement with") &&
    !normalizedTitle.includes("forliksavtale med")
  ) {
    return null;
  }

  const rule = EVENT_CLASSIFICATION_RULES.find(
    (candidate) => candidate.eventType === "legal_settlement",
  );
  return rule
    ? classificationFromRule(rule, 0.9, {
        matchedKeywords: ["legal_settlement_context"],
        titleKeywords: ["legal_settlement_context"],
        sourceType: document.source?.sourceType ?? null,
        candidateCount: 1,
      })
    : null;
}

export function classifyCompanyEvent(document: ClassifiableSourceDocument): EventClassification {
  const calendarOverride = reportingCalendarOverride(document);
  if (calendarOverride) return calendarOverride;
  const reportOverride = financialReportOverride(document);
  if (reportOverride) return reportOverride;
  const settlementOverride = legalSettlementOverride(document);
  if (settlementOverride) return settlementOverride;

  const normalizedText = normalizeCompanyName(documentText(document));
  const candidateRules =
    document.source?.sourceType === "newsweb"
      ? EVENT_CLASSIFICATION_RULES.filter(
          (rule) => !BROAD_MARKET_EVENT_TYPES.has(rule.eventType),
        )
      : EVENT_CLASSIFICATION_RULES;
  const matches = candidateRules.flatMap((rule) => {
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

  return classificationFromRule(best.rule, best.score, {
      matchedKeywords: best.hits,
      titleKeywords: best.titleHits,
      sourceType: document.source?.sourceType ?? null,
      candidateCount: matches.length,
  });
}
