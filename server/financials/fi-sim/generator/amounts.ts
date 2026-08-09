/**
 * Integer money helpers for the FI-SIM generator.
 *
 * Every published figure is a BigInt in the statement's unit scale, so nothing here is allowed to
 * go through a float on the way out. Rates arrive as numbers from the assumption bands and are
 * turned into integer arithmetic immediately: BigInt division truncates toward zero, which is a
 * defined and reproducible rounding rather than whatever the platform's float rounding does today.
 */

const RATE_SCALE = 1_000_000n;

export function absolute(value: bigint) {
  return value < 0n ? -value : value;
}

export function largest(left: bigint, right: bigint) {
  return left > right ? left : right;
}

export function fromRate(value: bigint, rate: number) {
  return (value * BigInt(Math.round(rate * Number(RATE_SCALE)))) / RATE_SCALE;
}

export function fromNumber(value: number) {
  return BigInt(Math.round(value));
}

export type WeightedConcept = { conceptKey: string; weight: number };

/**
 * Splits `total` across weighted concepts so the parts sum to `total` exactly.
 *
 * The last concept absorbs the rounding remainder. That is a deliberate choice over spreading it:
 * a remainder spread across lines is a rounding difference hiding in several plausible numbers,
 * and spec section 10 forbids exactly that. Concepts are sorted by key first so the absorbing line
 * does not depend on the order the caller happened to build its list in.
 */
export function distribute(
  total: bigint,
  weights: readonly WeightedConcept[],
): Map<string, bigint> {
  const positive = [...weights]
    .filter((entry) => entry.weight > 0)
    .sort((left, right) => left.conceptKey.localeCompare(right.conceptKey));
  const result = new Map<string, bigint>();
  if (positive.length === 0) return result;

  const weightTotal = positive.reduce((sum, entry) => sum + entry.weight, 0);
  let assigned = 0n;
  positive.forEach((entry, index) => {
    if (index === positive.length - 1) {
      result.set(entry.conceptKey, total - assigned);
      return;
    }
    const value = fromRate(total, entry.weight / weightTotal);
    result.set(entry.conceptKey, value);
    assigned += value;
  });
  return result;
}

/**
 * Tolerances from spec section 10, computed per identity rather than per statement, because a
 * tolerance proportional to the largest total on the statement would wave through a real error on
 * a small one.
 */
export function identityTolerances(parentTotal: bigint, unitScale: number) {
  const magnitude = absolute(parentTotal);
  return {
    rounding: largest(BigInt(2 * unitScale), magnitude / 10_000n),
    review: largest(BigInt(10 * unitScale), magnitude / 1_000n),
  };
}
