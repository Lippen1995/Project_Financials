import { z } from "zod";

import {
  getKnowledgeRuleStatus,
  searchBusinessKnowledge,
} from "@/server/knowledge/knowledge-repository";
import type {
  KnowledgeDomainValue,
  KnowledgeJurisdictionValue,
} from "@/server/knowledge/knowledge-domain";
import { defineTool } from "./types";

const searchInputSchema = z.object({
  query: z.string().min(2).max(500),
  asOf: z.string().date().nullable(),
  limit: z.number().int().min(1).max(10),
});
type SearchKnowledgeInput = z.infer<typeof searchInputSchema>;

const searchParameters = {
  type: "object",
  properties: {
    query: {
      type: "string",
      description: "Precise legal, accounting or policy concept, document reference, article or paragraph.",
    },
    asOf: {
      type: ["string", "null"],
      format: "date",
      description: "Date the answer should be valid for (YYYY-MM-DD), or null for today.",
    },
    limit: {
      type: "integer",
      minimum: 1,
      maximum: 10,
      description: "Maximum number of authoritative excerpts to return.",
    },
  },
  required: ["query", "asOf", "limit"],
  additionalProperties: false,
} as const;

function createKnowledgeSearchTool(options: {
  name: string;
  description: string;
  domains: KnowledgeDomainValue[];
  jurisdictions?: KnowledgeJurisdictionValue[];
}) {
  return defineTool({
    name: options.name,
    description: options.description,
    strict: true,
    inputSchema: searchInputSchema,
    parameters: searchParameters,
    async execute(input: SearchKnowledgeInput) {
      const asOf = input.asOf ? new Date(`${input.asOf}T00:00:00.000Z`) : new Date();
      const results = await searchBusinessKnowledge({
        query: input.query,
        domains: options.domains,
        jurisdictions: options.jurisdictions,
        asOf,
        limit: input.limit,
      });
      return {
        query: input.query,
        asOf: asOf.toISOString(),
        retrievalMode: "OFFLINE_LEXICAL" as const,
        results,
        coverage: {
          resultCount: results.length,
          sufficient: results.length > 0,
          message: results.length > 0
            ? "Authoritative offline excerpts found. Cite citationId and distinguish legal status from interpretation."
            : "No authoritative excerpt was found in the synchronized offline corpus. Do not answer from memory as if current law.",
        },
      };
    },
  });
}

export const searchNorwegianLawTool = createKnowledgeSearchTool({
  name: "search_norwegian_law",
  description:
    "Search the synchronized offline corpus of authoritative Norwegian laws and regulations. Use for legal questions, and call get_rule_status when applicability or effective date matters.",
  domains: ["NORWEGIAN_LAW"],
  jurisdictions: ["NO"],
});

export const searchAccountingGuidanceTool = createKnowledgeSearchTool({
  name: "search_accounting_guidance",
  description:
    "Search authoritative offline Norwegian accounting/bookkeeping guidance and EU/EEA-adopted IFRS material. Use for recognition, measurement, presentation and disclosure questions.",
  domains: ["ACCOUNTING", "IFRS"],
});

export const searchEuEeaLawTool = createKnowledgeSearchTool({
  name: "search_eu_eea_law",
  description:
    "Search authoritative offline EU and EEA legal material. Always distinguish EU adoption, EEA incorporation, entry into force and Norwegian implementation.",
  domains: ["EU_EEA_LAW"],
  jurisdictions: ["EU", "EEA"],
});

export const searchBusinessPolicyTool = createKnowledgeSearchTool({
  name: "search_business_policy",
  description:
    "Search synchronized official Norwegian and EEA business-policy material such as hearings, propositions, budgets and parliamentary decisions. Never present a proposal as law in force.",
  domains: ["BUSINESS_POLICY"],
  jurisdictions: ["NO", "EU", "EEA"],
});

const ruleStatusInputSchema = z.object({
  reference: z.string().min(2).max(300),
  asOf: z.string().date().nullable(),
  limit: z.number().int().min(1).max(10),
});

export const getRuleStatusTool = defineTool({
  name: "get_rule_status",
  description:
    "Resolve the dated legal status of a known law, regulation, standard, EU act or provision in the offline corpus. Use before claiming that a rule applies on a specific date.",
  strict: true,
  inputSchema: ruleStatusInputSchema,
  parameters: {
    type: "object",
    properties: {
      reference: {
        type: "string",
        description: "Official identifier, title, standard name or provision reference.",
      },
      asOf: {
        type: ["string", "null"],
        format: "date",
        description: "Date to evaluate (YYYY-MM-DD), or null for today.",
      },
      limit: { type: "integer", minimum: 1, maximum: 10 },
    },
    required: ["reference", "asOf", "limit"],
    additionalProperties: false,
  },
  async execute(input) {
    const asOf = input.asOf ? new Date(`${input.asOf}T00:00:00.000Z`) : new Date();
    return getKnowledgeRuleStatus({ reference: input.reference, asOf, limit: input.limit });
  },
});
