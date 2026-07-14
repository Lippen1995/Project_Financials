import { z } from "zod";

import type { NormalizedCompany } from "@/lib/types";

/**
 * Compact company reference the retrieval tools hand back to the agent. Deliberately small:
 * every field the model reasons over must trace to a real row, and keeping the shape tight
 * keeps tool-result tokens (replayed every agent turn) cheap. orgNumber is the join key the
 * agent must cite — the final-answer guard drops any company not present in a tool result.
 */
export type AgentCompanyRef = {
  orgNumber: string;
  name: string;
  naceCode: string | null;
  naceDescription: string | null;
  municipality: string | null;
  employeeCount: number | null;
  status: "ACTIVE" | "DISSOLVED" | "BANKRUPT";
  /**
   * Latest published headline figures (NOK), when the company is in our financial coverage.
   * Attached to ranked shortlists so the agent can weigh size/health without a second call.
   * Absent (null) means "no accounts loaded", NOT "zero" — the agent must not treat it as such.
   */
  latestFinancials?: FinancialSnapshot | null;
};

/** One year of headline accounts. Amounts are already unit-normalized to whole NOK. */
export type FinancialSnapshot = {
  fiscalYear: number;
  currency: string;
  revenue: number | null;
  operatingProfit: number | null;
  netIncome: number | null;
  equity: number | null;
  assets: number | null;
};

/**
 * Who controls the company and whether it sits inside a larger group — the acquirability
 * signals. Derived from the shareholder register (OwnershipEdge / group structure), so it is
 * only as fresh as the latest tax-year import; `year` states which year it reflects.
 */
export type OwnershipSummary = {
  year: number | null;
  /** Largest single direct owner (person or company), i.e. the party a buyer negotiates with. */
  controllingOwner: {
    name: string;
    orgNumber: string | null;
    type: "PERSON" | "COMPANY" | "UNKNOWN";
    ownershipPercent: number | null;
  } | null;
  /** Count of distinct direct shareholders — low = concentrated/easier to acquire. */
  ownerCount: number;
  /** True when controlled (>50%) from above: a bolt-on of an existing group, not standalone. */
  partOfGroup: boolean;
  ultimateParentName: string | null;
  /** Direct subsidiaries this company itself controls (it may be bought as a mini-group). */
  subsidiaryCount: number;
};

/**
 * The free-text "what do they actually do" layer registry codes cannot give. `businessSummary`
 * is an excerpt of the styrets beretning (board report) — the richest description we hold.
 */
export type QualitativeSummary = {
  description: string | null;
  website: string | null;
  /**
   * Reasoned prose: what the company makes/does and its value-chain position. This is the
   * primary qualitative signal the agent reasons over for strategic fit — sourced from the
   * offline-built CompanyWebProfile (website scrape + reasoning), falling back to the board report.
   */
  businessSummary: string | null;
  businessSummarySource: "website" | "board-report" | null;
  /** URL the website profile was scraped from (when source = "website"). */
  sourceUrl: string | null;
  /** Fiscal year of the board report (when source = "board-report"). */
  businessSummaryYear: number | null;
};

/** The deep, single-company view returned by get_company_profile (drill-in, not list rows). */
export type AgentCompanyProfile = AgentCompanyRef & {
  legalForm: string | null;
  /** Most-recent-first, capped to a few years so multi-year trend is visible but cheap. */
  financials: FinancialSnapshot[];
  ownership: OwnershipSummary | null;
  qualitative: QualitativeSummary;
};

export function toAgentCompanyRef(company: NormalizedCompany): AgentCompanyRef {
  return {
    orgNumber: company.orgNumber,
    name: company.name,
    naceCode: company.industryCode?.code ?? null,
    naceDescription: company.industryCode?.description ?? company.industryCode?.title ?? null,
    municipality: company.municipality ?? null,
    employeeCount: company.employeeCount ?? null,
    status: company.status,
  };
}

/**
 * A deterministic retrieval tool the agent may call. `inputSchema` validates arguments at
 * runtime (the model's tool arguments are untrusted); `parameters` is the JSON Schema handed
 * to the LLM's function-calling API. They are kept in lockstep by hand rather than pulling in
 * a zod→JSON-schema dependency — the tool surface is small and rarely changes.
 */
export type RetrievalTool<TInput = unknown, TOutput = unknown> = {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  parameters: Record<string, unknown>;
  execute: (input: TInput) => Promise<TOutput>;
};

/** Narrow helper so `execute` receives validated input and callers get a typed result. */
export function defineTool<TInput, TOutput>(
  tool: RetrievalTool<TInput, TOutput>,
): RetrievalTool<TInput, TOutput> {
  return tool;
}
