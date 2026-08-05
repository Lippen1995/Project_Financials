import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { normalizeNorwegianText } from "@/lib/norwegian-text";
import {
  CanonicalMetricKey,
  LiabilitySection,
  MetricDefinition,
  MetricLayoutGroup,
  MetricNodeType,
  defaultMetricDefinitions,
  metricLayoutGroupLabels,
} from "@/server/financials/canonical-taxonomy";
import {
  CanonicalRegistryEntry,
  loadCanonicalRegistry,
} from "@/server/services/canonical-registry-service";

// ---------------------------------------------------------------------------
// UI model
// ---------------------------------------------------------------------------

export type MetricMappingNode = {
  /** Canonical key id — a registry (skeleton) key, after any admin rename. */
  key: string;
  label: string;
  family: "INCOME_STATEMENT" | "BALANCE_SHEET";
  group: MetricLayoutGroup;
  groupLabel: string;
  nodeType: MetricNodeType;
  isRequired: boolean;
  aliasCount: number;
};

export type MetricMappingAlias = {
  id: string;
  alias: string;
  normalizedAlias: string;
  metricKey: string;
  statementFamily: string;
  liabilitySection: string | null;
};

export type MetricMappingModel = {
  metrics: MetricMappingNode[];
  aliases: MetricMappingAlias[];
  groupLabels: Record<MetricLayoutGroup, string>;
};

// ---------------------------------------------------------------------------
// Runtime: load the editable alias mapping for the extraction layer.
// Falls back to the built-in defaults while the table is still empty so the
// pipeline keeps working before the first seed.
// ---------------------------------------------------------------------------

export async function loadMetricDefinitions(): Promise<MetricDefinition[]> {
  const rows = await prisma.metricAlias.findMany({
    where: { isActive: true },
    select: {
      metricKey: true,
      alias: true,
      statementFamily: true,
      liabilitySection: true,
    },
  });

  if (rows.length === 0) {
    return defaultMetricDefinitions;
  }

  const byDefinition = new Map<string, MetricDefinition>();
  for (const row of rows) {
    const liabilitySection = (row.liabilitySection as LiabilitySection | null) ?? undefined;
    const groupKey = `${row.metricKey}::${liabilitySection ?? ""}`;
    let definition = byDefinition.get(groupKey);
    if (!definition) {
      definition = {
        key: row.metricKey as CanonicalMetricKey,
        statementFamily: row.statementFamily as MetricDefinition["statementFamily"],
        aliases: [],
        ...(liabilitySection ? { liabilitySection } : {}),
      };
      byDefinition.set(groupKey, definition);
    }
    definition.aliases.push(row.alias);
  }

  return [...byDefinition.values()];
}

// ---------------------------------------------------------------------------
// Admin UI: build the full graph model
// ---------------------------------------------------------------------------

export async function buildMetricMappingModel(): Promise<MetricMappingModel> {
  const [rows, registry] = await Promise.all([
    prisma.metricAlias.findMany({
      where: { isActive: true },
      orderBy: { alias: "asc" },
      select: {
        id: true,
        alias: true,
        normalizedAlias: true,
        metricKey: true,
        statementFamily: true,
        liabilitySection: true,
      },
    }),
    loadCanonicalRegistry(),
  ]);

  const aliasCountByKey = new Map<string, number>();
  for (const row of rows) {
    aliasCountByKey.set(row.metricKey, (aliasCountByKey.get(row.metricKey) ?? 0) + 1);
  }

  const metrics: MetricMappingNode[] = registry.map((entry) => ({
    key: entry.key,
    label: entry.label,
    family: entry.family,
    group: entry.group,
    groupLabel: metricLayoutGroupLabels[entry.group],
    nodeType: entry.nodeType,
    isRequired: entry.isRequired,
    aliasCount: aliasCountByKey.get(entry.key) ?? 0,
  }));

  const aliases: MetricMappingAlias[] = rows.map((row) => ({
    id: row.id,
    alias: row.alias,
    normalizedAlias: row.normalizedAlias,
    metricKey: row.metricKey,
    statementFamily: row.statementFamily,
    liabilitySection: row.liabilitySection,
  }));

  return { metrics, aliases, groupLabels: metricLayoutGroupLabels };
}

// ---------------------------------------------------------------------------
// Admin UI: mutations. statementFamily and liabilitySection are always derived
// from the (fixed) canonical key, never supplied by the client.
// ---------------------------------------------------------------------------

export class MetricAliasConflictError extends Error {}

/** Resolve a metric key against the canonical-key registry, deriving the alias's
 *  statementFamily and liabilitySection from the registry entry. Rejects keys
 *  that are not in the registry (typos / removed keys). */
async function resolveRegistryFields(metricKey: string): Promise<{
  statementFamily: CanonicalRegistryEntry["family"];
  liabilitySection: LiabilitySection | null;
}> {
  const registry = await loadCanonicalRegistry();
  const entry = registry.find((e) => e.key === metricKey);
  if (!entry) {
    throw new Error(`Ukjent regnskapsnøkkel: ${metricKey}`);
  }
  return {
    statementFamily: entry.family,
    liabilitySection: entry.liabilitySection,
  };
}

function normalizeAliasInput(rawAlias: string) {
  const alias = rawAlias.trim();
  if (!alias) {
    throw new Error("Alias kan ikke være tom");
  }
  const normalizedAlias = normalizeNorwegianText(alias);
  if (!normalizedAlias) {
    throw new Error("Alias normaliseres til en tom streng");
  }
  return { alias, normalizedAlias };
}

export async function createAlias(input: {
  alias: string;
  metricKey: string;
  userId?: string | null;
}) {
  const { alias, normalizedAlias } = normalizeAliasInput(input.alias);
  const { statementFamily, liabilitySection } = await resolveRegistryFields(
    input.metricKey,
  );

  try {
    return await prisma.metricAlias.create({
      data: {
        metricKey: input.metricKey,
        alias,
        normalizedAlias,
        statementFamily,
        liabilitySection,
        createdByUserId: input.userId ?? null,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new MetricAliasConflictError(
        "Dette aliaset er allerede koblet til denne nøkkelen",
      );
    }
    throw error;
  }
}

export async function updateAlias(input: {
  id: string;
  alias?: string;
  metricKey?: string;
}) {
  const data: Prisma.MetricAliasUpdateInput = {};

  if (input.alias !== undefined) {
    const { alias, normalizedAlias } = normalizeAliasInput(input.alias);
    data.alias = alias;
    data.normalizedAlias = normalizedAlias;
  }

  if (input.metricKey !== undefined) {
    const { statementFamily, liabilitySection } = await resolveRegistryFields(
      input.metricKey,
    );
    data.metricKey = input.metricKey;
    data.statementFamily = statementFamily;
    data.liabilitySection = liabilitySection;
  }

  try {
    return await prisma.metricAlias.update({ where: { id: input.id }, data });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new MetricAliasConflictError(
        "Dette aliaset er allerede koblet til denne nøkkelen",
      );
    }
    throw error;
  }
}

export async function deleteAlias(id: string) {
  await prisma.metricAlias.delete({ where: { id } });
}
