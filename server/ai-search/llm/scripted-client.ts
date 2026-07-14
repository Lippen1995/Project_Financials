/**
 * A zero-cost LlmClient that replays a predetermined script of turns. It calls NO external API, so
 * it can never incur token cost — it exists precisely so the agent loop, tools, grounding and
 * budgets can be exercised end-to-end before any paid provider adapter is wired in.
 *
 * It ignores the incoming messages and simply returns the next scripted turn, which makes it
 * deterministic for tests and for local demos against real retrieval tools.
 */
import type { LlmClient, LlmRunOptions, LlmRunResult } from "./types";

export type ScriptedTurn = {
  /** Assistant text for this turn (the final answer when there are no toolCalls). */
  content?: string | null;
  /** Tool calls to request this turn; arguments are objects (serialized to JSON for the loop). */
  toolCalls?: Array<{ name: string; arguments: Record<string, unknown> }>;
};

export class ScriptedLlmClient implements LlmClient {
  readonly model = "scripted-no-cost";
  private index = 0;
  /** Every run() invocation's options, in order — lets tests assert what the loop sent. */
  readonly received: LlmRunOptions[] = [];

  constructor(private readonly turns: ScriptedTurn[]) {}

  async run(options: LlmRunOptions): Promise<LlmRunResult> {
    this.received.push(options);
    const turn = this.turns[this.index] ?? { content: "" };
    this.index += 1;

    // A forced-synthesis turn (toolChoice: "none") must never emit tool calls.
    const allowTools = options.toolChoice !== "none";
    const toolCalls = allowTools
      ? (turn.toolCalls ?? []).map((call, i) => ({
          id: `scripted_${this.index}_${i}`,
          name: call.name,
          arguments: JSON.stringify(call.arguments),
        }))
      : [];

    return {
      content: turn.content ?? (toolCalls.length > 0 ? null : ""),
      toolCalls,
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }
}
