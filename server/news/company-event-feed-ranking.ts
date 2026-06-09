import { normalizeCompanyName } from "@/server/news/company-alias-service";

export type FeedRankableEvent = {
  id: string;
  companyId: string;
  eventType: string;
  title: string;
  eventDate: Date | null;
  lastSeen: Date;
  investorValueScore: number;
  confidenceScore: number;
  noveltyScore?: number;
  severityScore?: number;
};

export type CompanyEventStage = "primary" | "follow_up" | "administrative" | "routine";

const DAY_MS = 86_400_000;
const STORY_WINDOW_DAYS = 21;

const EVENT_PRIORITY: Record<string, number> = {
  bankruptcy: 1,
  reconstruction: 0.98,
  going_concern_risk: 0.98,
  profit_warning: 0.96,
  auditor_warning: 0.94,
  guidance_downgrade: 0.92,
  guidance_upgrade: 0.88,
  contract_loss: 0.9,
  license_loss: 0.9,
  legal_settlement: 0.86,
  mna: 0.88,
  cost_overrun: 0.86,
  cash_flow_issue: 0.86,
  project_delay: 0.84,
  contract_award: 0.82,
  asset_sale: 0.82,
  strategic_review: 0.8,
  regulatory_approval: 0.78,
  capital_raise: 0.78,
  share_issue: 0.76,
  debt_refinancing: 0.76,
  earnings: 0.76,
  financial_statement: 0.74,
  production_update: 0.72,
  ownership_change: 0.5,
  bond_issue: 0.68,
  dividend: 0.66,
  ceo_change: 0.64,
  annual_report: 0.58,
  insider_transaction: 0.5,
  board_change: 0.46,
  reporting_calendar: 0.24,
};

const ADMINISTRATIVE_TITLE_PATTERNS = [
  /\blast day of trading\b/,
  /\bsiste handelsdag\b/,
  /\bcommencement of the subscription period\b/,
  /\bsubscription period (?:starts|commences)\b/,
  /\bapproval and publication of (?:a )?prospectus\b/,
  /\bapproval of prospectus\b/,
  /\bprospectus (?:approved|published)\b/,
  /\bapplication for (?:listing|admission to trading)\b/,
  /\breceived application (?:for|of) (?:listing|admission)\b/,
  /\bmottatt soknad om notering\b/,
  /\bsuccessful listing of (?:a )?bond issue\b/,
  /\bshare capital increase .* registered\b/,
  /\bkapitalforhoyelse .* registrert\b/,
  /\bredelivery of share loan\b/,
  /\bkey information (?:relating to|related to|regarding)\b/,
  /\bnokkelinformasjon ved\b/,
  /\bex subscription rights\b/,
  /\bcommencement of (?:the )?exercise period for warrants\b/,
  /\bexercise price for warrants\b/,
  /\bissue of new shares following option exercise\b/,
  /\bemployee share purchase programme\b/,
  /\bemployee share purchase program\b/,
  /\bsubscriptions for the employee share purchase\b/,
  /\bstatus tilbakekjop\b/,
  /\bstatus for tilbakekjopsprogram\b/,
  /\bstatus (?:of )?share buy ?back (?:programme|program)\b/,
  /\btransactions? made under (?:the )?share buyback programme\b/,
  /\bshare buyback transactions\b/,
  /\bweekly (?:share )?buyback update\b/,
  /\bnotice of (?:an )?extraordinary general meeting in connection with\b/,
  /\b(?:trading )?ex[. ]+dividend\b/,
  /\bex[. ]+utbytte\b/,
  /\beksklusive utbytte\b/,
  /\bproxy rights?\b/,
  /\bvoting rights? (?:at|of) (?:the )?(?:annual|extraordinary) general meeting\b/,
];

const FOLLOW_UP_TITLE_PATTERNS = [
  /\bsuccessful completion of\b/,
  /\btransaction completed\b/,
  /\bacquisition .* completed\b/,
  /\bsettlement of\b/,
  /\bfinal results? of\b/,
  /\bterms for the .* issue\b/,
  /\badditional information\b/,
  /\bupdate on (?:the )?(?:private placement|rights issue|transaction|offer)\b/,
];

const ROUTINE_TITLE_PATTERNS = [
  /^flaggemelding\b/,
  /^flagging\b/,
  /\bmajor shareholdings? notification\b/,
  /\bsubstantial shareholding disclosure\b/,
  /^disclosure of (?:significant )?shareholding\b/,
];

const ROUTINE_EVENT_TYPES = new Set([
  "annual_report",
  "board_change",
  "insider_transaction",
  "reporting_calendar",
]);

const STORY_FAMILIES: Record<string, string> = {
  reporting_calendar: "financial_reporting",
  earnings: "financial_reporting",
  financial_statement: "financial_reporting",
  annual_report: "financial_reporting",
  capital_raise: "equity_financing",
  share_issue: "equity_financing",
  regulatory_approval: "equity_financing",
  listing: "equity_financing",
  bond_issue: "debt_financing",
  debt_refinancing: "debt_financing",
  mna: "transaction",
  asset_sale: "transaction",
  legal_settlement: "legal_case",
  buyback: "capital_distribution",
  dividend: "capital_distribution",
};

export function companyEventStoryFamily(eventType: string) {
  return STORY_FAMILIES[eventType] ?? eventType;
}

export function buildCompanyEventStoryKey(input: {
  companyId: string;
  eventType: string;
  title: string;
  eventDate?: Date | null;
}) {
  const family = companyEventStoryFamily(input.eventType);
  const date = input.eventDate ?? new Date(0);
  const period =
    family === "financial_reporting"
      ? `${date.getUTCFullYear()}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`
      : date.toISOString().slice(0, 7);
  const periodOnlyFamilies = new Set([
    "financial_reporting",
    "equity_financing",
    "debt_financing",
    "capital_distribution",
  ]);
  const tokens =
    periodOnlyFamilies.has(family)
      ? ""
      : `:${titleTokens(input.title).slice(0, 5).join("-")}`;
  return `${input.companyId}:${family}:${period}${tokens}`;
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function normalizeTitle(value: string) {
  return normalizeCompanyName(value)
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleTokens(value: string) {
  const stopwords = new Set([
    "the",
    "and",
    "for",
    "with",
    "from",
    "that",
    "this",
    "asa",
    "as",
  ]);
  return normalizeTitle(value)
    .split(" ")
    .filter((token) => token.length >= 3 && !stopwords.has(token));
}

function nearDuplicateTitle(left: string, right: string) {
  const leftTokens = new Set(titleTokens(left));
  const rightTokens = new Set(titleTokens(right));
  const smaller = Math.min(leftTokens.size, rightTokens.size);
  if (smaller < 4) return false;
  const overlap = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return overlap / smaller >= 0.4;
}

export function companyEventEffectiveDate(event: FeedRankableEvent) {
  return event.eventDate ?? event.lastSeen;
}

export function classifyCompanyEventStage(event: Pick<FeedRankableEvent, "eventType" | "title">): CompanyEventStage {
  const title = normalizeTitle(event.title);
  if (ADMINISTRATIVE_TITLE_PATTERNS.some((pattern) => pattern.test(title))) return "administrative";
  if (FOLLOW_UP_TITLE_PATTERNS.some((pattern) => pattern.test(title))) return "follow_up";
  if (ROUTINE_TITLE_PATTERNS.some((pattern) => pattern.test(title))) return "routine";
  if (ROUTINE_EVENT_TYPES.has(event.eventType)) return "routine";
  return "primary";
}

function freshnessScore(date: Date, now: Date) {
  const ageDays = Math.max(0, (now.getTime() - date.getTime()) / DAY_MS);
  return Math.pow(0.5, ageDays / 10);
}

function stageAdjustment(stage: CompanyEventStage) {
  if (stage === "administrative") return -0.24;
  if (stage === "follow_up") return -0.08;
  if (stage === "routine") return -0.1;
  return 0;
}

export function computeCompanyEventFeedRank(event: FeedRankableEvent, now = new Date()) {
  const investorValue = clamp01(event.investorValueScore / 100);
  const confidence = clamp01(event.confidenceScore);
  const novelty = clamp01(event.noveltyScore ?? 0.5);
  const severity = clamp01(event.severityScore ?? 0.5);
  const eventPriority = EVENT_PRIORITY[event.eventType] ?? 0.5;
  const freshness = freshnessScore(companyEventEffectiveDate(event), now);
  const stage = classifyCompanyEventStage(event);

  return clamp01(
    investorValue * 0.28 +
      freshness * 0.3 +
      eventPriority * 0.2 +
      confidence * 0.08 +
      severity * 0.08 +
      novelty * 0.06 +
      stageAdjustment(stage),
  );
}

export function areSameInvestorStory(left: FeedRankableEvent, right: FeedRankableEvent) {
  const leftFamily = STORY_FAMILIES[left.eventType];
  const rightFamily = STORY_FAMILIES[right.eventType];
  if (!leftFamily || leftFamily !== rightFamily) return false;

  const distanceDays = Math.abs(
    companyEventEffectiveDate(left).getTime() - companyEventEffectiveDate(right).getTime(),
  ) / DAY_MS;
  if (left.companyId === right.companyId) return distanceDays <= STORY_WINDOW_DAYS;
  return distanceDays <= 3 && nearDuplicateTitle(left.title, right.title);
}
