import { describe, expect, it } from "vitest";
import { z } from "zod";

import { defineTool, type RetrievalTool } from "@/server/ai-search/tools/types";
import { ScriptedLlmClient, type ScriptedTurn } from "@/server/ai-search/llm/scripted-client";
import { runAgent } from "./agent-loop";

// Stub tools — no DB, no network. They mimic the real tools' shapes just enough for the loop.
const resolveStub = defineTool({
  name: "resolve_company",
  description: "resolve",
  inputSchema: z.object({ nameHint: z.string() }),
  parameters: { type: "object", properties: { nameHint: { type: "string" } }, required: ["nameHint"], additionalProperties: false },
  execute: async ({ nameHint }) => ({
    resolved: { orgNumber: "917811288", name: `MATCH:${nameHint}` },
  }),
});

const profileStub = defineTool({
  name: "get_company_profile",
  description: "profile",
  inputSchema: z.object({ orgNumber: z.string().regex(/^\d{9}$/) }),
  parameters: { type: "object", properties: { orgNumber: { type: "string" } }, required: ["orgNumber"], additionalProperties: false },
  execute: async ({ orgNumber }) => ({ profile: { orgNumber, name: "ACME", businessSummary: "does things" } }),
});

const tools = [resolveStub as RetrievalTool, profileStub as RetrievalTool];
const PROMPT = "system";

describe("runAgent", () => {
  it("runs tool calls then returns a final answer, collecting grounded org numbers", async () => {
    const llm = new ScriptedLlmClient([
      { toolCalls: [{ name: "resolve_company", arguments: { nameHint: "Fjord Defence" } }] },
      { toolCalls: [{ name: "get_company_profile", arguments: { orgNumber: "917811288" } }] },
      { content: "Top target: FJORD DEFENCE GROUP ASA (917811288)." },
    ]);

    const result = await runAgent({ llm, tools, systemPrompt: PROMPT, userQuery: "targets for Fjord Defence" });

    expect(result.stopReason).toBe("final");
    expect(result.answer).toContain("917811288");
    expect(result.invocations.map((i) => i.name)).toEqual(["resolve_company", "get_company_profile"]);
    expect(result.invocations.every((i) => i.ok)).toBe(true);
    expect(result.groundedOrgNumbers).toContain("917811288");
    expect(result.ungroundedOrgNumbersInAnswer).toEqual([]);
    // First turn must have carried system + user messages to the client.
    expect(llm.received[0].messages[0]).toEqual({ role: "system", content: "system" });
  });

  it("flags an org number cited in the answer that no tool returned (grounding leak)", async () => {
    const llm = new ScriptedLlmClient([
      { toolCalls: [{ name: "resolve_company", arguments: { nameHint: "x" } }] },
      { content: "Consider 917811288 and also 999999999." },
    ]);
    const result = await runAgent({ llm, tools, systemPrompt: PROMPT, userQuery: "q" });
    expect(result.groundedOrgNumbers).toContain("917811288");
    expect(result.ungroundedOrgNumbersInAnswer).toEqual(["999999999"]);
  });

  it("stops at the tool-call budget and forces a synthesis turn", async () => {
    // Three tool-call turns exhaust maxToolCalls; the 4th run is forced to synthesize.
    const script: ScriptedTurn[] = [
      ...Array.from({ length: 3 }, () => ({ toolCalls: [{ name: "resolve_company", arguments: { nameHint: "x" } }] })),
      { content: "forced answer" },
    ];
    const alwaysCallsTool = new ScriptedLlmClient(script);
    const result = await runAgent({
      llm: alwaysCallsTool,
      tools,
      systemPrompt: PROMPT,
      userQuery: "q",
      budget: { maxTurns: 8, maxToolCalls: 3 },
    });
    expect(result.stopReason).toBe("max_tool_calls");
    expect(result.invocations).toHaveLength(3);
    expect(result.answer).toBe("forced answer");
  });

  it("handles invalid tool arguments without throwing, and keeps going", async () => {
    const llm = new ScriptedLlmClient([
      { toolCalls: [{ name: "get_company_profile", arguments: { orgNumber: "not-9-digits" } }] },
      { content: "done" },
    ]);
    const result = await runAgent({ llm, tools, systemPrompt: PROMPT, userQuery: "q" });
    expect(result.invocations[0].ok).toBe(false);
    expect(result.invocations[0].error).toBe("schema validation failed");
    expect(result.answer).toBe("done");
  });

  it("handles an unknown tool name gracefully", async () => {
    const llm = new ScriptedLlmClient([
      { toolCalls: [{ name: "no_such_tool", arguments: {} }] },
      { content: "done" },
    ]);
    const result = await runAgent({ llm, tools, systemPrompt: PROMPT, userQuery: "q" });
    expect(result.invocations[0]).toMatchObject({ name: "no_such_tool", ok: false, error: "unknown tool" });
    expect(result.answer).toBe("done");
  });
});
