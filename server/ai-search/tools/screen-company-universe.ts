import { z } from "zod";

import { companyUniverseService } from "@/server/analysis/company-universe-service";
import {
  companyUniverseQuerySchema,
  rankingCriterionSchema,
} from "@/server/analysis/company-analysis-domain";
import { defineTool } from "./types";

const inputSchema = z.object({
  query: companyUniverseQuerySchema.refine(
    (query) => query.limit <= 100,
    "Njord tool results are limited to 100 companies.",
  ),
  ranking: z.array(rankingCriterionSchema).min(1).max(10).optional(),
}).strict();

export const screenCompanyUniverseTool = defineTool({
  name: "screen_company_universe",
  version: "v1",
  outputKind: "CALCULATION",
  dataDomains: ["company-master", "financials"],
  description:
    "Build, filter and optionally rank a reproducible Norwegian company universe over official Brreg company data and available structured Brreg financials. Missing values remain explicit gaps and are never converted to zero.",
  strict: false,
  inputSchema,
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      query: {
        type: "object",
        additionalProperties: false,
        properties: {
          version: { type: "string", enum: ["company-universe-v1"] },
          workflow: {
            type: "string",
            enum: ["MNA_SCREENING", "SOURCING", "COMPETITOR_ANALYSIS"],
          },
          query: { type: "string", maxLength: 200 },
          industryCodePrefixes: {
            type: "array",
            maxItems: 25,
            items: { type: "string" },
          },
          municipalityNumbers: {
            type: "array",
            maxItems: 50,
            items: { type: "string", pattern: "^[0-9]{4}$" },
          },
          legalForms: { type: "array", maxItems: 25, items: { type: "string" } },
          statuses: {
            type: "array",
            minItems: 1,
            maxItems: 3,
            items: { type: "string", enum: ["ACTIVE", "DISSOLVED", "BANKRUPT"] },
          },
          minEmployees: { type: "integer", minimum: 0 },
          maxEmployees: { type: "integer", minimum: 0 },
          minRevenue: { type: "number", minimum: 0 },
          maxRevenue: { type: "number", minimum: 0 },
          minOperatingMarginBps: { type: "integer" },
          maxOperatingMarginBps: { type: "integer" },
          fiscalYear: { type: "integer", minimum: 1990, maximum: 2200 },
          missingDataPolicy: {
            type: "string",
            enum: ["EXCLUDE", "INCLUDE_WITH_GAP"],
          },
          limit: { type: "integer", minimum: 1, maximum: 100 },
        },
        required: ["version", "workflow", "statuses", "missingDataPolicy", "limit"],
      },
      ranking: {
        type: "array",
        minItems: 1,
        maxItems: 10,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            metric: {
              type: "string",
              enum: ["REVENUE", "OPERATING_MARGIN_BPS", "EMPLOYEE_COUNT"],
            },
            direction: {
              type: "string",
              enum: ["HIGHER_BETTER", "LOWER_BETTER"],
            },
            weight: { type: "integer", minimum: 1, maximum: 100 },
          },
          required: ["metric", "direction", "weight"],
        },
      },
    },
    required: ["query"],
  },
  execute: (input) => companyUniverseService.run(input),
});
