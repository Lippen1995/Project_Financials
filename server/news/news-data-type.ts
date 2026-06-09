export const NEWS_DATA_TYPES = ["company", "industry", "macro", "regulatory"] as const;

export type NewsDataType = (typeof NEWS_DATA_TYPES)[number];

const MACRO_EVENT_TYPES = new Set([
  "commodity_price_exposure",
  "credit_market",
  "currency",
  "inflation",
  "interest_rate",
  "interest_rate_exposure",
  "macro_news",
]);

const INDUSTRY_EVENT_TYPES = new Set([
  "peer_read_across",
  "sector_news",
]);

const REGULATORY_EVENT_TYPES = new Set([
  "license_award",
  "license_loss",
  "regulatory_change",
]);

const ENERGY_MACRO_SOURCE_IDS = new Set([
  "eia-today",
  "eia-press",
  "eia-petroleum-weekly",
  "iea-news",
]);

const INDUSTRY_SOURCE_IDS = new Set([
  "sodir-news",
  "sodir-production",
  "sodir-drilling-permits",
  "sodir-exploration-results",
]);

export function classifyNewsDataType(input: {
  eventType?: string | null;
  exposureType?: string | null;
  sourceId?: string | null;
  sourceType?: string | null;
  sourceTier?: string | null;
  relevanceType?: string | null;
}): NewsDataType {
  if (ENERGY_MACRO_SOURCE_IDS.has(input.sourceId ?? "")) return "macro";
  if (INDUSTRY_SOURCE_IDS.has(input.sourceId ?? "")) return "industry";
  if (MACRO_EVENT_TYPES.has(input.eventType ?? "") || input.relevanceType === "macro") {
    return "macro";
  }
  if (
    INDUSTRY_EVENT_TYPES.has(input.eventType ?? "") ||
    ["peer", "industry"].includes(input.relevanceType ?? "") ||
    ["peer", "sector", "petroleum", "commodity", "value_chain"].includes(input.exposureType ?? "")
  ) {
    return "industry";
  }
  if (
    REGULATORY_EVENT_TYPES.has(input.eventType ?? "") ||
    input.exposureType === "regulatory" ||
    input.sourceType === "regulator" ||
    input.sourceTier === "regulatory"
  ) {
    return "regulatory";
  }
  return "company";
}
