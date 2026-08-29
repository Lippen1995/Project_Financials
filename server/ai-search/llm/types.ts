/**
 * Provider-agnostic LLM contract for the AI search agent. Concrete adapters (OpenAI first on
 * gpt-5-mini, then Gemini Flash / Anthropic) implement this so the engine can swap providers
 * from config without touching the agent loop or the retrieval tools. Cost sensitivity is the
 * reason this abstraction exists: the eval harness compares adapters on the same interface.
 */

export type LlmToolDefinition = {
  name: string;
  description: string;
  strict?: boolean;
  /** JSON Schema for the tool arguments (from each RetrievalTool's `parameters`). */
  parameters: Record<string, unknown>;
};

export type LlmToolCall = {
  id: string;
  name: string;
  /** Raw JSON arguments string from the model; validated against the tool's zod schema before use. */
  arguments: string;
};

export type LlmMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; toolCalls?: LlmToolCall[] }
  | { role: "tool"; toolCallId: string; content: string };

export type LlmRunResult = {
  /** Assistant text for this turn (may be empty when the model only requested tools). */
  content: string | null;
  /** Tool calls the model wants executed; empty when the model produced a final answer. */
  toolCalls: LlmToolCall[];
  usage?: {
    inputTokens: number;
    cachedInputTokens?: number;
    outputTokens: number;
    model?: string;
    /** Provider-neutral provenance supplied by the concrete adapter. */
    sourceSystem: string;
    sourceEntityType: string;
    sourceId?: string;
  };
};

export type LlmProvenance = {
  sourceSystem: string;
  sourceEntityType: string;
};

export type LlmUsageSnapshot = LlmProvenance & {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  model: string;
  sourceIds: string[];
};

export type LlmRunOptions = {
  messages: LlmMessage[];
  tools: LlmToolDefinition[];
  /** Force the model to stop calling tools and answer (final synthesis turn). */
  toolChoice?: "auto" | "required" | "none";
  temperature?: number;
  /** Required caller-owned ceiling. The adapter may lower it further to enforce cost limits. */
  maxOutputTokens: number;
  /** Request a machine-readable JSON object without exposing provider-specific request fields. */
  responseFormat?: "json_object";
};

/** Provider charged for a response, but the response could not satisfy the LLM contract. */
export class LlmProviderResponseError extends Error {
  constructor(
    message: string,
    readonly usage: NonNullable<LlmRunResult["usage"]>,
  ) {
    super(message);
    this.name = "LlmProviderResponseError";
  }
}

/** Provider omitted the metadata required to account for a potentially charged response. */
export class LlmProviderAccountingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmProviderAccountingError";
  }
}

/**
 * One model turn. The agent loop owns iteration, tool execution, and the budget caps; the
 * client is a thin, stateless boundary over a single provider round-trip. Streaming is layered
 * on in Step 3 via a separate method rather than overloading this one.
 */
export interface LlmClient {
  readonly model: string;
  run(options: LlmRunOptions): Promise<LlmRunResult>;
}

/** Runtime clients expose cumulative accounting without leaking provider-specific types. */
export interface MeteredLlmClient extends LlmClient {
  readonly provenance: LlmProvenance;
  getUsageSnapshot(): LlmUsageSnapshot;
}
