import { searchRegistryCompanies } from "@/server/registry/entity-search-service";
import type { NormalizedCompany } from "@/lib/types";

/**
 * The AI search engine is expensive: an analytical query fans out into a multi-turn
 * tool-calling loop. Most searches are not analytical — they are a company name or an
 * org number. This router is the deterministic, zero-LLM cost gate that decides whether
 * a query is even *allowed* to reach the agent.
 *
 * It is intentionally pure/heuristic (plus one cheap mirror lookup for direct matches).
 * It never calls an LLM. A query only escalates to the agent when it shows explicit
 * analytical intent AND the user has opted in via the UI toggle (checked separately at
 * the API layer).
 */

export type SearchIntent =
  | "DIRECT_LOOKUP" // an org number or a specific company name — resolve directly, no agent
  | "STRUCTURED_FILTER" // keyword/industry/geo filtering — existing structured search, no agent
  | "ANALYTICAL"; // "competitors of…", "acquisition targets…" — the only tier that uses the agent

export type QueryClassification = {
  intent: SearchIntent;
  /** True only for ANALYTICAL. The single flag the API layer checks before spending tokens. */
  usesAgent: boolean;
  /** Which signals fired, for observability and for showing the user why AI ran (or didn't). */
  matchedSignals: string[];
  reason: string;
};

const ORG_NUMBER_PATTERN = /^\d{9}$/;

/**
 * Analytical-intent markers, Norwegian + English. Each entry is [label, regex]. A single
 * match promotes the query to ANALYTICAL. Kept explicit (not a bag of words) so the gate
 * is auditable and a plain company name never trips it — "Rema 1000" must not look
 * analytical, but "franchise stores for Rema 1000" must.
 */
const ANALYTICAL_SIGNALS: Array<[string, RegExp]> = [
  ["competitors", /\b(competitors?|konkurrent(er|ene)?|rival(s|er)?)\b/i],
  [
    "acquisition-targets",
    /\b(acquisition targets?|acquisition candidates?|oppkj[øo]psm[åa]l|oppkj[øo]pskandidat(er)?|potensielle oppkj[øo]p|targets? for)\b/i,
  ],
  ["franchise", /\bfranchise[a-z]*\b/i],
  ["suppliers-customers", /\b(suppliers?|leverand[øo]r(er|ene)?|customers?|kunder|kundene)\b/i],
  ["similar", /\b(similar to|comparable to|lignende|ligner|tilsvarende|like selskaper)\b/i],
  [
    "ownership",
    /\b(owned by|owns|subsidiar(y|ies)|datterselskap(er|ene)?|eies av|eier av|portef[øo]lje)\b/i,
  ],
  ["overview", /\b(overview of|oversikt over|complete overview|full oversikt)\b/i],
  ["enumerate", /\b(list all|list alle|name (all|potential|the)|nevn|gi meg (alle|en|komplett))\b/i],
  ["compare", /\b(compare|sammenlign|benchmark)\b/i],
  ["interrogative", /\b(which|what|who|hvilke|hvilken|hvem|hva)\b/i],
  ["question-mark", /\?/],
];

/**
 * Classify a raw query with no I/O. This alone decides `usesAgent`, so it is the hot,
 * safe-by-default gate: anything not clearly analytical stays cheap.
 */
export function classifyQueryIntent(rawQuery: string): QueryClassification {
  const query = rawQuery.trim();

  if (!query) {
    return {
      intent: "STRUCTURED_FILTER",
      usesAgent: false,
      matchedSignals: [],
      reason: "Empty query.",
    };
  }

  // An org number (optionally spaced) is always a direct lookup — never the agent.
  if (ORG_NUMBER_PATTERN.test(query.replace(/\s/g, ""))) {
    return {
      intent: "DIRECT_LOOKUP",
      usesAgent: false,
      matchedSignals: ["org-number"],
      reason: "Query is a 9-digit organisation number.",
    };
  }

  const matchedSignals = ANALYTICAL_SIGNALS.filter(([, pattern]) => pattern.test(query)).map(
    ([label]) => label,
  );

  if (matchedSignals.length > 0) {
    return {
      intent: "ANALYTICAL",
      usesAgent: true,
      matchedSignals,
      reason: `Analytical intent detected (${matchedSignals.join(", ")}).`,
    };
  }

  return {
    intent: "STRUCTURED_FILTER",
    usesAgent: false,
    matchedSignals: [],
    reason: "No analytical intent; treated as a name/keyword lookup.",
  };
}

export type DirectMatch = {
  company: NormalizedCompany;
  /** "exact" when the query equals the company name (case-insensitive), else "org-number". */
  matchType: "exact" | "org-number";
};

/**
 * Cheap mirror lookup that resolves a query straight to a single company when it is an
 * org number or an exact (case-insensitive) name match. Lets the API layer short-circuit
 * even when the UI toggle is on: AI-enabled does not mean AI-on-every-query, and looking
 * up "Equinor ASA" must never wake the agent.
 *
 * Returns null when the query is ambiguous (0 or >1 candidates, or no exact name hit),
 * leaving the decision to the classifier / agent.
 */
export async function resolveDirectMatch(rawQuery: string): Promise<DirectMatch | null> {
  const query = rawQuery.trim();
  if (!query) return null;

  const normalizedOrgNumber = query.replace(/\s/g, "");
  if (ORG_NUMBER_PATTERN.test(normalizedOrgNumber)) {
    const [company] = await searchRegistryCompanies({ query: normalizedOrgNumber, size: 1 });
    return company ? { company, matchType: "org-number" } : null;
  }

  // Pull a small candidate set and accept only an unambiguous exact name match. The mirror
  // already orders exact matches first, so we just have to confirm the top row is exact and
  // that no second row shares the same name.
  const candidates = await searchRegistryCompanies({ query, size: 5 });
  const top = candidates[0];
  if (!top) return null;

  const isExact = top.name.trim().toLowerCase() === query.toLowerCase();
  if (!isExact) return null;

  const otherExact = candidates
    .slice(1)
    .some((candidate) => candidate.name.trim().toLowerCase() === query.toLowerCase());
  if (otherExact) return null;

  return { company: top, matchType: "exact" };
}
