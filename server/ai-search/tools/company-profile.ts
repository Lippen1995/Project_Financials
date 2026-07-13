import { z } from "zod";

import { searchRegistryCompanies } from "@/server/registry/entity-search-service";
import { AgentCompanyRef, defineTool, toAgentCompanyRef } from "./types";

const inputSchema = z.object({
  orgNumber: z.string().regex(/^\d{9}$/, "orgNumber must be 9 digits"),
});

export type CompanyProfileInput = z.infer<typeof inputSchema>;

export type CompanyProfileOutput = {
  profile: (AgentCompanyRef & { legalForm: string | null; website: string | null }) | null;
};

/**
 * Fetch the profile the agent needs to plan a comparison: sector (NACE), size (employees),
 * and location. Sourced from the local mirror so it covers the full register. This is the
 * bridge between resolve_company (which yields the orgNumber) and find_comparables (which
 * needs the naceCode/municipality/employeeCount to search on).
 */
export const companyProfileTool = defineTool<CompanyProfileInput, CompanyProfileOutput>({
  name: "get_company_profile",
  description:
    "Get a company's core profile by org number: name, NACE industry code, employee count, " +
    "municipality, status, legal form. Use after resolve_company to obtain the attributes needed " +
    "to search for comparables.",
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

    return {
      profile: {
        ...toAgentCompanyRef(company),
        legalForm: company.legalForm ?? null,
        website: company.website ?? null,
      },
    };
  },
});
