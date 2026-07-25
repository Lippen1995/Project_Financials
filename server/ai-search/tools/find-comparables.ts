import { z } from "zod";

import { norwegianOrganizationNumberSchema } from "@/lib/norwegian-organization-number";
import { searchRegistryCompanies } from "@/server/registry/entity-search-service";
import { AgentCompanyRef, defineTool, toAgentCompanyRef } from "./types";
import { getLatestFinancialsByOrgNumbers } from "./enrich";

const inputSchema = z.object({
  naceCode: z.string().min(2, "naceCode is required"),
  municipality: z.string().optional(),
  employeeCount: z.number().int().nonnegative().optional(),
  excludeOrgNumbers: z.array(norwegianOrganizationNumberSchema).max(100).optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

export type FindComparablesInput = z.infer<typeof inputSchema>;

export type ScoredCompany = AgentCompanyRef & { score: number; reasons: string[] };

export type FindComparablesOutput = {
  comparables: ScoredCompany[];
};

export type ComparableCriteria = {
  naceCode: string;
  municipality?: string;
  employeeCount?: number;
};

/**
 * Pure similarity score for one candidate against the subject's profile. Kept side-effect-free
 * so it is unit-testable without a database. The mirror query already narrows to the NACE
 * prefix (and optionally municipality/active), so this differentiates *within* that shortlist:
 * exact-code and size proximity are what separate a real competitor from a mere sector-mate.
 */
export function scoreComparable(
  candidate: AgentCompanyRef,
  criteria: ComparableCriteria,
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  if (candidate.naceCode) {
    if (candidate.naceCode === criteria.naceCode) {
      score += 45;
      reasons.push("samme næringskode");
    } else if (candidate.naceCode.slice(0, 2) === criteria.naceCode.slice(0, 2)) {
      score += 25;
      reasons.push("samme bransjegruppe");
    } else {
      score += 10;
    }
  }

  if (
    criteria.municipality &&
    candidate.municipality &&
    candidate.municipality.toLowerCase() === criteria.municipality.toLowerCase()
  ) {
    score += 20;
    reasons.push("samme kommune");
  }

  if (criteria.employeeCount != null && candidate.employeeCount != null) {
    const a = criteria.employeeCount;
    const b = candidate.employeeCount;
    const ratio = a === 0 && b === 0 ? 1 : Math.min(a, b) / Math.max(a, b, 1);
    score += Math.round(ratio * 25);
    if (ratio >= 0.5) {
      reasons.push("sammenlignbar størrelse");
    }
  }

  if (candidate.status === "ACTIVE") {
    score += 10;
  }

  return { score, reasons };
}

/**
 * Find companies comparable to a subject — the competitors path, and the candidate generator
 * for acquisition targets. Retrieval comes from the local mirror (NACE prefix + optional
 * municipality, active only), then deterministic scoring ranks the shortlist. The subject and
 * any explicitly excluded orgNumbers (e.g. its parent/subsidiaries) are dropped.
 */
export const findComparablesTool = defineTool<FindComparablesInput, FindComparablesOutput>({
  name: "find_comparables",
  description:
    "Find active companies comparable to a subject by industry (NACE code), optionally narrowed " +
    "by municipality and ranked by size proximity. Use for competitors and as the candidate pool " +
    "for acquisition targets. Pass the subject's own orgNumber (and known parent/subsidiaries) in " +
    "excludeOrgNumbers so they are not returned.",
  inputSchema,
  parameters: {
    type: "object",
    properties: {
      naceCode: { type: "string", description: "NACE industry code to match (prefix, e.g. '47.71')." },
      municipality: { type: "string", description: "Optional municipality to restrict to." },
      employeeCount: {
        type: "number",
        description: "Subject's employee count, used to rank candidates by size proximity.",
      },
      excludeOrgNumbers: {
        type: "array",
        items: { type: "string" },
        description: "Org numbers to exclude (the subject itself, its parent/subsidiaries).",
      },
      limit: { type: "number", description: "Max results to return (default 15)." },
    },
    required: ["naceCode"],
    additionalProperties: false,
  },
  async execute({ naceCode, municipality, employeeCount, excludeOrgNumbers, limit }) {
    const exclude = new Set(excludeOrgNumbers ?? []);
    const take = limit ?? 15;

    // Pull a generous shortlist from the mirror, then score/trim — so exclusions and size
    // ranking do not starve the result below `take`. NOTE: the mirror returns rows
    // name-ordered, so for large sectors this scores an alphabetical slice, not the whole
    // sector; a follow-up should pre-rank by size/geo in SQL. Pull a full pool meanwhile.
    const rows = await searchRegistryCompanies({
      industryCode: naceCode,
      municipality,
      status: "ACTIVE",
      size: Math.max(60, Math.min(100, take * 6)),
    });

    const criteria: ComparableCriteria = { naceCode, municipality, employeeCount };
    const candidates = rows
      .map(toAgentCompanyRef)
      .filter((ref) => !exclude.has(ref.orgNumber));

    // Batch-join the latest headline accounts so ranked rows carry size/health for the agent
    // (and, when the subject's employee count is unknown, so revenue can stand in for size).
    const financialsByOrg = await getLatestFinancialsByOrgNumbers(
      candidates.map((ref) => ref.orgNumber),
    );

    const comparables = candidates
      .map((ref) => {
        const latestFinancials = financialsByOrg.get(ref.orgNumber) ?? null;
        const { score, reasons } = scoreComparable(ref, criteria);
        return { ...ref, latestFinancials, score, reasons };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, take);

    return { comparables };
  },
});
