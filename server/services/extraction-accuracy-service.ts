// ─────────────────────────────────────────────────────────────────────────
// Extraction-accuracy eval
//
// Compares the extraction's canonical facts (metricKey → value) against the
// human-verified published fasit (PublishedFinancialLineItem), at the
// (metricKey, statementScope, fiscalYear) grain. This is the value-level
// accuracy the existing benchmark infra does NOT measure — the gold-set /
// failure-taxonomy / shadow-run stack scores routing tags, failure classes and
// engine parity, never "did we produce the CORRECT number vs the reviewer".
//
// The function is pure (two fact lists in, a result out) so the eval runner and
// the unit tests share the exact same maths.
// ─────────────────────────────────────────────────────────────────────────

export type AccuracyScope = "COMPANY" | "CONSOLIDATED";

export type AccuracyFact = {
  metricKey: string;
  statementScope: AccuracyScope;
  fiscalYear: number;
  /** Whole-NOK integer as a string (may be negative). */
  value: string;
};

export type AccuracyMiss = {
  metricKey: string;
  statementScope: AccuracyScope;
  fiscalYear: number;
  /** For `missing`: the fasit value we failed to produce. For `wrong`: the
   *  value extraction produced that matches no fasit value on the slot. */
  value: string;
  /** For `missing`: what extraction produced on the slot (if anything). For
   *  `wrong`: the fasit value(s) we should have produced. */
  producedInstead: string[];
  isZero: boolean;
};

export type MetricAccuracy = {
  metricKey: string;
  fasitValues: number;
  matched: number;
  extractedOnSlots: number;
  correct: number;
};

export type AccuracyResult = {
  /** matched / fasitTotal (all fasit values). */
  recall: number;
  /** matched / non-zero fasit values — the honest headline, since a printed 0
   *  / blank line has no numeric token for geometry-first to place. */
  recallNonZero: number;
  /** correct / extractedOnFasitSlots — of the values we produced for metrics the
   *  fasit covers, how many are right (catches confidently-wrong extraction). */
  precision: number;
  fasitTotal: number;
  matchedTotal: number;
  nonZeroFasitTotal: number;
  matchedNonZero: number;
  extractedOnFasitSlots: number;
  correctTotal: number;
  zeroValuedFasit: number;
  byMetric: MetricAccuracy[];
  /** Fasit values not produced by extraction (recall misses). */
  missing: AccuracyMiss[];
  /** Extracted values on a fasit slot that match no fasit value (precision
   *  misses — the dangerous "wrong number, looks confident" case). */
  wrong: AccuracyMiss[];
};

const slotKey = (f: { metricKey: string; statementScope: AccuracyScope; fiscalYear: number }) =>
  `${f.metricKey}|${f.statementScope}|${f.fiscalYear}`;

function parseSlotKey(key: string): { metricKey: string; statementScope: AccuracyScope; fiscalYear: number } {
  const [metricKey, statementScope, fiscalYear] = key.split("|");
  return {
    metricKey: metricKey!,
    statementScope: statementScope as AccuracyScope,
    fiscalYear: Number(fiscalYear),
  };
}

function groupBySlot(facts: AccuracyFact[]): Map<string, Set<string>> {
  const bySlot = new Map<string, Set<string>>();
  for (const f of facts) {
    const k = slotKey(f);
    let set = bySlot.get(k);
    if (!set) {
      set = new Set<string>();
      bySlot.set(k, set);
    }
    set.add(f.value.trim());
  }
  return bySlot;
}

export function compareFactsToFasit(input: {
  extracted: AccuracyFact[];
  fasit: AccuracyFact[];
}): AccuracyResult {
  const fasitBySlot = groupBySlot(input.fasit);
  const extractedBySlot = groupBySlot(input.extracted);

  const metricByKey = new Map<string, MetricAccuracy>();
  const metric = (mk: string): MetricAccuracy => {
    let m = metricByKey.get(mk);
    if (!m) {
      m = { metricKey: mk, fasitValues: 0, matched: 0, extractedOnSlots: 0, correct: 0 };
      metricByKey.set(mk, m);
    }
    return m;
  };

  let fasitTotal = 0;
  let matchedTotal = 0;
  let nonZeroFasitTotal = 0;
  let matchedNonZero = 0;
  let zeroValuedFasit = 0;
  const missing: AccuracyMiss[] = [];

  // RECALL — every distinct fasit value should appear in the extracted slot.
  for (const [key, values] of fasitBySlot) {
    const slot = parseSlotKey(key);
    const ext = extractedBySlot.get(key);
    const m = metric(slot.metricKey);
    for (const value of values) {
      const isZero = value === "0";
      fasitTotal++;
      m.fasitValues++;
      if (isZero) zeroValuedFasit++;
      else nonZeroFasitTotal++;
      const hit = ext?.has(value) ?? false;
      if (hit) {
        matchedTotal++;
        m.matched++;
        if (!isZero) matchedNonZero++;
      } else {
        missing.push({ ...slot, value, isZero, producedInstead: ext ? [...ext] : [] });
      }
    }
  }

  // PRECISION — extracted values on slots the fasit covers must match a fasit
  // value. Slots absent from the fasit are ignored (the fasit can be partial;
  // we don't penalise producing a metric the reviewer simply didn't include).
  let extractedOnFasitSlots = 0;
  let correctTotal = 0;
  const wrong: AccuracyMiss[] = [];
  for (const [key, values] of extractedBySlot) {
    const fas = fasitBySlot.get(key);
    if (!fas) continue;
    const slot = parseSlotKey(key);
    const m = metric(slot.metricKey);
    for (const value of values) {
      extractedOnFasitSlots++;
      m.extractedOnSlots++;
      if (fas.has(value)) {
        correctTotal++;
        m.correct++;
      } else {
        wrong.push({ ...slot, value, isZero: value === "0", producedInstead: [...fas] });
      }
    }
  }

  return {
    recall: fasitTotal === 0 ? 1 : matchedTotal / fasitTotal,
    recallNonZero: nonZeroFasitTotal === 0 ? 1 : matchedNonZero / nonZeroFasitTotal,
    precision: extractedOnFasitSlots === 0 ? 1 : correctTotal / extractedOnFasitSlots,
    fasitTotal,
    matchedTotal,
    nonZeroFasitTotal,
    matchedNonZero,
    extractedOnFasitSlots,
    correctTotal,
    zeroValuedFasit,
    byMetric: [...metricByKey.values()].sort((a, b) => a.metricKey.localeCompare(b.metricKey)),
    missing,
    wrong,
  };
}
