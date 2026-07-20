import type { RetrievalTool } from "./types";
import { resolveCompanyTool } from "./resolve-company";
import { companyProfileTool } from "./company-profile";
import { findComparablesTool } from "./find-comparables";
import { findByBusinessTool } from "./find-by-business";
import { getChainFinancialsTool } from "./get-chain-financials";

/**
 * The retrieval tool registry the agent is given. v1 covers the competitors path end-to-end:
 * resolve → profile → comparables. find_by_business adds product/value-chain candidate generation
 * over the qualitative corpus (CompanyWebProfile). Ownership traversal, shared-graph, and
 * franchise-location tools slot in here as they are built (Phase 2).
 */
export const retrievalTools: RetrievalTool[] = [
  resolveCompanyTool as RetrievalTool,
  companyProfileTool as RetrievalTool,
  findComparablesTool as RetrievalTool,
  findByBusinessTool as RetrievalTool,
  getChainFinancialsTool as RetrievalTool,
];

export const retrievalToolsByName: Record<string, RetrievalTool> = Object.fromEntries(
  retrievalTools.map((tool) => [tool.name, tool]),
);

export { resolveCompanyTool } from "./resolve-company";
export { companyProfileTool } from "./company-profile";
export { findComparablesTool } from "./find-comparables";
export { findByBusinessTool } from "./find-by-business";
export { getChainFinancialsTool } from "./get-chain-financials";
export * from "./types";
