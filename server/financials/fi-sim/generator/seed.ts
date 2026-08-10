import { createHash } from "node:crypto";

/**
 * Deterministic pseudo-randomness, from spec section 9.1.
 *
 * Same organisation number, period, scope, reported anchors and versions must give byte-identical
 * output. So there is no clock, no `Math.random`, and no process-global state here: every draw is
 * a pure function of a seed and a label.
 *
 * Labelling each draw rather than pulling from a counter-advanced stream is what makes the output
 * survive its own source code. With a counter, inserting one new draw shifts every later value and
 * silently rewrites the whole demo dataset; with labels, a new draw only produces a new value.
 */

const HEX_DIGITS = 8;
const HEX_RANGE = 0x1_0000_0000;

/**
 * NUL cannot occur in an organisation number, concept key, version string or draw label, so
 * ["ab", "c"] and ["a", "bc"] cannot hash to the same seed.
 */
const FIELD_SEPARATOR = String.fromCharCode(0);

function digest(parts: readonly string[]) {
  const hash = createHash("sha256");
  hash.update(parts.join(FIELD_SEPARATOR));
  return hash.digest("hex");
}

export type FiSimSeedVersions = {
  taxonomyVersion: string;
  profileVersion: string;
  assumptionVersion: string;
  generatorVersion: string;
};

/**
 * The frozen anchor set, hashed. Reported anchors are part of the seed because a company whose
 * reported figures changed is a different generation input, and its simulated detail should not
 * silently keep the shape it had under the old anchors.
 */
export function anchorDigest(
  anchors: ReadonlyArray<{
    fiscalYear: number;
    conceptKey: string;
    reportedFinancialLineItemId: string;
    value: bigint;
  }>,
) {
  const canonical = [...anchors]
    .map((anchor) =>
      [
        anchor.fiscalYear.toString(),
        anchor.conceptKey,
        anchor.reportedFinancialLineItemId,
        anchor.value.toString(),
      ].join(FIELD_SEPARATOR),
    )
    .sort();
  return digest(canonical);
}

export function companySeed(input: {
  orgNumber: string;
  statementScope: string;
  versions: FiSimSeedVersions;
  anchorDigest: string;
}) {
  return digest([
    input.orgNumber,
    input.statementScope,
    input.versions.taxonomyVersion,
    input.versions.profileVersion,
    input.versions.assumptionVersion,
    input.versions.generatorVersion,
    input.anchorDigest,
  ]);
}

export function fiscalYearSeed(seed: string, fiscalYear: number) {
  return digest([seed, fiscalYear.toString()]);
}

export type FiSimValueStream = {
  /** A value in [0, 1) for this label. Always the same value for the same seed and label. */
  unit(label: string): number;
  /** A value in [min, max) for this label. */
  between(label: string, min: number, max: number): number;
  /** True with probability `probability`. Used for "does this company publish this line". */
  chance(label: string, probability: number): boolean;
};

export function createValueStream(seed: string): FiSimValueStream {
  function unit(label: string) {
    const hex = digest([seed, label]).slice(0, HEX_DIGITS);
    return Number.parseInt(hex, 16) / HEX_RANGE;
  }

  return {
    unit,
    between(label, min, max) {
      return min + unit(label) * (max - min);
    },
    chance(label, probability) {
      return unit(label) < probability;
    },
  };
}
