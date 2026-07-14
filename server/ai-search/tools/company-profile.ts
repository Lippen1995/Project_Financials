import { z } from "zod";

import { searchRegistryCompanies } from "@/server/registry/entity-search-service";
import { AgentCompanyProfile, defineTool, toAgentCompanyRef } from "./types";
import { buildProfileEnrichment } from "./enrich";

const inputSchema = z.object({
  orgNumber: z.string().regex(/^\d{9}$/, "orgNumber must be 9 digits"),
});

export type CompanyProfileInput = z.infer<typeof inputSchema>;

export type CompanyProfileOutput = {
  profile: AgentCompanyProfile | null;
};

/**
 * Fetch the deep profile the agent needs to compare and rank a company: sector (NACE), size,
 * location, multi-year financials, an ownership/acquirability summary, and a qualitative
 * (board-report) description of what the company actually does. The registry attributes come
 * from the local mirror; financials, ownership, and narrative are joined on via buildProfileEnrichment.
 * This is the bridge between resolve_company (which yields the orgNumber) and find_comparables.
 */
export const companyProfileTool = defineTool<CompanyProfileInput, CompanyProfileOutput>({
  name: "get_company_profile",
  description:
    "Get a company's deep profile by org number: name, NACE industry code, employees, " +
    "municipality, status, legal form, the last few years of headline financials (revenue, " +
    "operating profit, net income, equity), an ownership summary (controlling owner, whether it " +
    "sits inside a larger group, subsidiary count), and a qualitative description of what the " +
    "company does (from its board report). Use after resolve_company to gather the attributes " +
    "needed to search for and rank comparables or acquisition targets.",
  inputSchema,
  parameters: {
    type: "object",
    properties: {
      orgNumber: { type: "string", description: "9-digit organisation number." },
    },
    required: ["orgNumber"],
    additionalProperties: false,
  },
  async execute({ orgNumber }) {
    const [company] = await searchRegistryCompanies({ query: orgNumber, size: 1 });
    if (!company) {
      return { profile: null };
    }

    const base = toAgentCompanyRef(company);
    const enrichment = await buildProfileEnrichment({
      orgNumber: company.orgNumber,
      companyName: company.name,
      description: company.description ?? null,
      website: company.website ?? null,
    });

    return {
      profile: {
        ...base,
        legalForm: company.legalForm ?? null,
        latestFinancials: enrichment.financials[0] ?? null,
        financials: enrichment.financials,
        ownership: enrichment.ownership,
        qualitative: enrichment.qualitative,
      },
    };
  },
});
