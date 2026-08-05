import { CanonicalMetricKey } from "@/server/financials/canonical-taxonomy";
import { CanonicalFactCandidate } from "@/integrations/brreg/annual-report-financials/types";

// ─────────────────────────────────────────────────────────────────────────
// Engine consensus
//
// In dual-run both engines (Legacy and OpenDataLoader) extract the same
// filing independently. That independence is a correctness signal the
// pipeline was throwing away: when two engines reading the same printed
// figure produce the *same* number, that is strong evidence it is right;
// when they disagree, that specific number is suspect.
//
// Consensus also discriminates the two reasons an accounting identity can
// fail. If both engines independently produced the same operand values and
// the identity still does not hold, the inconsistency is in the filed
// statement itself — not our extraction. If the engines read an operand
// differently, the failure is plausibly an extraction error. The loop and
// the reviewer need that distinction: we never "correct" a faithfully
// extracted number to satisfy a constraint the source itself breaks.
// ─────────────────────────────────────────────────────────────────────────

export type MetricConsensusStatus = "agreed" | "disagreed" | "legacy-only" | "odl-only";

export type MetricConsensus = {
  metricKey: string;
  legacyValue: number | null;
  odlValue: number | null;
  status: MetricConsensusStatus;
};

export type EngineConsensus = {
  metrics: MetricConsensus[];
  /** Metrics both engines produced — i.e. status "agreed" or "disagreed". */
  comparedCount: number;
  agreedCount: number;
  /** agreedCount / comparedCount; 0 when nothing was comparable. */
  agreementScore: number;
  /** Compared metrics the two engines read differently. */
  disagreedMetricKeys: string[];
};

export type ConstraintCause = "source" | "extraction" | "indeterminate";

// Two independent engines reading the same printed figure should produce the
// same number. A genuine disagreement — a misread digit, a wrong year
// column, a unit-scale slip — shifts the value by far more than this. The
// tolerance only absorbs trivial sub-rounding noise.
function valuesAgree(left: number, right: number): boolean {
  const tolerance = Math.max(1, 0.005 * Math.max(Math.abs(left), Math.abs(right)));
  return Math.abs(left - right) <= tolerance;
}

/**
 * Compares the selected facts of the two engines metric by metric.
 */
export function computeEngineConsensus(
  legacyFacts: Map<CanonicalMetricKey, CanonicalFactCandidate>,
  odlFacts: Map<CanonicalMetricKey, CanonicalFactCandidate>,
): EngineConsensus {
  const metricKeys = new Set<string>([
    ...legacyFacts.keys(),
    ...odlFacts.keys(),
  ]);
  const metrics: MetricConsensus[] = [];
  let comparedCount = 0;
  let agreedCount = 0;
  const disagreedMetricKeys: string[] = [];

  for (const metricKey of [...metricKeys].sort()) {
    const legacyValue = legacyFacts.get(metricKey as CanonicalMetricKey)?.value ?? null;
    const odlValue = odlFacts.get(metricKey as CanonicalMetricKey)?.value ?? null;

    let status: MetricConsensusStatus;
    if (legacyValue !== null && odlValue !== null) {
      comparedCount += 1;
      if (valuesAgree(legacyValue, odlValue)) {
        status = "agreed";
        agreedCount += 1;
      } else {
        status = "disagreed";
        disagreedMetricKeys.push(metricKey);
      }
    } else if (legacyValue !== null) {
      status = "legacy-only";
    } else {
      status = "odl-only";
    }

    metrics.push({ metricKey, legacyValue, odlValue, status });
  }

  return {
    metrics,
    comparedCount,
    agreedCount,
    agreementScore:
      comparedCount > 0 ? Number((agreedCount / comparedCount).toFixed(4)) : 0,
    disagreedMetricKeys,
  };
}

// The canonical metrics each accounting-identity rule (see validation.ts)
// references. Used to ask whether both engines agreed on the figures the
// identity sums.
const CONSTRAINT_RULE_OPERANDS: Record<string, readonly string[]> = {
  IS_OPERATING_PROFIT_MATCH: [
    "total_operating_income",
    "total_operating_expenses",
    "operating_profit",
  ],
  IS_NET_FINANCIAL_ITEMS_MATCH: [
    "financial_income",
    "financial_expense",
    "net_financial_items",
  ],
  IS_PROFIT_BEFORE_TAX_MATCH: [
    "operating_profit",
    "net_financial_items",
    "profit_before_tax",
  ],
  IS_NET_INCOME_MATCH: ["profit_before_tax", "tax_expense", "net_income"],
  BS_TOTAL_BALANCES: ["total_assets", "total_equity_and_liabilities"],
  BS_TOTAL_LIABILITIES_COMPONENTS: [
    "long_term_liabilities",
    "current_liabilities",
    "total_liabilities",
  ],
  BS_EQUITY_LIABILITIES_MATCH: [
    "total_equity",
    "total_liabilities",
    "total_equity_and_liabilities",
  ],
};

/**
 * Discriminates why an accounting identity failed:
 *
 *  - "extraction": at least one operand is a figure the two engines read
 *    differently — the imbalance is plausibly our extraction error.
 *  - "source": both engines independently extracted the *same* operand
 *    values, yet the identity still does not hold — the filed statement is
 *    itself internally inconsistent. We record it faithfully and flag it.
 *  - "indeterminate": not enough overlapping operands to tell.
 *
 * Returns null for rule codes that are not accounting identities.
 */
export function classifyConstraintCause(
  ruleCode: string,
  consensus: EngineConsensus,
): ConstraintCause | null {
  const operands = CONSTRAINT_RULE_OPERANDS[ruleCode];
  if (!operands) {
    return null;
  }
  const statusByMetric = new Map(
    consensus.metrics.map((metric) => [metric.metricKey, metric.status]),
  );
  const operandStatuses = operands.map((metricKey) => statusByMetric.get(metricKey));
  if (operandStatuses.some((status) => status === "disagreed")) {
    return "extraction";
  }
  if (operandStatuses.every((status) => status === "agreed")) {
    return "source";
  }
  return "indeterminate";
}

// Bounded adjustment consensus contributes to the confidence score.
// Asymmetric on purpose: a disagreement is a sharper, more actionable signal
// than agreement is a reassuring one — it bites harder. Bounded so consensus
// nudges the score without ever dominating the other signals.
const CONSENSUS_MAX_BONUS = 0.04;
const CONSENSUS_MAX_PENALTY = 0.08;

export function consensusConfidenceDelta(consensus: EngineConsensus): number {
  if (consensus.comparedCount === 0) {
    return 0;
  }
  // The bonus only engages for near-total agreement.
  const bonus =
    consensus.agreementScore >= 0.8
      ? CONSENSUS_MAX_BONUS * ((consensus.agreementScore - 0.8) / 0.2)
      : 0;
  const penalty = Math.min(
    CONSENSUS_MAX_PENALTY,
    consensus.disagreedMetricKeys.length * 0.04,
  );
  return Number((bonus - penalty).toFixed(4));
}
