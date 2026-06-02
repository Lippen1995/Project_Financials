export const COMPANY_EVENT_TYPES = [
  "capital_raise",
  "share_issue",
  "debt_refinancing",
  "bond_issue",
  "dividend",
  "buyback",
  "listing",
  "delisting",
  "earnings",
  "annual_report",
  "financial_statement",
  "profit_warning",
  "guidance_upgrade",
  "guidance_downgrade",
  "margin_pressure",
  "cash_flow_issue",
  "mna",
  "asset_sale",
  "spin_off",
  "restructuring",
  "strategic_review",
  "contract_award",
  "contract_loss",
  "production_update",
  "capacity_expansion",
  "project_delay",
  "cost_overrun",
  "investigation",
  "fine",
  "license_award",
  "license_loss",
  "lawsuit",
  "tax_dispute",
  "regulatory_approval",
  "regulatory_change",
  "bankruptcy",
  "reconstruction",
  "liquidation",
  "forced_dissolution",
  "auditor_warning",
  "going_concern_risk",
  "ceo_change",
  "cfo_change",
  "board_change",
  "auditor_change",
  "insider_transaction",
  "ownership_change",
  "commodity_price_exposure",
  "interest_rate_exposure",
  "peer_read_across",
  "sector_news",
  "macro_news",
  "product_launch",
  "analyst_comment",
  "low_signal_mention",
  "other",
] as const;

export type CompanyEventType = (typeof COMPANY_EVENT_TYPES)[number];

export type EventDirection = "positive" | "negative" | "mixed" | "neutral" | "unknown";
export type EventImpactHorizon = "immediate" | "short_term" | "medium_term" | "long_term";
export type EventConfidenceLevel = "high" | "medium" | "low";

export type EventClassification = {
  eventType: CompanyEventType;
  eventTypeScore: number;
  materialityScore: number;
  financialImpactScore: number;
  strategicImpactScore: number;
  riskImpactScore: number;
  direction: EventDirection;
  impactHorizon: EventImpactHorizon | null;
  confidenceLevel: EventConfidenceLevel;
  explanation: Record<string, unknown>;
};

export type EventRule = {
  eventType: CompanyEventType;
  keywords: string[];
  materialityScore: number;
  financialImpactScore: number;
  strategicImpactScore: number;
  riskImpactScore: number;
  direction: EventDirection;
  impactHorizon: EventImpactHorizon | null;
};

export const EVENT_CLASSIFICATION_RULES: EventRule[] = [
  {
    eventType: "annual_report",
    keywords: ["annual report", "årsrapport", "arsrapport", "årsregnskap", "arsregnskap"],
    materialityScore: 0.78,
    financialImpactScore: 0.82,
    strategicImpactScore: 0.42,
    riskImpactScore: 0.35,
    direction: "neutral",
    impactHorizon: "immediate",
  },
  {
    eventType: "earnings",
    keywords: ["quarterly report", "q1", "q2", "q3", "q4", "resultat", "earnings", "financial results"],
    materialityScore: 0.78,
    financialImpactScore: 0.84,
    strategicImpactScore: 0.38,
    riskImpactScore: 0.36,
    direction: "neutral",
    impactHorizon: "immediate",
  },
  {
    eventType: "contract_award",
    keywords: ["contract award", "wins contract", "tildelt kontrakt", "kontrakt", "rammeavtale", "agreement"],
    materialityScore: 0.72,
    financialImpactScore: 0.68,
    strategicImpactScore: 0.62,
    riskImpactScore: 0.22,
    direction: "positive",
    impactHorizon: "short_term",
  },
  {
    eventType: "capital_raise",
    keywords: ["capital raise", "kapitalinnhenting", "private placement", "rettet emisjon", "emisjon"],
    materialityScore: 0.86,
    financialImpactScore: 0.86,
    strategicImpactScore: 0.58,
    riskImpactScore: 0.54,
    direction: "mixed",
    impactHorizon: "immediate",
  },
  {
    eventType: "buyback",
    keywords: ["buy-back", "buyback", "tilbakekjøp", "tilbakekjop", "egne aksjer"],
    materialityScore: 0.58,
    financialImpactScore: 0.52,
    strategicImpactScore: 0.34,
    riskImpactScore: 0.12,
    direction: "positive",
    impactHorizon: "short_term",
  },
  {
    eventType: "dividend",
    keywords: ["dividend", "utbytte", "cash dividend"],
    materialityScore: 0.66,
    financialImpactScore: 0.72,
    strategicImpactScore: 0.28,
    riskImpactScore: 0.16,
    direction: "positive",
    impactHorizon: "immediate",
  },
  {
    eventType: "bankruptcy",
    keywords: ["bankruptcy", "konkurs", "bankrupt"],
    materialityScore: 0.98,
    financialImpactScore: 0.92,
    strategicImpactScore: 0.82,
    riskImpactScore: 0.98,
    direction: "negative",
    impactHorizon: "immediate",
  },
  {
    eventType: "liquidation",
    keywords: ["liquidation", "avvikling", "oppløsning", "opplosning"],
    materialityScore: 0.92,
    financialImpactScore: 0.82,
    strategicImpactScore: 0.74,
    riskImpactScore: 0.9,
    direction: "negative",
    impactHorizon: "immediate",
  },
  {
    eventType: "ceo_change",
    keywords: ["ceo", "chief executive", "konsernsjef", "administrerende direktør", "administrerende direktor"],
    materialityScore: 0.66,
    financialImpactScore: 0.24,
    strategicImpactScore: 0.72,
    riskImpactScore: 0.42,
    direction: "mixed",
    impactHorizon: "short_term",
  },
  {
    eventType: "board_change",
    keywords: ["board", "styre", "chair", "styreleder"],
    materialityScore: 0.54,
    financialImpactScore: 0.18,
    strategicImpactScore: 0.54,
    riskImpactScore: 0.34,
    direction: "mixed",
    impactHorizon: "medium_term",
  },
  {
    eventType: "investigation",
    keywords: ["investigation", "etterforskning", "tilsynssak", "gransking", "probe"],
    materialityScore: 0.82,
    financialImpactScore: 0.42,
    strategicImpactScore: 0.48,
    riskImpactScore: 0.86,
    direction: "negative",
    impactHorizon: "short_term",
  },
  {
    eventType: "regulatory_approval",
    keywords: ["approved", "godkjenner", "approval", "regulatory approval"],
    materialityScore: 0.62,
    financialImpactScore: 0.38,
    strategicImpactScore: 0.52,
    riskImpactScore: 0.22,
    direction: "positive",
    impactHorizon: "short_term",
  },
  {
    eventType: "regulatory_change",
    keywords: ["regulation", "forskrift", "lovendring", "regulatory change", "sanksjonspakke", "sanctions package"],
    materialityScore: 0.7,
    financialImpactScore: 0.44,
    strategicImpactScore: 0.54,
    riskImpactScore: 0.62,
    direction: "mixed",
    impactHorizon: "medium_term",
  },
  {
    eventType: "interest_rate_exposure",
    keywords: ["policy rate", "styringsrente", "interest rate", "renteheving", "rentekutt"],
    materialityScore: 0.66,
    financialImpactScore: 0.62,
    strategicImpactScore: 0.32,
    riskImpactScore: 0.44,
    direction: "mixed",
    impactHorizon: "short_term",
  },
  {
    eventType: "commodity_price_exposure",
    keywords: ["oil price", "brent", "wti", "natural gas", "lng", "oljepris", "gasspris"],
    materialityScore: 0.68,
    financialImpactScore: 0.66,
    strategicImpactScore: 0.38,
    riskImpactScore: 0.42,
    direction: "mixed",
    impactHorizon: "short_term",
  },
];
