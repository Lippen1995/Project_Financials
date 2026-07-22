import { z } from "zod";

import { defineTool } from "./types";

export const NJORD_REQUEST_INTENTS = [
  "COMPANY_ANALYSIS",
  "GROUP_FINANCIAL_ESTIMATE",
  "MNA_PRO_FORMA",
  "NORWEGIAN_LAW",
  "ACCOUNTING_OR_IFRS",
  "EU_EEA_LAW",
  "BUSINESS_POLICY",
  "MIXED",
] as const;

export type NjordRequestIntent = (typeof NJORD_REQUEST_INTENTS)[number];

const STANDARD_NJORD_REQUEST_INTENTS = NJORD_REQUEST_INTENTS.filter(
  (intent) => intent !== "MNA_PRO_FORMA",
) as Exclude<NjordRequestIntent, "MNA_PRO_FORMA">[];

/**
 * The model must call this before retrieval. The result lets the agent restrict the next turn to
 * the correct grounded tool family without a parallel regex/rule-based intent model.
 */
export function createRouteNjordRequestTool(options: { allowMnaProForma: boolean }) {
  const intents = (options.allowMnaProForma
    ? [...NJORD_REQUEST_INTENTS]
    : [...STANDARD_NJORD_REQUEST_INTENTS]) as [NjordRequestIntent, ...NjordRequestIntent[]];
  const inputSchema = z.object({
    intent: z.enum(intents),
    reason: z.string().min(1).max(240),
  });

  return defineTool({
    name: "route_njord_request",
    description:
      "Classify the user's request before retrieving facts. Choose the legal/accounting/policy intent whenever " +
      "the user asks for interpretation of rules or standards; use MIXED when company facts and such rule " +
      "interpretation are both needed. A request to calculate or estimate company/group figures from stored " +
      "financial data is GROUP_FINANCIAL_ESTIMATE unless it also asks how IFRS, accounting law or another rule applies." +
      (options.allowMnaProForma
        ? " Use MNA_PRO_FORMA when the user asks to combine buyer and target accounts with transaction assumptions."
        : ""),
    strict: true,
    inputSchema,
    parameters: {
      type: "object",
      properties: {
        intent: { type: "string", enum: intents },
        reason: { type: "string", description: "Short reason for the routing choice." },
      },
      required: ["intent", "reason"],
      additionalProperties: false,
    },
    async execute(input) {
      return input;
    },
  });
}

/** Safe default for contexts that do not carry an authenticated Due Diligence entitlement. */
export const routeNjordRequestTool = createRouteNjordRequestTool({ allowMnaProForma: false });
