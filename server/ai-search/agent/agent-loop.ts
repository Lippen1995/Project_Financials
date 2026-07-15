/**
 * The provider-agnostic agent loop (Step 3). It orchestrates tool-calling turns against ANY
 * LlmClient — it imports no concrete provider, so nothing here can incur API cost. Drive it with
 * the ScriptedLlmClient (zero cost) now; swap in a real adapter later behind config.
 *
 * Responsibilities: run turns, dispatch + validate tool calls, feed results back, enforce a budget,
 * and track grounding (which org numbers came from tool results) so the caller can verify the final
 * answer never cites a company the tools did not return.
 */
import type { LlmClient, LlmMessage } from "@/server/ai-search/llm/types";
import type { RetrievalTool } from "@/server/ai-search/tools/types";

export type AgentBudget = { maxTurns: number; maxToolCalls: number };
export const DEFAULT_BUDGET: AgentBudget = { maxTurns: 8, maxToolCalls: 16 };

export type AgentToolInvocation = {
  name: string;
  arguments: unknown;
  ok: boolean;
  error?: string;
};

export type AgentStopReason = "final" | "max_turns" | "max_tool_calls";

/** A tool's parsed output, kept so callers can drive UI (e.g. the result table) off what the agent found. */
export type AgentToolResult = { name: string; output: unknown };

export type AgentResult = {
  answer: string | null;
  turns: number;
  invocations: AgentToolInvocation[];
  /** Parsed outputs of every successful tool call, in call order. */
  toolResults: AgentToolResult[];
  /** Org numbers observed in tool results — the set the final answer is allowed to cite. */
  groundedOrgNumbers: string[];
  /** 9-digit org numbers cited in the answer that were NOT in any tool result (a grounding leak). */
  ungroundedOrgNumbersInAnswer: string[];
  usage: { inputTokens: number; outputTokens: number };
  stopReason: AgentStopReason;
};

const ORGNR_IN_TEXT = /\b\d{9}\b/g;

/** Recursively collect values under any `orgNumber` key, so grounding is shape-agnostic. */
function collectOrgNumbers(value: unknown, into: Set<string>): void {
  if (value == null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) collectOrgNumbers(item, into);
    return;
  }
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (key === "orgNumber" && typeof val === "string" && /^\d{9}$/.test(val)) {
      into.add(val);
    } else {
      collectOrgNumbers(val, into);
    }
  }
}

async function executeCall(
  call: { id: string; name: string; arguments: string },
  toolsByName: Map<string, RetrievalTool>,
  grounded: Set<string>,
): Promise<{ invocation: AgentToolInvocation; content: string; output?: unknown }> {
  const tool = toolsByName.get(call.name);
  if (!tool) {
    return {
      invocation: { name: call.name, arguments: undefined, ok: false, error: "unknown tool" },
      content: JSON.stringify({ error: `Unknown tool: ${call.name}` }),
    };
  }

  let rawArgs: unknown;
  try {
    rawArgs = call.arguments ? JSON.parse(call.arguments) : {};
  } catch {
    return {
      invocation: { name: call.name, arguments: call.arguments, ok: false, error: "invalid JSON arguments" },
      content: JSON.stringify({ error: "Arguments were not valid JSON." }),
    };
  }

  const parsed = tool.inputSchema.safeParse(rawArgs);
  if (!parsed.success) {
    return {
      invocation: { name: call.name, arguments: rawArgs, ok: false, error: "schema validation failed" },
      content: JSON.stringify({ error: "Invalid arguments.", issues: parsed.error.issues.map((i) => i.message) }),
    };
  }

  try {
    const output = await tool.execute(parsed.data);
    collectOrgNumbers(output, grounded);
    return {
      invocation: { name: call.name, arguments: parsed.data, ok: true },
      content: JSON.stringify(output),
      output,
    };
  } catch (error) {
    return {
      invocation: {
        name: call.name,
        arguments: parsed.data,
        ok: false,
        error: error instanceof Error ? error.message : "tool error",
      },
      content: JSON.stringify({ error: "Tool execution failed." }),
    };
  }
}

function finalize(
  answer: string | null,
  turns: number,
  invocations: AgentToolInvocation[],
  toolResults: AgentToolResult[],
  grounded: Set<string>,
  usage: { inputTokens: number; outputTokens: number },
  stopReason: AgentStopReason,
): AgentResult {
  const citedInAnswer = answer ? [...new Set(answer.match(ORGNR_IN_TEXT) ?? [])] : [];
  return {
    answer,
    turns,
    invocations,
    toolResults,
    groundedOrgNumbers: [...grounded],
    ungroundedOrgNumbersInAnswer: citedInAnswer.filter((org) => !grounded.has(org)),
    usage,
    stopReason,
  };
}

export async function runAgent(params: {
  llm: LlmClient;
  tools: RetrievalTool[];
  systemPrompt: string;
  userQuery: string;
  budget?: Partial<AgentBudget>;
}): Promise<AgentResult> {
  const budget = { ...DEFAULT_BUDGET, ...(params.budget ?? {}) };
  const toolsByName = new Map(params.tools.map((tool) => [tool.name, tool]));
  const toolDefs = params.tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters }));

  const messages: LlmMessage[] = [
    { role: "system", content: params.systemPrompt },
    { role: "user", content: params.userQuery },
  ];

  const invocations: AgentToolInvocation[] = [];
  const toolResults: AgentToolResult[] = [];
  const grounded = new Set<string>();
  const usage = { inputTokens: 0, outputTokens: 0 };
  let toolCallCount = 0;

  for (let turn = 1; turn <= budget.maxTurns; turn++) {
    // Once the tool budget is spent, force a synthesis turn instead of allowing more tool calls.
    const forceAnswer = toolCallCount >= budget.maxToolCalls;
    const result = await params.llm.run({
      messages,
      tools: toolDefs,
      toolChoice: forceAnswer ? "none" : "auto",
    });
    if (result.usage) {
      usage.inputTokens += result.usage.inputTokens;
      usage.outputTokens += result.usage.outputTokens;
    }

    if (!forceAnswer && result.toolCalls.length > 0) {
      messages.push({ role: "assistant", content: result.content, toolCalls: result.toolCalls });
      for (const call of result.toolCalls) {
        const { invocation, content, output } = await executeCall(call, toolsByName, grounded);
        invocations.push(invocation);
        if (invocation.ok) toolResults.push({ name: call.name, output });
        messages.push({ role: "tool", toolCallId: call.id, content });
        toolCallCount++;
      }
      continue;
    }

    return finalize(
      result.content ?? null,
      turn,
      invocations,
      toolResults,
      grounded,
      usage,
      forceAnswer ? "max_tool_calls" : "final",
    );
  }

  return finalize(null, budget.maxTurns, invocations, toolResults, grounded, usage, "max_turns");
}
