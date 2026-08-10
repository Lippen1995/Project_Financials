import { prisma } from "@/lib/prisma";
import { mappingStore } from "@/server/financials/mapping/mapping-store";
import {
  CanonicalMetricKey,
  LiabilitySection,
  MetricDefinition,
  MetricLayoutGroup,
  MetricNodeType,
  defaultMetricDefinitions,
  metricLayoutGroupLabels,
} from "@/server/financials/canonical-taxonomy";
import { loadCanonicalRegistry } from "@/server/services/canonical-registry-service";

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

/**
 * Alias mutations are delegated to the mapping store, which routes the write to the store that
 * matches the dataset currently being read. Reads still come from LIVE; only the destination of
 * a reviewer decision varies, so mapping done during a demo cannot change a reported alias.
 */
export { MetricAliasConflictError } from "@/server/financials/mapping/mapping-store";

export const createAlias = mappingStore.createAlias;
export const updateAlias = mappingStore.updateAlias;
export const deleteAlias = mappingStore.deleteAlias;
