import type { RetrievalTool } from "./types";
import { resolveCompanyTool } from "./resolve-company";
import { companyProfileTool } from "./company-profile";
import { findComparablesTool } from "./find-comparables";
import { findByBusinessTool } from "./find-by-business";
import { getChainFinancialsTool } from "./get-chain-financials";
import {
  getRuleStatusTool,
  searchAccountingGuidanceTool,
  searchBusinessPolicyTool,
  searchEuEeaLawTool,
  searchNorwegianLawTool,
} from "./search-knowledge";
import { routeNjordRequestTool } from "./route-request";

/**
 * The retrieval tool registry the agent is given. v1 covers the competitors path end-to-end:
 * resolve → profile → comparables. find_by_business adds product/value-chain candidate generation
 * over the qualitative corpus (CompanyWebProfile). Ownership traversal, shared-graph, and
 * franchise-location tools slot in here as they are built (Phase 2).
 */
export const retrievalTools: RetrievalTool[] = [
  routeNjordRequestTool as RetrievalTool,
  resolveCompanyTool as RetrievalTool,
  companyProfileTool as RetrievalTool,
  findComparablesTool as RetrievalTool,
  findByBusinessTool as RetrievalTool,
  getChainFinancialsTool as RetrievalTool,
  searchNorwegianLawTool as RetrievalTool,
  searchAccountingGuidanceTool as RetrievalTool,
  searchEuEeaLawTool as RetrievalTool,
  searchBusinessPolicyTool as RetrievalTool,
  getRuleStatusTool as RetrievalTool,
];

export const retrievalToolsByName: Record<string, RetrievalTool> = Object.fromEntries(
  retrievalTools.map((tool) => [tool.name, tool]),
);

export { resolveCompanyTool } from "./resolve-company";
export { companyProfileTool } from "./company-profile";
export { findComparablesTool } from "./find-comparables";
export { findByBusinessTool } from "./find-by-business";
export { getChainFinancialsTool } from "./get-chain-financials";
export { routeNjordRequestTool } from "./route-request";
export {
  getRuleStatusTool,
  searchAccountingGuidanceTool,
  searchBusinessPolicyTool,
  searchEuEeaLawTool,
  searchNorwegianLawTool,
} from "./search-knowledge";
export * from "./types";
