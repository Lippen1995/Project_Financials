import { z } from "zod";

import { norwegianOrganizationNumberSchema } from "@/lib/norwegian-organization-number";
import { searchRegistryCompanies } from "@/server/registry/entity-search-service";
import { AgentCompanyProfile, defineTool, toAgentCompanyRef } from "./types";
import { buildProfileEnrichment } from "./enrich";

const inputSchema = z.object({
  orgNumber: norwegianOrganizationNumberSchema,
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
    "Get a company's full dossier by org number: name, NACE industry code, employees, municipality, " +
    "status, legal form; the last few years of headline financials (revenue, operating profit, net " +
    "income, equity); an ownership summary (controlling owner, whether it sits inside a larger group, " +
    "subsidiary count) for judging acquirability; a qualitative description of what the company does " +
    "and its value-chain position; its financial-DISTRESS state; and its most material recent EVENTS " +
    "(deals, contracts, restructuring) that signal whether it is available or risky; plus DEAL " +
    "FEASIBILITY inputs — whether the sector is security-critical (an ownership change would likely be " +
    "screened under Norwegian security/FDI law), how much of it is already foreign-owned and from which " +
    "countries, and whether it is a listed ASA (public-bid mechanics). IMPORTANT: when `signalsTracked` " +
    "is false, financials/events/distress are NOT tracked for this company — treat their absence as " +
    "UNKNOWN, never as 'none'. `clearanceStatus` is ALWAYS null: security-clearance data does not exist " +
    "in our sources, so clearance eligibility is an open question you must flag, never assume. Use after " +
    "resolve_company to gather what you need to reason about strategic fit, acquirability, risk and feasibility.",
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
      naceCode: base.naceCode,
      naceDescription: base.naceDescription,
      legalForm: company.legalForm ?? null,
    });

    return {
      profile: {
        ...base,
        legalForm: company.legalForm ?? null,
        latestFinancials: enrichment.financials[0] ?? null,
        financials: enrichment.financials,
        ownership: enrichment.ownership,
        qualitative: enrichment.qualitative,
        distress: enrichment.distress,
        events: enrichment.events,
        signalsTracked: enrichment.signalsTracked,
        feasibility: enrichment.feasibility,
      },
    };
  },
});
