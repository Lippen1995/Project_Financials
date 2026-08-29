/**
 * A deterministic, rule-based LlmClient that stands in for a real model at ZERO API cost. It reads
 * the conversation (including prior tool results) and drives the standard analytical flow —
 * resolve → profile → find_by_business → synthesize — then templates a grounded answer from the
 * tool outputs. It is NOT reasoning; it is a fixed pipeline so the whole UI works end-to-end before
 * any paid adapter is wired in. Swap this for a real adapter (behind config) to get true reasoning.
 */
import type { LlmClient, LlmMessage, LlmRunOptions, LlmRunResult, LlmToolCall } from "./types";

let idCounter = 0;
function toolCall(name: string, args: Record<string, unknown>): LlmToolCall {
  idCounter += 1;
  return { id: `heur_${idCounter}`, name, arguments: JSON.stringify(args) };
}

function firstUserQuery(messages: LlmMessage[]): string {
  const m = messages.find((x) => x.role === "user");
  return m && "content" in m && typeof m.content === "string" ? m.content : "";
}

function calledTools(messages: LlmMessage[]): Set<string> {
  const called = new Set<string>();
  for (const m of messages) {
    if (m.role === "assistant" && m.toolCalls) for (const tc of m.toolCalls) called.add(tc.name);
  }
  return called;
}

function zeroUsage() {
  return {
    inputTokens: 0,
    outputTokens: 0,
    sourceSystem: "LOCAL",
    sourceEntityType: "heuristic.completion",
  };
}

/** Parse the result of the most recent call to `toolName` from the tool messages. */
function resultOf(messages: LlmMessage[], toolName: string): any | null {
  let callId: string | null = null;
  for (const m of messages) {
    if (m.role === "assistant" && m.toolCalls) {
      for (const tc of m.toolCalls) if (tc.name === toolName) callId = tc.id;
    }
  }
  if (!callId) return null;
  const toolMsg = messages.find((m) => m.role === "tool" && m.toolCallId === callId);
  if (!toolMsg || toolMsg.role !== "tool") return null;
  try {
    const parsed = JSON.parse(toolMsg.content);
    return parsed && typeof parsed === "object" && "data" in parsed ? parsed.data : parsed;
  } catch {
    return null;
  }
}

function citationSuffix(messages: LlmMessage[], toolName: string): string {
  let callId: string | null = null;
  for (const message of messages) {
    if (message.role !== "assistant" || !message.toolCalls) continue;
    for (const call of message.toolCalls) if (call.name === toolName) callId = call.id;
  }
  if (!callId) return "";
  const toolMessage = messages.find(
    (message) => message.role === "tool" && message.toolCallId === callId,
  );
  if (!toolMessage || toolMessage.role !== "tool") return "";
  try {
    const parsed = JSON.parse(toolMessage.content) as {
      citationSources?: Array<{ citationId?: unknown }>;
    };
    const citationIds = (parsed.citationSources ?? []).flatMap((source) =>
      typeof source.citationId === "string" ? [source.citationId] : [],
    );
    return citationIds.length > 0
      ? ` ${citationIds.map((citationId) => `[${citationId}]`).join(" ")}`
      : "";
  } catch {
    return "";
  }
}

/** Pull the likely subject company name out of an analytical query ("... for Fjord Defence"). */
function extractCompanyName(query: string): string {
  const m = query.match(/\b(?:for|av|til|of|to)\s+(.+)$/i);
  return (m ? m[1] : query).replace(/[?.!]+$/, "").trim();
}

const CHAIN_ANALYSIS = /\b(franchise\w*|kjede\w*|chain\w*|butikk\w*|utsalg\w*|operatør\w*)\b/i;
const EXPLICIT_PLOT = /\b(plott|plot|tegn|visualiser|visualize|scatter|spredningsdiagram)\b|[xy][ -]?aks/i;

export class HeuristicLlmClient implements LlmClient {
  readonly model = "rule-based-no-cost";

  async run(options: LlmRunOptions): Promise<LlmRunResult> {
    const { messages } = options;
    const query = firstUserQuery(messages);
    const called = calledTools(messages);

    // Budget-forced synthesis, or all steps done → produce the final answer.
    if (options.toolChoice === "none") return this.finalAnswer(messages);

    if (CHAIN_ANALYSIS.test(query)) {
      if (!called.has("get_chain_financials")) {
        return this.wantsTool(toolCall("get_chain_financials", { chainQuery: query }));
      }
      return this.finalAnswer(messages);
    }

    if (!called.has("resolve_company")) {
      return this.wantsTool(toolCall("resolve_company", { nameHint: extractCompanyName(query) }));
    }

    const resolved = resultOf(messages, "resolve_company");
    const subjectOrg: string | null =
      resolved?.resolved?.orgNumber ?? resolved?.candidates?.[0]?.orgNumber ?? null;

    if (subjectOrg && !called.has("get_company_profile")) {
      return this.wantsTool(toolCall("get_company_profile", { orgNumber: subjectOrg }));
    }

    if (!called.has("find_by_business")) {
      return this.wantsTool(toolCall("find_by_business", { query, limit: 8 }));
    }

    return this.finalAnswer(messages);
  }

  private wantsTool(call: LlmToolCall): LlmRunResult {
    return { content: null, toolCalls: [call], usage: zeroUsage() };
  }

  private finalAnswer(messages: LlmMessage[]): LlmRunResult {
    const query = firstUserQuery(messages);
    const chainResult = resultOf(messages, "get_chain_financials");
    if (chainResult) {
      const sourceCitations = citationSuffix(messages, "get_chain_financials");
      const chain = chainResult.chain;
      if (!chain) {
        return {
          content: "Jeg fant ingen utledet kjede som matcher spørsmålet i dagens Brønnøysund-grunnlag.",
          toolCalls: [],
          usage: zeroUsage(),
        };
      }

      const coverage = chainResult.coverage ?? {};
      const plotted = coverage.plottableCount ?? 0;
      const withLatestFinancials = coverage.withLatestFinancials ?? 0;
      const operators = coverage.operatorCount ?? 0;
      const action = plotted === 0
        ? "Jeg kan ikke plotte den forespurte grafen fordi ingen operatørselskaper har tilstrekkelige, sammenlignbare regnskapstall."
        : EXPLICIT_PLOT.test(query)
        ? "Jeg har klargjort den forespurte grafen."
        : "Jeg foreslår å plotte nettomargin mot omsetning for å sammenligne både lønnsomhet og størrelse.";
      return {
        content: [
          `${chain.name}: ${chain.storeCount} utsalgssteder er utledet som koblet til ${operators} operatørselskaper.${sourceCitations}`,
          `${action}${sourceCitations}`,
          `${withLatestFinancials} av ${operators} har siste regnskap. ${plotted} har sammenlignbare NOK-verdier for standardgrafen; manglende verdier er utelatt, ikke satt til null.${sourceCitations}`,
          `Operatørtilhørigheten er utledet fra Brønnøysundregistrenes underenhetsnavn og er ikke et offisielt franchisefelt.${sourceCitations}`,
        ].join("\n\n"),
        toolCalls: [],
        usage: zeroUsage(),
      };
    }

    const profile = resultOf(messages, "get_company_profile")?.profile ?? null;
    const matches: Array<{ orgNumber: string; companyName: string | null; businessSummary: string | null }> =
      resultOf(messages, "find_by_business")?.matches ?? [];
    const subjectOrg: string | null = profile?.orgNumber ?? null;

    const candidates = matches.filter((m) => m.orgNumber !== subjectOrg).slice(0, 5);

    const lines: string[] = [];
    if (profile) {
      lines.push(`Utgangspunkt: ${profile.name} (${profile.orgNumber}).`);
      const summary: string | null = profile.qualitative?.businessSummary ?? null;
      if (summary) lines.push(summary.length > 320 ? `${summary.slice(0, 320).trimEnd()}…` : summary);
      lines.push("");
    }

    if (candidates.length > 0) {
      lines.push("Relevante selskaper etter forretningsbeskrivelse:");
      candidates.forEach((c, i) => {
        const desc = c.businessSummary ? ` — ${c.businessSummary.slice(0, 180)}` : "";
        lines.push(`${i + 1}. ${c.companyName ?? "Ukjent"} (${c.orgNumber})${desc}`);
      });
    } else {
      lines.push("Fant ingen selskaper i det kvalitative korpuset som matcher denne spørringen ennå.");
    }

    lines.push("");
    lines.push("(Foreløpig regelbasert svar uten språkmodell – null API-kostnad. En ekte modell kobles på senere.)");

    return { content: lines.join("\n"), toolCalls: [], usage: zeroUsage() };
  }
}
