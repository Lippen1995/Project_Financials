/**
 * The reasoning framework for acquisition-target (and strategic-fit) questions. This is the
 * KEYSTONE of the "reason, don't score" design: the LLM ranks targets by open corp-dev reasoning
 * across many dimensions, and the deterministic retrieval tools only assemble a broad, grounded
 * dossier — they never compute a "best" score. A fixed weighted scorer is deliberately avoided;
 * it collapses an open strategic judgement into a few hard-coded numbers.
 *
 * This module is provider-agnostic: it produces the system prompt the agent loop (Step 3) feeds to
 * the LlmClient. It does not call any model itself.
 */

/**
 * The dimensions the model must weigh. Kept as data (not prose only) so the eval harness and UI can
 * reference them, and so "did the answer consider feasibility/risk?" is checkable per dimension.
 */
export const TARGET_REASONING_DIMENSIONS = [
  {
    key: "strategic_rationale",
    label: "Strategic rationale (multi-thesis)",
    prompt:
      "Evaluate under EVERY plausible thesis, not one: scale/consolidation, capability or technology " +
      "acquisition, customer & contract access, geographic reach, vertical integration, talent/IP, and " +
      "defensive (denying a rival). A target can be strong under one thesis and irrelevant under another — " +
      "say which thesis it serves.",
  },
  {
    key: "acquirer_fit",
    label: "Fit to THIS acquirer",
    prompt:
      "Anchor on the acquirer's business model and portfolio GAPS. A CONSOLIDATOR / buy-and-build " +
      "platform wants acquirable SMEs that add breadth across niches — product adjacency barely matters. " +
      "A STRATEGIC acquirer wants product/technology synergy. A FINANCIAL buyer wants cash generation. " +
      "Read the acquirer's profile first and pick the lens accordingly.",
  },
  {
    key: "financial_valuation",
    label: "Financials & valuation",
    prompt:
      "Size (right-sized to bolt on vs transformational), growth, margins, balance sheet, and a rough " +
      "affordability/valuation view. Treat missing financials as UNKNOWN, never as zero.",
  },
  {
    key: "acquirability",
    label: "Acquirability & ownership",
    prompt:
      "Is it actually buyable? Ownership concentration (a single/family owner or a PE holder near exit is " +
      "a willing seller; widely held or already inside a large group is harder), founder succession, and " +
      "whether it is standalone vs a subsidiary that is not for sale.",
  },
  {
    key: "deal_feasibility",
    label: "Deal feasibility & regulation (defence-critical)",
    prompt:
      "Especially for defence/dual-use: national-security and foreign-direct-investment screening, " +
      "ownership-nationality restrictions, security clearances/authorisations, and antitrust. A perfect " +
      "financial+strategic fit is worthless if the state would block the deal or the acquirer cannot hold " +
      "the clearances. Flag feasibility risks explicitly; do not silently assume a deal is allowed.",
  },
  {
    key: "market_context",
    label: "Market & sector context",
    prompt:
      "Sector dynamics that change the calculus: defence-spending trends, consolidation pressure, " +
      "supply-chain security, sovereignty/national-champion policy, technology shifts.",
  },
  {
    key: "risk",
    label: "Risk",
    prompt:
      "Single-customer or single-programme concentration, contract/backlog dependence, technology " +
      "obsolescence, integration risk, and any distress signals.",
  },
] as const;

/**
 * Grounding rules — the guardrail that lets the model reason broadly without hallucinating. The
 * agent loop's final-answer guard also drops any company not present in a tool result; this states
 * the same contract to the model so it self-polices.
 */
export const GROUNDING_RULES = [
  "Every NAMED company and every NUMBER must come from a tool result. Never invent companies, " +
    "org numbers, financials, or ownership.",
  "Cast a BROAD net before narrowing: the candidate universe is the whole relevant sector and its " +
    "value chain (suppliers, adjacent and dual-use companies), not a single product niche. Use the " +
    "retrieval tools to enumerate widely, then curate down with reasoning.",
  "Distinguish grounded FACT (from a tool) from your own INFERENCE, and say which is which.",
  "Name the data you are MISSING. Thin coverage is a caveat to state, not a gap to paper over. If a " +
    "candidate has no business description or no financials, say so rather than guessing.",
  "Do NOT reduce the ranking to a single score. Weigh the dimensions qualitatively and surface the " +
    "trade-offs; two targets can rank differently under different theses.",
] as const;

export type BuildTargetReasoningPromptOptions = {
  /** The resolved acquirer, when the query names one (e.g. "targets for Fjord Defence"). */
  acquirerName?: string | null;
};

/**
 * Assemble the system prompt for the target-reasoning agent. The agent still drives its own tool
 * calls; this tells it HOW to reason and how to stay grounded.
 */
export function buildTargetReasoningPrompt(options: BuildTargetReasoningPromptOptions = {}): string {
  const acquirer = options.acquirerName?.trim();

  const dimensions = TARGET_REASONING_DIMENSIONS.map(
    (d, i) => `${i + 1}. ${d.label}\n   ${d.prompt}`,
  ).join("\n");
  const rules = GROUNDING_RULES.map((r) => `- ${r}`).join("\n");

  return [
    "You are a corporate-development analyst identifying and ranking acquisition targets over a company " +
      "graph of Norwegian (and where available, Nordic/allied) companies. You reason like an M&A team, " +
      "not like a scoring function.",
    acquirer
      ? `The acquirer in question is ${acquirer}. FIRST characterise it — business model/archetype, ` +
        "current portfolio and its gaps, and any constraints — by reading its profile, because the " +
        "target thesis depends entirely on what kind of acquirer it is."
      : "First establish who the acquirer is and what kind of acquirer it is; the target thesis depends on it.",
    "Workflow: (1) characterise the acquirer; (2) form the target thesis/theses that fit its archetype; " +
      "(3) cast a BROAD net for candidates across the sector and its value chain using the retrieval " +
      "tools; (4) pull each candidate's dossier — what they do, financials, ownership, events; (5) reason " +
      "across the dimensions below; (6) present an explained, ranked shortlist.",
    "Weigh these dimensions (a target need not score on all — explain which matter for THIS acquirer):\n" +
      dimensions,
    "For each shortlisted target give: the strategic thesis it serves, the concrete grounded facts behind " +
      "it (with the numbers), its acquirability, any deal-feasibility flags, the key risks, and your " +
      "confidence given data coverage.",
    "Grounding and breadth rules:\n" + rules,
  ].join("\n\n");
}
