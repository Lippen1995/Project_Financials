import type { RetrievalTool } from "./types";
import { resolveCompanyTool } from "./resolve-company";
import { companyProfileTool } from "./company-profile";
import { findComparablesTool } from "./find-comparables";
import { findByBusinessTool } from "./find-by-business";
import { getChainFinancialsTool } from "./get-chain-financials";
import { estimateGroupFinancialsTool } from "./estimate-group-financials";
import { createBuildMnaProFormaTool } from "./build-mna-pro-forma";
import {
  getRuleStatusTool,
  searchAccountingGuidanceTool,
  searchBusinessPolicyTool,
  searchEuEeaLawTool,
  searchNorwegianLawTool,
} from "./search-knowledge";
import { createRouteNjordRequestTool, routeNjordRequestTool } from "./route-request";
import { screenCompanyUniverseTool } from "./screen-company-universe";

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
  estimateGroupFinancialsTool as RetrievalTool,
  searchNorwegianLawTool as RetrievalTool,
  searchAccountingGuidanceTool as RetrievalTool,
  searchEuEeaLawTool as RetrievalTool,
  searchBusinessPolicyTool as RetrievalTool,
  getRuleStatusTool as RetrievalTool,
  screenCompanyUniverseTool as RetrievalTool,
];

export function getRetrievalToolsForAccess(options: {
  canUseDueDiligence: boolean;
  userQuery: string;
}): RetrievalTool[] {
  const tools = [
    createRouteNjordRequestTool({ allowMnaProForma: options.canUseDueDiligence }) as RetrievalTool,
    ...retrievalTools.filter((tool) => tool.name !== "route_njord_request"),
  ];
  if (options.canUseDueDiligence) {
    tools.push(createBuildMnaProFormaTool({ userQuery: options.userQuery }) as RetrievalTool);
  }
  return tools;
}

export const retrievalToolsByName: Record<string, RetrievalTool> = Object.fromEntries(
  retrievalTools.map((tool) => [tool.name, tool]),
);

export { resolveCompanyTool } from "./resolve-company";
export { companyProfileTool } from "./company-profile";
export { findComparablesTool } from "./find-comparables";
export { findByBusinessTool } from "./find-by-business";
export { getChainFinancialsTool } from "./get-chain-financials";
export { estimateGroupFinancialsTool } from "./estimate-group-financials";
export { createRouteNjordRequestTool, routeNjordRequestTool } from "./route-request";
export { createBuildMnaProFormaTool } from "./build-mna-pro-forma";
export { screenCompanyUniverseTool } from "./screen-company-universe";
export {
  getRuleStatusTool,
  searchAccountingGuidanceTool,
  searchBusinessPolicyTool,
  searchEuEeaLawTool,
  searchNorwegianLawTool,
} from "./search-knowledge";
export * from "./types";
