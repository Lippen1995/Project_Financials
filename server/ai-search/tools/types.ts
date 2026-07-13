import { z } from "zod";

import type { NormalizedCompany } from "@/lib/types";

/**
 * Compact company reference the retrieval tools hand back to the agent. Deliberately small:
 * every field the model reasons over must trace to a real row, and keeping the shape tight
 * keeps tool-result tokens (replayed every agent turn) cheap. orgNumber is the join key the
 * agent must cite — the final-answer guard drops any company not present in a tool result.
 */
export type AgentCompanyRef = {
  orgNumber: string;
  name: string;
  naceCode: string | null;
  naceDescription: string | null;
  municipality: string | null;
  employeeCount: number | null;
  status: "ACTIVE" | "DISSOLVED" | "BANKRUPT";
};

export function toAgentCompanyRef(company: NormalizedCompany): AgentCompanyRef {
  return {
    orgNumber: company.orgNumber,
    name: company.name,
    naceCode: company.industryCode?.code ?? null,
    naceDescription: company.industryCode?.description ?? company.industryCode?.title ?? null,
    municipality: company.municipality ?? null,
    employeeCount: company.employeeCount ?? null,
    status: company.status,
  };
}

/**
 * A deterministic retrieval tool the agent may call. `inputSchema` validates arguments at
 * runtime (the model's tool arguments are untrusted); `parameters` is the JSON Schema handed
 * to the LLM's function-calling API. They are kept in lockstep by hand rather than pulling in
 * a zod→JSON-schema dependency — the tool surface is small and rarely changes.
 */
export type RetrievalTool<TInput = unknown, TOutput = unknown> = {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  parameters: Record<string, unknown>;
  execute: (input: TInput) => Promise<TOutput>;
};

/** Narrow helper so `execute` receives validated input and callers get a typed result. */
export function defineTool<TInput, TOutput>(
  tool: RetrievalTool<TInput, TOutput>,
): RetrievalTool<TInput, TOutput> {
  return tool;
}
