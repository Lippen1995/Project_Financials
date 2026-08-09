import { normalizeNorwegianText } from "@/lib/norwegian-text";
import type { LiabilitySection } from "@/server/financials/canonical-taxonomy";
import type { CanonicalRegistryEntry } from "@/server/services/canonical-registry-service";

/**
 * The shared mapping engine.
 *
 * Normalisation and canonical-key matching are the two decisions that must be identical whether
 * a mapping is being made against reported figures or a simulated dataset. Keeping them here, as
 * pure functions over injected inputs, is what makes that guarantee testable: the reported and
 * simulated stores differ in where a mapping is written, never in what the mapping means.
 *
 * Nothing in this module may touch Prisma, the active dataset, or the environment. A caller
 * resolves the registry and the store; the engine only decides.
 */

export class MappingInputError extends Error {}

export class UnknownMetricKeyError extends MappingInputError {}

export type NormalizedAlias = {
  /** The alias as a reviewer typed it, trimmed. Shown back to humans. */
  alias: string;
  /** The comparison form. Two aliases collide when these are equal. */
  normalizedAlias: string;
};

export type ResolvedRegistryFields = {
  statementFamily: CanonicalRegistryEntry["family"];
  liabilitySection: LiabilitySection | null;
};

/**
 * Reduce a reviewer's alias to its stored and comparison forms.
 *
 * Throws rather than returning an empty result: an alias that normalises away carries no
 * matching power, and storing it would create a row that can never match anything while still
 * occupying the uniqueness constraint.
 */
export function normalizeAlias(rawAlias: string): NormalizedAlias {
  const alias = rawAlias.trim();
  if (!alias) {
    throw new MappingInputError("Alias kan ikke være tom");
  }
  const normalizedAlias = normalizeNorwegianText(alias);
  if (!normalizedAlias) {
    throw new MappingInputError("Alias normaliseres til en tom streng");
  }
  return { alias, normalizedAlias };
}

/**
 * Resolve a metric key against the canonical registry, deriving the fields an alias stores
 * alongside it. Keys absent from the registry are rejected, which is what catches typos and
 * keys removed by a taxonomy change before they reach a store.
 */
export function resolveRegistryFields(
  metricKey: string,
  registry: readonly CanonicalRegistryEntry[],
): ResolvedRegistryFields {
  const entry = registry.find((candidate) => candidate.key === metricKey);
  if (!entry) {
    throw new UnknownMetricKeyError(`Ukjent regnskapsnøkkel: ${metricKey}`);
  }
  return {
    statementFamily: entry.family,
    liabilitySection: entry.liabilitySection,
  };
}

/**
 * Everything a store needs to persist one alias, decided without reference to which store that
 * is. Both the reported and simulated mapping paths build their row from this.
 */
export function buildAliasMapping(
  input: { alias: string; metricKey: string },
  registry: readonly CanonicalRegistryEntry[],
): NormalizedAlias & ResolvedRegistryFields & { metricKey: string } {
  const { alias, normalizedAlias } = normalizeAlias(input.alias);
  const { statementFamily, liabilitySection } = resolveRegistryFields(input.metricKey, registry);

  return { alias, normalizedAlias, metricKey: input.metricKey, statementFamily, liabilitySection };
}
