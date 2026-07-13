import { z } from "zod";

import { searchRegistryCompanies } from "@/server/registry/entity-search-service";
import { resolveDirectMatch } from "@/server/ai-search/query-router";
import { AgentCompanyRef, defineTool, toAgentCompanyRef } from "./types";

const inputSchema = z.object({
  nameHint: z.string().min(1, "nameHint is required"),
});

export type ResolveCompanyInput = z.infer<typeof inputSchema>;

export type ResolveCompanyOutput = {
  /** The single confident match, or null when the name is ambiguous / unknown. */
  resolved: AgentCompanyRef | null;
  /** Ranked alternatives (includes `resolved` first when present) for the agent to disambiguate. */
  candidates: AgentCompanyRef[];
  ambiguous: boolean;
};

/**
 * Turn a name mention ("Fjord Defence", "Rema 1000") or org number into a concrete company.
 * This is the entry point of almost every analytical query — the agent must anchor on a real
 * orgNumber before it can reason about competitors, owners, or franchise siblings.
 *
 * Uses the zero-LLM direct resolver first (exact name / org number), then falls back to the
 * ranked mirror candidates so the agent can ask the user or pick. Never fabricates a company.
 */
export const resolveCompanyTool = defineTool<ResolveCompanyInput, ResolveCompanyOutput>({
  name: "resolve_company",
  description:
    "Resolve a company name or organisation number to a concrete company (orgNumber, sector, " +
    "location). Returns a confident match when unambiguous, plus ranked candidates. Call this " +
    "first to anchor any analytical query on a real company.",
  inputSchema,
  parameters: {
    type: "object",
    properties: {
      nameHint: {
        type: "string",
        description: "Company name or 9-digit organisation number to resolve.",
      },
    },
    required: ["nameHint"],
    additionalProperties: false,
  },
  async execute({ nameHint }) {
    const direct = await resolveDirectMatch(nameHint);
    const candidates = await searchRegistryCompanies({ query: nameHint, size: 5 });
    const refs = candidates.map(toAgentCompanyRef);

    if (direct) {
      const resolved = toAgentCompanyRef(direct.company);
      // Surface the confident match first, then any other candidates for context.
      const rest = refs.filter((ref) => ref.orgNumber !== resolved.orgNumber);
      return { resolved, candidates: [resolved, ...rest], ambiguous: false };
    }

    return {
      resolved: null,
      candidates: refs,
      ambiguous: refs.length > 1,
    };
  },
});
