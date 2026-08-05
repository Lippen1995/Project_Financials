export type SelectiveOcrScaleFact = {
  metricKey: string;
  statementScope: string;
  fiscalYear: number;
  value: string | number | bigint;
};

export type SelectiveOcrScaleMergeStats = {
  secondaryFactsConsidered: number;
  replacedTruncatedSlots: number;
  addedSiblingYearSlots: number;
  skippedConflictingSlots: number;
  skippedUnanchoredSlots: number;
};

export type SelectiveOcrScaleMergeResult = {
  facts: SelectiveOcrScaleFact[];
  stats: SelectiveOcrScaleMergeStats;
};

function stringValue(value: SelectiveOcrScaleFact["value"]) {
  return String(value).trim();
}

function slotKey(fact: SelectiveOcrScaleFact) {
  return `${fact.metricKey}|${fact.statementScope}|${fact.fiscalYear}`;
}

function rowKey(fact: SelectiveOcrScaleFact) {
  return `${fact.metricKey}|${fact.statementScope}`;
}

function fullKey(fact: SelectiveOcrScaleFact) {
  return `${slotKey(fact)}|${stringValue(fact.value)}`;
}

function groupBySlot<T extends SelectiveOcrScaleFact>(facts: T[]) {
  const grouped = new Map<string, T[]>();
  for (const fact of facts) {
    const key = slotKey(fact);
    const current = grouped.get(key) ?? [];
    current.push(fact);
    grouped.set(key, current);
  }
  return grouped;
}

function absDigits(value: SelectiveOcrScaleFact["value"]) {
  return stringValue(value).replace(/^-/, "").replace(/\D/g, "");
}

function hasSameSign(
  left: SelectiveOcrScaleFact["value"],
  right: SelectiveOcrScaleFact["value"],
) {
  return stringValue(left).startsWith("-") === stringValue(right).startsWith("-");
}

function isLikelyMissingLeadingGroupRepair(
  primaryValue: SelectiveOcrScaleFact["value"],
  secondaryValue: SelectiveOcrScaleFact["value"],
) {
  if (!hasSameSign(primaryValue, secondaryValue)) return false;
  const primaryDigits = absDigits(primaryValue);
  const secondaryDigits = absDigits(secondaryValue);
  if (primaryDigits.length < 4) return false;
  if (secondaryDigits.length <= primaryDigits.length) return false;
  if (!secondaryDigits.endsWith(primaryDigits)) return false;

  const restoredLeadingGroup = secondaryDigits.slice(0, secondaryDigits.length - primaryDigits.length);
  if (restoredLeadingGroup.length < 1 || restoredLeadingGroup.length > 3) return false;
  return !/^0+$/.test(restoredLeadingGroup);
}

function hammingDistance(left: string, right: string) {
  if (left.length !== right.length) return Infinity;
  let distance = 0;
  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) distance += 1;
  }
  return distance;
}

function isLikelySingleDigitOcrRepair(
  primaryValue: SelectiveOcrScaleFact["value"],
  secondaryValue: SelectiveOcrScaleFact["value"],
) {
  if (!hasSameSign(primaryValue, secondaryValue)) return false;
  const primaryDigits = absDigits(primaryValue);
  const secondaryDigits = absDigits(secondaryValue);
  if (primaryDigits.length < 6 || primaryDigits.length !== secondaryDigits.length) {
    return false;
  }
  return hammingDistance(primaryDigits, secondaryDigits) === 1;
}

function isLikelyDroppedNonZeroRepair(
  primaryValue: SelectiveOcrScaleFact["value"],
  secondaryValue: SelectiveOcrScaleFact["value"],
) {
  const primaryDigits = absDigits(primaryValue);
  const secondaryDigits = absDigits(secondaryValue);
  return /^0+$/.test(primaryDigits) && !/^0+$/.test(secondaryDigits);
}

function hasSingleDistinctValue(facts: SelectiveOcrScaleFact[]) {
  return new Set(facts.map((fact) => stringValue(fact.value))).size === 1;
}

function findSingleLeadingGroupRepair<T extends SelectiveOcrScaleFact>(input: {
  primaryFacts: T[];
  secondaryFacts: T[];
}) {
  const candidates: Array<{ primary: T; secondary: T }> = [];
  for (const primary of input.primaryFacts) {
    for (const secondary of input.secondaryFacts) {
      if (isLikelyMissingLeadingGroupRepair(primary.value, secondary.value)) {
        candidates.push({ primary, secondary });
      }
    }
  }
  return candidates.length === 1 ? candidates[0]! : null;
}

function isPlausibleMissingSiblingValue(fact: SelectiveOcrScaleFact) {
  const digits = absDigits(fact.value);
  return digits.length >= 4;
}

function dedupeFacts<T extends SelectiveOcrScaleFact>(facts: T[]) {
  const seen = new Set<string>();
  const deduped: T[] = [];
  for (const fact of facts) {
    const key = fullKey(fact);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(fact);
  }
  return deduped;
}

/**
 * Selectively merges a higher-resolution OCR pass into a primary pass.
 *
 * The rule deliberately avoids a raw union. A scale4 value is accepted when it
 * repairs a concrete truncated value on the same metric/scope/year slot, or
 * when it supplies the sibling year for a row already anchored by primary OCR.
 */
export function selectivelyMergeOcrScaleFacts<T extends SelectiveOcrScaleFact>(
  primaryFacts: T[],
  secondaryFacts: T[],
): SelectiveOcrScaleMergeResult & { facts: T[] } {
  const primaryBySlot = groupBySlot(primaryFacts);
  const secondaryBySlot = groupBySlot(secondaryFacts);
  const selectedBySlot = groupBySlot(primaryFacts);
  const anchoredRows = new Set(primaryFacts.map(rowKey));
  const stats: SelectiveOcrScaleMergeStats = {
    secondaryFactsConsidered: secondaryFacts.length,
    replacedTruncatedSlots: 0,
    addedSiblingYearSlots: 0,
    skippedConflictingSlots: 0,
    skippedUnanchoredSlots: 0,
  };

  for (const [key, secondarySlotFacts] of secondaryBySlot) {
    const primarySlotFacts = primaryBySlot.get(key);
    if (!primarySlotFacts) continue;
    if (!hasSingleDistinctValue(primarySlotFacts) || !hasSingleDistinctValue(secondarySlotFacts)) {
      const repair = findSingleLeadingGroupRepair({
        primaryFacts: primarySlotFacts,
        secondaryFacts: secondarySlotFacts,
      });
      if (repair) {
        selectedBySlot.set(
          key,
          [
            ...primarySlotFacts.filter(
              (fact) => stringValue(fact.value) !== stringValue(repair.primary.value),
            ),
            repair.secondary,
          ],
        );
        anchoredRows.add(rowKey(repair.secondary));
        stats.replacedTruncatedSlots += 1;
        continue;
      }
      stats.skippedConflictingSlots += 1;
      continue;
    }

    const primaryFact = primarySlotFacts[0]!;
    const secondaryFact = secondarySlotFacts[0]!;
    if (stringValue(primaryFact.value) === stringValue(secondaryFact.value)) continue;

    if (
      isLikelyMissingLeadingGroupRepair(primaryFact.value, secondaryFact.value) ||
      isLikelySingleDigitOcrRepair(primaryFact.value, secondaryFact.value) ||
      isLikelyDroppedNonZeroRepair(primaryFact.value, secondaryFact.value)
    ) {
      selectedBySlot.set(key, [secondaryFact]);
      anchoredRows.add(rowKey(secondaryFact));
      stats.replacedTruncatedSlots += 1;
    } else {
      stats.skippedConflictingSlots += 1;
    }
  }

  for (const [key, secondarySlotFacts] of secondaryBySlot) {
    if (selectedBySlot.has(key)) continue;
    if (!hasSingleDistinctValue(secondarySlotFacts)) {
      stats.skippedConflictingSlots += 1;
      continue;
    }

    const secondaryFact = secondarySlotFacts[0]!;
    if (!anchoredRows.has(rowKey(secondaryFact))) {
      stats.skippedUnanchoredSlots += secondarySlotFacts.length;
      continue;
    }
    if (!isPlausibleMissingSiblingValue(secondaryFact)) {
      stats.skippedConflictingSlots += 1;
      continue;
    }

    selectedBySlot.set(key, [secondaryFact]);
    stats.addedSiblingYearSlots += 1;
  }

  return {
    facts: dedupeFacts([...selectedBySlot.values()].flat()),
    stats,
  };
}
