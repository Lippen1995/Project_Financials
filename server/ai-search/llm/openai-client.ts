import type {
  LlmMessage,
  LlmRunOptions,
  LlmRunResult,
  LlmToolCall,
  LlmClient,
} from "./types";
import { estimateNjordCostNok, type NjordPricing } from "../runtime-policy";

const MAX_COMPLETION_TOKENS = 1_800;
const TOKENIZATION_OVERHEAD_TOKENS = 4_096;

type OpenAiResponse = {
  id?: string;
  model?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
  };
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: Array<{
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
  }>;
};

function toOpenAiMessage(message: LlmMessage) {
  if (message.role === "assistant") {
    return {
      role: "assistant",
      content: message.content,
      ...(message.toolCalls?.length
        ? {
            tool_calls: message.toolCalls.map((call) => ({
              id: call.id,
              type: "function",
              function: { name: call.name, arguments: call.arguments },
            })),
          }
        : {}),
    };
  }
  if (message.role === "tool") {
    return { role: "tool", tool_call_id: message.toolCallId, content: message.content };
  }
  return { role: message.role, content: message.content };
}

export class OpenAiLlmClient implements LlmClient {
  readonly model: string;
  private readonly apiKey: string;
  private readonly pricing: NjordPricing | null;
  private readonly requestCostLimitNok: number | null;
  private spentCostNok = 0;
  private inputTokens = 0;
  private cachedInputTokens = 0;
  private outputTokens = 0;
  private sourceIds: string[] = [];

  constructor(options: {
    apiKey: string;
    model: string;
    pricing?: NjordPricing;
    requestCostLimitNok?: number;
  }) {
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.pricing = options.pricing ?? null;
    this.requestCostLimitNok = options.requestCostLimitNok ?? null;
  }

  async run(options: LlmRunOptions): Promise<LlmRunResult> {
    const messages = options.messages.map(toOpenAiMessage);
    const tools = options.tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        strict: tool.strict ?? false,
        parameters: tool.parameters,
      },
    }));
    let maxCompletionTokens = MAX_COMPLETION_TOKENS;
    if (this.pricing && this.requestCostLimitNok != null) {
      const serializedInputBytes = Buffer.byteLength(JSON.stringify({ messages, tools }), "utf8");
      const conservativeInputTokens = serializedInputBytes + TOKENIZATION_OVERHEAD_TOKENS;
      const inputUpperCostNok =
        conservativeInputTokens * this.pricing.inputNokPerMillion / 1_000_000;
      const remainingForOutputNok =
        this.requestCostLimitNok - this.spentCostNok - inputUpperCostNok;
      maxCompletionTokens = Math.min(
        MAX_COMPLETION_TOKENS,
        Math.floor(
          remainingForOutputNok * 1_000_000 / this.pricing.outputNokPerMillion,
        ),
      );
      if (!Number.isFinite(maxCompletionTokens) || maxCompletionTokens < 1) {
        throw new Error("Njord request cost budget is exhausted before the next model turn.");
      }
    }
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        tools,
        tool_choice: options.toolChoice ?? "auto",
        parallel_tool_calls: false,
        max_completion_tokens: maxCompletionTokens,
        ...(options.temperature == null ? {} : { temperature: options.temperature }),
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI Njord request failed with status ${response.status}.`);
    }
    const payload = (await response.json()) as OpenAiResponse;
    const promptTokens = Math.max(0, payload.usage?.prompt_tokens ?? 0);
    const cachedInputTokens = Math.min(
      promptTokens,
      Math.max(0, payload.usage?.prompt_tokens_details?.cached_tokens ?? 0),
    );
    const outputTokens = Math.max(0, payload.usage?.completion_tokens ?? 0);
    this.inputTokens += promptTokens - cachedInputTokens;
    this.cachedInputTokens += cachedInputTokens;
    this.outputTokens += outputTokens;
    if (payload.id) this.sourceIds.push(payload.id);
    if (this.pricing) {
      this.spentCostNok += estimateNjordCostNok({
        inputTokens: promptTokens - cachedInputTokens,
        cachedInputTokens,
        outputTokens,
      }, this.pricing);
    }
    const message = payload.choices?.[0]?.message;
    if (!message) throw new Error("OpenAI Njord response contained no message.");

    const toolCalls: LlmToolCall[] = (message.tool_calls ?? []).flatMap((call) => {
      const id = call.id;
      const name = call.function?.name;
      if (!id || !name) return [];
      return [{ id, name, arguments: call.function?.arguments ?? "{}" }];
    });

    return {
      content: message.content ?? null,
      toolCalls,
      usage: {
        inputTokens: promptTokens - cachedInputTokens,
        cachedInputTokens,
        outputTokens,
        model: payload.model ?? this.model,
        sourceId: payload.id,
      },
    };
  }

  getUsageSnapshot() {
    return {
      inputTokens: this.inputTokens,
      cachedInputTokens: this.cachedInputTokens,
      outputTokens: this.outputTokens,
      model: this.model,
      sourceIds: [...this.sourceIds],
    };
  }
}
