import { z } from "zod";
import { describe, expect, it } from "vitest";

import { HeuristicLlmClient } from "@/server/ai-search/llm/heuristic-client";
import { defineTool, type RetrievalTool } from "@/server/ai-search/tools/types";
import { runAgent } from "./agent-loop";

describe("Njord franchise analysis flow", () => {
  it("routes a franchise profitability question directly to grounded chain financials", async () => {
    const tool = defineTool({
      name: "get_chain_financials",
      description: "Get chain financials.",
      inputSchema: z.object({ chainQuery: z.string() }),
      parameters: {
        type: "object",
        properties: { chainQuery: { type: "string" } },
        required: ["chainQuery"],
        additionalProperties: false,
      },
      execute: async () => ({
        chain: {
          slug: "rema-1000",
          name: "REMA 1000",
          storeCount: 2,
          operatorCount: 2,
          confidence: 0.98,
          builtAt: "2026-07-20T08:00:00.000Z",
          provenance: {
            sourceSystem: "BRREG",
            sourceEntityType: "derivedRetailChain",
            sourceId: "rema-1000",
            fetchedAt: "2026-07-20T08:00:00.000Z",
            normalizedAt: "2026-07-20T08:00:00.000Z",
          },
        },
        operators: [],
        coverage: { operatorCount: 2, withLatestFinancials: 1, plottableCount: 1 },
      }),
    });

    const result = await runAgent({
      llm: new HeuristicLlmClient(),
      tools: [tool as RetrievalTool],
      systemPrompt: "Use grounded tools.",
      userQuery: "Sammenlign lønnsomheten til REMA1000-franchisene",
    });

    expect(result.invocations).toEqual([
      expect.objectContaining({
        name: "get_chain_financials",
        arguments: { chainQuery: "Sammenlign lønnsomheten til REMA1000-franchisene" },
        ok: true,
      }),
    ]);
    expect(result.answer).toContain("REMA 1000");
    expect(result.answer).toContain("1 av 2");
  });
});
