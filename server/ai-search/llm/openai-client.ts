import type {
  LlmMessage,
  LlmRunOptions,
  LlmRunResult,
  LlmToolCall,
  LlmClient,
} from "./types";

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

  constructor(options: { apiKey: string; model: string }) {
    this.apiKey = options.apiKey;
    this.model = options.model;
  }

  async run(options: LlmRunOptions): Promise<LlmRunResult> {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: options.messages.map(toOpenAiMessage),
        tools: options.tools.map((tool) => ({
          type: "function",
          function: {
            name: tool.name,
            description: tool.description,
            strict: tool.strict ?? false,
            parameters: tool.parameters,
          },
        })),
        tool_choice: options.toolChoice ?? "auto",
        parallel_tool_calls: false,
        max_completion_tokens: 1_800,
        ...(options.temperature == null ? {} : { temperature: options.temperature }),
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI Njord request failed with status ${response.status}.`);
    }
    const payload = (await response.json()) as OpenAiResponse;
    const message = payload.choices?.[0]?.message;
    if (!message) throw new Error("OpenAI Njord response contained no message.");

    const toolCalls: LlmToolCall[] = (message.tool_calls ?? []).flatMap((call) => {
      const id = call.id;
      const name = call.function?.name;
      if (!id || !name) return [];
      return [{ id, name, arguments: call.function?.arguments ?? "{}" }];
    });
    const promptTokens = Math.max(0, payload.usage?.prompt_tokens ?? 0);
    const cachedInputTokens = Math.min(
      promptTokens,
      Math.max(0, payload.usage?.prompt_tokens_details?.cached_tokens ?? 0),
    );

    return {
      content: message.content ?? null,
      toolCalls,
      usage: {
        inputTokens: promptTokens - cachedInputTokens,
        cachedInputTokens,
        outputTokens: Math.max(0, payload.usage?.completion_tokens ?? 0),
        model: payload.model ?? this.model,
        sourceId: payload.id,
      },
    };
  }
}
