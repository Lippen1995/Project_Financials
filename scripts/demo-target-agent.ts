/**
 * End-to-end demo of the Step-3 agent loop with ZERO API cost: a scripted (fake) brain drives the
 * REAL retrieval tools against the REAL database, using the real target-reasoning system prompt.
 * This proves the loop + tools + grounding all work before any paid model is wired in. The scripted
 * client only decides WHICH tools to call; a real LLM would decide that itself (and write the answer).
 */
import { runAgent } from "@/server/ai-search/agent/agent-loop";
import { buildTargetReasoningPrompt } from "@/server/ai-search/agent/target-reasoning";
import { ScriptedLlmClient } from "@/server/ai-search/llm/scripted-client";
import { retrievalTools } from "@/server/ai-search/tools";

async function main() {
  // A plausible tool sequence a real model would follow for "targets for Fjord Defence".
  const brain = new ScriptedLlmClient([
    { toolCalls: [{ name: "resolve_company", arguments: { nameHint: "Fjord Defence Group" } }] },
    { toolCalls: [{ name: "get_company_profile", arguments: { orgNumber: "917811288" } }] }, // the consolidator
    { toolCalls: [{ name: "find_by_business", arguments: { query: "defence security military naval systems", limit: 8 } }] },
    { toolCalls: [{ name: "get_company_profile", arguments: { orgNumber: "978614582" } }] }, // Kongsberg Defence
    { toolCalls: [{ name: "get_company_profile", arguments: { orgNumber: "990295697" } }] }, // Comrod
    {
      content:
        "Acquirer is a defence CONSOLIDATOR, so I ranked for portfolio breadth + acquirability, not " +
        "product overlap.\n" +
        "1. COMROD COMMUNICATION AS (990295697) — ruggedised C4ISR antennas/masts; adjacent platform " +
        "hardware, adds a comms niche.\n" +
        "2. KONGSBERG DEFENCE & AEROSPACE AS (978614582) — likely too large/strategic to bolt on; flag.\n" +
        "(Demo answer is scripted, not reasoned — a real model would write this.)",
    },
  ]);

  const result = await runAgent({
    llm: brain,
    tools: retrievalTools,
    systemPrompt: buildTargetReasoningPrompt({ acquirerName: "Fjord Defence Group ASA" }),
    userQuery: "List the best acquisition targets for Fjord Defence.",
  });

  console.log("model:            ", brain.model, "(no API cost)");
  console.log("stopReason:       ", result.stopReason, "| turns:", result.turns);
  console.log("token usage:      ", JSON.stringify(result.usage), "← zero, scripted");
  console.log("\ntool invocations:");
  for (const inv of result.invocations) console.log(`   ${inv.ok ? "✓" : "✗"} ${inv.name}(${JSON.stringify(inv.arguments)})`);
  console.log("\ngrounded org numbers (from tool results):", result.groundedOrgNumbers.join(", "));
  console.log("ungrounded orgs cited in answer (leaks):  ", result.ungroundedOrgNumbersInAnswer.length ? result.ungroundedOrgNumbersInAnswer.join(", ") : "none ✓");
  console.log("\n--- ANSWER ---\n" + result.answer);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
