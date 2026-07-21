import { describe, expect, it } from "vitest";
import { z } from "zod";

import { defineTool, type RetrievalTool } from "@/server/ai-search/tools/types";
import { ScriptedLlmClient, type ScriptedTurn } from "@/server/ai-search/llm/scripted-client";
import { routeNjordRequestTool } from "@/server/ai-search/tools/route-request";
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

const knowledgeStub = defineTool({
  name: "search_norwegian_law",
  description: "law",
  inputSchema: z.object({ query: z.string() }),
  parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"], additionalProperties: false },
  execute: async () => ({
    coverage: { resultCount: 1, sufficient: true },
    results: [{ citationId: "knowledge:law-1:chunk-1", title: "Offisiell kilde" }],
  }),
});

const groupEstimateStub = defineTool({
  name: "estimate_group_financials",
  description: "group estimate",
  inputSchema: z.object({ parentOrgNumber: z.string(), years: z.number() }),
  parameters: {
    type: "object",
    properties: { parentOrgNumber: { type: "string" }, years: { type: "integer" } },
    required: ["parentOrgNumber", "years"],
    additionalProperties: false,
  },
  execute: async ({ parentOrgNumber, years }) => ({
    parent: { orgNumber: parentOrgNumber },
    requestedYears: years,
    answerStatus: "INSUFFICIENT_DATA",
  }),
});

const tools = [resolveStub as RetrievalTool, profileStub as RetrievalTool];
const PROMPT = "system";

describe("runAgent", () => {
  it("runs tool calls then returns a final answer, collecting grounded org numbers", async () => {
    const llm = new ScriptedLlmClient([
      {
        toolCalls: [{ name: "resolve_company", arguments: { nameHint: "Fjord Defence" } }],
        usage: { inputTokens: 100, cachedInputTokens: 20, outputTokens: 10, model: "test-model", sourceId: "call-1" },
      },
      {
        toolCalls: [{ name: "get_company_profile", arguments: { orgNumber: "917811288" } }],
        usage: { inputTokens: 200, cachedInputTokens: 30, outputTokens: 20, model: "test-model", sourceId: "call-2" },
      },
      {
        content: "Top target: FJORD DEFENCE GROUP ASA (917811288).",
        usage: { inputTokens: 300, cachedInputTokens: 40, outputTokens: 30, model: "test-model", sourceId: "call-3" },
      },
    ]);

    const result = await runAgent({ llm, tools, systemPrompt: PROMPT, userQuery: "targets for Fjord Defence" });

    expect(result.stopReason).toBe("final");
    expect(result.answer).toContain("917811288");
    expect(result.invocations.map((i) => i.name)).toEqual(["resolve_company", "get_company_profile"]);
    expect(result.invocations.every((i) => i.ok)).toBe(true);
    expect(result.groundedOrgNumbers).toContain("917811288");
    expect(result.ungroundedOrgNumbersInAnswer).toEqual([]);
    expect(result.usage).toEqual({
      inputTokens: 600,
      cachedInputTokens: 90,
      outputTokens: 60,
      model: "test-model",
      sourceIds: ["call-1", "call-2", "call-3"],
    });
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

  it("rejects a knowledge answer that omits the tool-provided citation", async () => {
    const llm = new ScriptedLlmClient([
      { toolCalls: [{ name: "search_norwegian_law", arguments: { query: "aksjeloven" } }] },
      { content: "Dette gjelder etter aksjeloven." },
    ]);

    const result = await runAgent({
      llm,
      tools: [knowledgeStub as RetrievalTool],
      systemPrompt: PROMPT,
      userQuery: "Hva gjelder?",
    });

    expect(result.answer).toMatch(/kunne ikke produsere et svar med gyldige kildehenvisninger/i);
    expect(llm.received[0].toolChoice).toBe("required");
  });

  it("allows a knowledge answer citing an exact citationId from the tool result", async () => {
    const llm = new ScriptedLlmClient([
      { toolCalls: [{ name: "search_norwegian_law", arguments: { query: "aksjeloven" } }] },
      { content: "Kilden støtter svaret (knowledge:law-1:chunk-1)." },
    ]);

    const result = await runAgent({
      llm,
      tools: [knowledgeStub as RetrievalTool],
      systemPrompt: PROMPT,
      userQuery: "Hva gjelder?",
    });

    expect(result.answer).toBe("Kilden støtter svaret (knowledge:law-1:chunk-1).");
  });

  it("uses LLM routing to restrict a legal request to knowledge tools", async () => {
    const llm = new ScriptedLlmClient([
      {
        toolCalls: [{
          name: "route_njord_request",
          arguments: { intent: "NORWEGIAN_LAW", reason: "Spørsmålet gjelder lov." },
        }],
      },
      { toolCalls: [{ name: "search_norwegian_law", arguments: { query: "aksjeloven" } }] },
      { content: "Kilden støtter svaret (knowledge:law-1:chunk-1)." },
    ]);

    const result = await runAgent({
      llm,
      tools: [
        routeNjordRequestTool as RetrievalTool,
        knowledgeStub as RetrievalTool,
        profileStub as RetrievalTool,
      ],
      systemPrompt: PROMPT,
      userQuery: "Hva sier aksjeloven?",
    });

    expect(llm.received[0].tools.map((tool) => tool.name)).toEqual(["route_njord_request"]);
    expect(llm.received[1].tools.map((tool) => tool.name)).toEqual(["search_norwegian_law"]);
    expect(llm.received[1].toolChoice).toBe("required");
    expect(result.answer).toContain("knowledge:law-1:chunk-1");
  });

  it("requires the group estimator after company resolution for a group-financial request", async () => {
    const llm = new ScriptedLlmClient([
      {
        toolCalls: [{
          name: "route_njord_request",
          arguments: {
            intent: "GROUP_FINANCIAL_ESTIMATE",
            reason: "SpÃ¸rsmÃ¥let ber om femÃ¥rs konsernestimat.",
          },
        }],
      },
      { toolCalls: [{ name: "resolve_company", arguments: { nameHint: "SLG NORGE AS" } }] },
      {
        toolCalls: [{
          name: "estimate_group_financials",
          arguments: { parentOrgNumber: "917811288", years: 5 },
        }],
      },
      { content: "Datadekningen er utilstrekkelig for en konserntotal." },
    ]);

    const result = await runAgent({
      llm,
      tools: [
        routeNjordRequestTool as RetrievalTool,
        resolveStub as RetrievalTool,
        profileStub as RetrievalTool,
        groupEstimateStub as RetrievalTool,
      ],
      systemPrompt: PROMPT,
      userQuery: "Beregn konsernets EBITDA, EBIT og Ã¥rsresultat.",
    });

    expect(llm.received[1].tools.map((tool) => tool.name)).toEqual([
      "resolve_company",
      "estimate_group_financials",
    ]);
    expect(llm.received[2].toolChoice).toBe("required");
    expect(result.invocations.map((item) => item.name)).toEqual([
      "route_njord_request",
      "resolve_company",
      "estimate_group_financials",
    ]);
  });
});
