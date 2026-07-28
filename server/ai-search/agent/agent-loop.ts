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
import type { NjordToolOutputKind, RetrievalTool } from "@/server/ai-search/tools/types";
import {
  createClaimEvidenceTracker,
  type NjordClaimEvidenceResult,
} from "@/server/ai-search/evidence/claim-evidence";

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
export type AgentToolResult = {
  name: string;
  toolVersion?: `v${number}`;
  outputKind?: NjordToolOutputKind;
  dataDomains?: string[];
  output: unknown;
};

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
  usage: {
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
    model: string | null;
    sourceIds: string[];
  };
  /** Every cited statement mapped to the exact normalized source records behind it. */
  claimEvidence: NjordClaimEvidenceResult;
  stopReason: AgentStopReason;
};

const ORGNR_IN_TEXT = /\b\d{9}\b/g;
const KNOWLEDGE_CITATION_IN_TEXT = /knowledge:[A-Za-z0-9:_-]+/g;
const KNOWLEDGE_TOOL_NAMES = new Set([
  "search_norwegian_law",
  "search_accounting_guidance",
  "search_eu_eea_law",
  "search_business_policy",
  "get_rule_status",
]);
const ROUTING_TOOL_NAME = "route_njord_request";
const KNOWLEDGE_INTENTS = new Set([
  "NORWEGIAN_LAW",
  "ACCOUNTING_OR_IFRS",
  "EU_EEA_LAW",
  "BUSINESS_POLICY",
  "MIXED",
]);

function allowedToolNamesForIntent(intent: string | null, allNames: Iterable<string>) {
  if (!intent || intent === "MIXED") return new Set(allNames);
  if (intent === "GROUP_FINANCIAL_ESTIMATE") {
    return new Set(["resolve_company", "estimate_group_financials"]);
  }
  if (intent === "MNA_PRO_FORMA") {
    return new Set(["resolve_company", "build_mna_pro_forma"]);
  }
  if (intent === "NORWEGIAN_LAW") return new Set(["search_norwegian_law", "get_rule_status"]);
  if (intent === "ACCOUNTING_OR_IFRS") return new Set(["search_accounting_guidance", "get_rule_status"]);
  if (intent === "EU_EEA_LAW") return new Set(["search_eu_eea_law", "get_rule_status"]);
  if (intent === "BUSINESS_POLICY") return new Set(["search_business_policy", "get_rule_status"]);
  return new Set([...allNames].filter((name) => !KNOWLEDGE_TOOL_NAMES.has(name) && name !== ROUTING_TOOL_NAME));
}

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

function collectKnowledgeCitationIds(value: unknown, into: Set<string>): void {
  if (value == null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) collectKnowledgeCitationIds(item, into);
    return;
  }
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (key === "citationId" && typeof val === "string" && val.startsWith("knowledge:")) {
      into.add(val);
    } else {
      collectKnowledgeCitationIds(val, into);
    }
  }
}

function enforceKnowledgeGrounding(
  answer: string | null,
  toolResults: AgentToolResult[],
  knowledgeRequired: boolean,
) {
  const knowledgeResults = toolResults.filter((result) => KNOWLEDGE_TOOL_NAMES.has(result.name));
  if (knowledgeResults.length === 0) {
    return knowledgeRequired
      ? "Jeg finner ikke tilstrekkelig dekning i Njords synkroniserte, offisielle kunnskapsgrunnlag til å svare forsvarlig."
      : answer;
  }

  const allowedCitations = new Set<string>();
  for (const result of knowledgeResults) collectKnowledgeCitationIds(result.output, allowedCitations);
  if (allowedCitations.size === 0) {
    return "Jeg finner ikke tilstrekkelig dekning i Njords synkroniserte, offisielle kunnskapsgrunnlag til å svare forsvarlig.";
  }

  const cited = answer ? [...new Set(answer.match(KNOWLEDGE_CITATION_IN_TEXT) ?? [])] : [];
  if (cited.length === 0 || cited.some((citation) => !allowedCitations.has(citation))) {
    return "Njord fant relevante kilder, men kunne ikke produsere et svar med gyldige kildehenvisninger. Prøv gjerne et mer presist spørsmål.";
  }
  return answer;
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

  if (call.name === "build_mna_pro_forma") {
    const mnaInput = parsed.data as { buyerOrgNumber?: unknown; targetOrgNumber?: unknown };
    const transactionOrgNumbers = [mnaInput.buyerOrgNumber, mnaInput.targetOrgNumber]
      .filter((value): value is string => typeof value === "string");
    if (
      transactionOrgNumbers.length !== 2 ||
      transactionOrgNumbers.some((orgNumber) => !grounded.has(orgNumber))
    ) {
      return {
        invocation: {
          name: call.name,
          arguments: parsed.data,
          ok: false,
          error: "buyer and target must be resolved first",
        },
        content: JSON.stringify({
          error: "Resolve both buyer and target before building the M&A pro-forma.",
        }),
      };
    }
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
  usage: AgentResult["usage"],
  stopReason: AgentStopReason,
  claimEvidenceTracker: ReturnType<typeof createClaimEvidenceTracker>,
  knowledgeRequired = false,
): AgentResult {
  const groundedAnswer = enforceKnowledgeGrounding(answer, toolResults, knowledgeRequired);
  const citedInAnswer = groundedAnswer ? [...new Set(groundedAnswer.match(ORGNR_IN_TEXT) ?? [])] : [];
  const ungroundedOrgNumbersInAnswer = citedInAnswer.filter((org) => !grounded.has(org));
  const safeAnswer = ungroundedOrgNumbersInAnswer.length > 0
    ? "Njord kunne ikke dokumentere alle selskapene i svaret. Ingen ugrunnede selskapsopplysninger vises. Prøv et mer avgrenset spørsmål."
    : groundedAnswer;
  const claimEvidence = claimEvidenceTracker.buildResult(safeAnswer);
  const requiresClaimEvidence = !knowledgeRequired && toolResults.some(
    (result) =>
      result.outputKind === "DOCUMENTED_FACT" || result.outputKind === "CALCULATION",
  );
  const missingClaimEvidence =
    safeAnswer === groundedAnswer &&
    groundedAnswer === answer &&
    Boolean(safeAnswer?.trim()) &&
    requiresClaimEvidence &&
    claimEvidence.claims.length === 0;
  const answerWithValidCitations =
    claimEvidence.invalidCitationIds.length > 0 || missingClaimEvidence
    ? "Njord kunne ikke koble svaret til konkrete kilder. Prøv et mer avgrenset spørsmål."
    : safeAnswer;
  return {
    answer: answerWithValidCitations,
    turns,
    invocations,
    toolResults,
    groundedOrgNumbers: [...grounded],
    ungroundedOrgNumbersInAnswer,
    usage,
    claimEvidence: claimEvidenceTracker.buildResult(answerWithValidCitations),
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
  const toolDefs = params.tools.map((t) => ({
    name: t.name,
    description: t.description,
    strict: t.strict,
    parameters: t.parameters,
  }));

  const messages: LlmMessage[] = [
    { role: "system", content: params.systemPrompt },
    { role: "user", content: params.userQuery },
  ];

  const invocations: AgentToolInvocation[] = [];
  const toolResults: AgentToolResult[] = [];
  const grounded = new Set<string>();
  const usage: AgentResult["usage"] = {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    model: null,
    sourceIds: [],
  };
  const claimEvidenceTracker = createClaimEvidenceTracker();
  let toolCallCount = 0;
  let routedIntent: string | null = null;
  const hasRoutingTool = toolsByName.has(ROUTING_TOOL_NAME);

  for (let turn = 1; turn <= budget.maxTurns; turn++) {
    // Once the tool budget is spent, force a synthesis turn instead of allowing more tool calls.
    const forceAnswer = toolCallCount >= budget.maxToolCalls;
    const knowledgeRequired = routedIntent != null && KNOWLEDGE_INTENTS.has(routedIntent);
    const hasKnowledgeResult = toolResults.some((item) => KNOWLEDGE_TOOL_NAMES.has(item.name));
    const hasDataResult = toolResults.some((item) => item.name !== ROUTING_TOOL_NAME);
    const groundingSatisfied = knowledgeRequired
      ? hasKnowledgeResult
      : routedIntent === "GROUP_FINANCIAL_ESTIMATE"
        ? toolResults.some((item) => item.name === "estimate_group_financials")
        : routedIntent === "MNA_PRO_FORMA"
          ? toolResults.some((item) => item.name === "build_mna_pro_forma")
        : hasDataResult;
    const allowedNames = hasRoutingTool && routedIntent == null
      ? new Set([ROUTING_TOOL_NAME])
      : allowedToolNamesForIntent(routedIntent, toolsByName.keys());
    const activeToolDefs = toolDefs.filter((tool) => allowedNames.has(tool.name));
    const activeToolsByName = new Map(
      [...toolsByName].filter(([name]) => allowedNames.has(name)),
    );
    const result = await params.llm.run({
      messages,
      tools: activeToolDefs,
      toolChoice: forceAnswer ? "none" : groundingSatisfied ? "auto" : "required",
    });
    if (result.usage) {
      usage.inputTokens += result.usage.inputTokens;
      usage.cachedInputTokens += result.usage.cachedInputTokens ?? 0;
      usage.outputTokens += result.usage.outputTokens;
      if (result.usage.model) usage.model = result.usage.model;
      if (result.usage.sourceId) usage.sourceIds.push(result.usage.sourceId);
    }

    if (!forceAnswer && result.toolCalls.length > 0) {
      messages.push({ role: "assistant", content: result.content, toolCalls: result.toolCalls });
      for (const call of result.toolCalls) {
        const execution = await executeCall(call, activeToolsByName, grounded);
        const { invocation, output } = execution;
        let content = execution.content;
        invocations.push(invocation);
        const executedTool = activeToolsByName.get(call.name);
        if (invocation.ok && executedTool) {
          const toolResult: AgentToolResult = {
            name: call.name,
            toolVersion: executedTool.version,
            outputKind: executedTool.outputKind,
            dataDomains: executedTool.dataDomains,
            output,
          };
          toolResults.push(toolResult);
          content = claimEvidenceTracker.recordToolResult(toolResult).content;
        }
        if (
          invocation.ok
          && call.name === ROUTING_TOOL_NAME
          && output
          && typeof output === "object"
          && typeof (output as { intent?: unknown }).intent === "string"
        ) {
          routedIntent = (output as { intent: string }).intent;
        }
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
      claimEvidenceTracker,
      routedIntent != null && KNOWLEDGE_INTENTS.has(routedIntent),
    );
  }

  return finalize(
    null,
    budget.maxTurns,
    invocations,
    toolResults,
    grounded,
    usage,
    "max_turns",
    claimEvidenceTracker,
    routedIntent != null && KNOWLEDGE_INTENTS.has(routedIntent),
  );
}
