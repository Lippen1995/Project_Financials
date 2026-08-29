import { describe, expect, it } from "vitest";
import { z } from "zod";

import { defineTool, type RetrievalTool } from "@/server/ai-search/tools/types";
import { ScriptedLlmClient, type ScriptedTurn } from "@/server/ai-search/llm/scripted-client";
import {
  createRouteNjordRequestTool,
  routeNjordRequestTool,
} from "@/server/ai-search/tools/route-request";
import { runAgent } from "./agent-loop";

// Stub tools — no DB, no network. They mimic the real tools' shapes just enough for the loop.
const resolveStub = defineTool({
  name: "resolve_company",
  description: "resolve",
  inputSchema: z.object({ nameHint: z.string() }),
  parameters: { type: "object", properties: { nameHint: { type: "string" } }, required: ["nameHint"], additionalProperties: false },
  execute: async ({ nameHint }) => ({
    resolved: {
      orgNumber: nameHint === "Target" ? "999999999" : "917811288",
      name: `MATCH:${nameHint}`,
      provenance: {
        sourceSystem: "BRREG",
        sourceEntityType: "company",
        sourceId: nameHint === "Target" ? "999999999" : "917811288",
        fetchedAt: "2026-07-27T09:00:00.000Z",
        normalizedAt: "2026-07-27T09:00:01.000Z",
      },
    },
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
    results: [{
      citationId: "knowledge:law-1:chunk-1",
      title: "Offisiell kilde",
      sourceUrl: "https://lovdata.no/dokument/NL/lov/1997-06-13-44",
      provenance: {
        sourceSystem: "LOVDATA_API",
        sourceEntityType: "law-document",
        sourceId: "LOV-1997-06-13-44",
        fetchedAt: "2026-07-27T09:00:00.000Z",
        normalizedAt: "2026-07-27T09:00:01.000Z",
      },
    }],
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

const mnaProFormaStub = defineTool({
  name: "build_mna_pro_forma",
  description: "M&A pro forma",
  inputSchema: z.object({
    buyerOrgNumber: z.string(),
    targetOrgNumber: z.string(),
  }),
  parameters: {
    type: "object",
    properties: {
      buyerOrgNumber: { type: "string" },
      targetOrgNumber: { type: "string" },
    },
    required: ["buyerOrgNumber", "targetOrgNumber"],
    additionalProperties: false,
  },
  execute: async ({ buyerOrgNumber, targetOrgNumber }) => ({
    status: "COMPLETE",
    buyer: { orgNumber: buyerOrgNumber },
    target: { orgNumber: targetOrgNumber },
  }),
});

const tools = [resolveStub as RetrievalTool, profileStub as RetrievalTool];
const PROMPT = "system";

describe("runAgent", () => {
  it("runs tool calls then returns a final answer, collecting grounded org numbers", async () => {
    const llm = new ScriptedLlmClient([
      {
        toolCalls: [{ name: "resolve_company", arguments: { nameHint: "Fjord Defence" } }],
        usage: { inputTokens: 100, cachedInputTokens: 20, outputTokens: 10, model: "test-model", sourceSystem: "TEST_PROVIDER", sourceEntityType: "test.completion", sourceId: "call-1" },
      },
      {
        toolCalls: [{ name: "get_company_profile", arguments: { orgNumber: "917811288" } }],
        usage: { inputTokens: 200, cachedInputTokens: 30, outputTokens: 20, model: "test-model", sourceSystem: "TEST_PROVIDER", sourceEntityType: "test.completion", sourceId: "call-2" },
      },
      {
        content: "Top target: FJORD DEFENCE GROUP ASA (917811288) [source:1].",
        usage: { inputTokens: 300, cachedInputTokens: 40, outputTokens: 30, model: "test-model", sourceSystem: "TEST_PROVIDER", sourceEntityType: "test.completion", sourceId: "call-3" },
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
      sourceSystem: "TEST_PROVIDER",
      sourceEntityType: "test.completion",
      sourceIds: ["call-1", "call-2", "call-3"],
    });
    // First turn must have carried system + user messages to the client.
    expect(llm.received[0].messages[0]).toEqual({ role: "system", content: "system" });
  });

  it("returns claim-level evidence and gives the model the citation IDs from tool results", async () => {
    const llm = new ScriptedLlmClient([
      { toolCalls: [{ name: "resolve_company", arguments: { nameHint: "Fjord Defence" } }] },
      { content: "Selskapet har organisasjonsnummer 917811288 [source:1]." },
    ]);

    const result = await runAgent({
      llm,
      tools,
      systemPrompt: PROMPT,
      userQuery: "Hvilket organisasjonsnummer har selskapet?",
    });

    expect(llm.received[1].messages.at(-1)).toMatchObject({
      role: "tool",
      content: expect.stringContaining('"citationId":"source:1"'),
    });
    expect(result.claimEvidence).toMatchObject({
      invalidCitationIds: [],
      claims: [{
        text: "Selskapet har organisasjonsnummer 917811288.",
        citationIds: ["source:1"],
        sources: [expect.objectContaining({
          sourceSystem: "BRREG",
          sourceId: "917811288",
        })],
      }],
    });
  });

  it("does not present a sourced tool answer when no claim cites its source", async () => {
    const llm = new ScriptedLlmClient([
      { toolCalls: [{ name: "resolve_company", arguments: { nameHint: "Fjord Defence" } }] },
      { content: "Selskapet har organisasjonsnummer 917811288." },
    ]);

    const result = await runAgent({
      llm,
      tools,
      systemPrompt: PROMPT,
      userQuery: "Hvilket organisasjonsnummer har selskapet?",
    });

    expect(result.answer).toMatch(/kunne ikke koble svaret til konkrete kilder/i);
    expect(result.claimEvidence.claims).toEqual([]);
  });

  it("rejects a mixed answer when any factual line is uncited", async () => {
    const llm = new ScriptedLlmClient([
      { toolCalls: [{ name: "resolve_company", arguments: { nameHint: "Fjord Defence" } }] },
      {
        content:
          "Selskapet har organisasjonsnummer 917811288 [source:1].\n" +
          "Selskapet har 42 ansatte.",
      },
    ]);

    const result = await runAgent({
      llm,
      tools,
      systemPrompt: PROMPT,
      userQuery: "Oppsummer selskapet.",
    });

    expect(result.answer).toMatch(/kunne ikke koble svaret til konkrete kilder/i);
    expect(result.claimEvidence.claims).toEqual([]);
  });

  it("flags an org number cited in the answer that no tool returned (grounding leak)", async () => {
    const llm = new ScriptedLlmClient([
      { toolCalls: [{ name: "resolve_company", arguments: { nameHint: "x" } }] },
      { content: "Consider 917811288 and also 999999999." },
    ]);
    const result = await runAgent({ llm, tools, systemPrompt: PROMPT, userQuery: "q" });
    expect(result.groundedOrgNumbers).toContain("917811288");
    expect(result.ungroundedOrgNumbersInAnswer).toEqual(["999999999"]);
    expect(result.answer).toMatch(/kunne ikke dokumentere alle selskapene/i);
  });

  it("stops at the tool-call budget and forces a synthesis turn", async () => {
    // Three tool-call turns exhaust maxToolCalls; the 4th run is forced to synthesize.
    const script: ScriptedTurn[] = [
      ...Array.from({ length: 3 }, () => ({ toolCalls: [{ name: "resolve_company", arguments: { nameHint: "x" } }] })),
      { content: "forced answer [source:1]." },
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
    expect(result.answer).toBe("forced answer [source:1].");
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

  it("rejects a knowledge answer with an additional uncited factual line", async () => {
    const llm = new ScriptedLlmClient([
      { toolCalls: [{ name: "search_norwegian_law", arguments: { query: "aksjeloven" } }] },
      {
        content:
          "Kilden støtter svaret (knowledge:law-1:chunk-1).\n" +
          "Alle utbytter er derfor lovlige.",
      },
    ]);

    const result = await runAgent({
      llm,
      tools: [knowledgeStub as RetrievalTool],
      systemPrompt: PROMPT,
      userQuery: "Hva gjelder?",
    });

    expect(result.answer).toMatch(/kunne ikke koble svaret til konkrete kilder/i);
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

  it("requires the gated M&A builder after resolving buyer and target", async () => {
    const routedTool = createRouteNjordRequestTool({ allowMnaProForma: true });
    const llm = new ScriptedLlmClient([
      {
        toolCalls: [{
          name: "route_njord_request",
          arguments: { intent: "MNA_PRO_FORMA", reason: "Brukeren ber om proforma." },
        }],
      },
      { toolCalls: [{ name: "resolve_company", arguments: { nameHint: "Buyer" } }] },
      { toolCalls: [{ name: "resolve_company", arguments: { nameHint: "Target" } }] },
      {
        toolCalls: [{
          name: "build_mna_pro_forma",
          arguments: { buyerOrgNumber: "917811288", targetOrgNumber: "999999999" },
        }],
      },
      { content: "Ikke-revidert proforma er beregnet." },
    ]);

    const result = await runAgent({
      llm,
      tools: [
        routedTool as RetrievalTool,
        resolveStub as RetrievalTool,
        profileStub as RetrievalTool,
        mnaProFormaStub as RetrievalTool,
      ],
      systemPrompt: PROMPT,
      userQuery: "Lag proforma for Buyer og Target.",
    });

    expect(llm.received[1].tools.map((tool) => tool.name)).toEqual([
      "resolve_company",
      "build_mna_pro_forma",
    ]);
    expect(llm.received[3].toolChoice).toBe("required");
    expect(result.invocations.map((item) => item.name)).toEqual([
      "route_njord_request",
      "resolve_company",
      "resolve_company",
      "build_mna_pro_forma",
    ]);
  });

  it("rejects M&A calculation for org numbers that were not resolved first", async () => {
    const routedTool = createRouteNjordRequestTool({ allowMnaProForma: true });
    const llm = new ScriptedLlmClient([
      {
        toolCalls: [{
          name: "route_njord_request",
          arguments: { intent: "MNA_PRO_FORMA", reason: "Proforma." },
        }],
      },
      {
        toolCalls: [{
          name: "build_mna_pro_forma",
          arguments: { buyerOrgNumber: "917811288", targetOrgNumber: "999999999" },
        }],
      },
      { content: "Jeg må først slå opp begge selskapene." },
    ]);

    const result = await runAgent({
      llm,
      tools: [routedTool as RetrievalTool, resolveStub as RetrievalTool, mnaProFormaStub as RetrievalTool],
      systemPrompt: PROMPT,
      userQuery: "Lag proforma.",
      budget: { maxTurns: 3 },
    });

    expect(result.invocations[1]).toMatchObject({
      name: "build_mna_pro_forma",
      ok: false,
      error: "buyer and target must be resolved first",
    });
    expect(result.toolResults.map((item) => item.name)).not.toContain("build_mna_pro_forma");
  });
});
