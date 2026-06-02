import { prisma } from "@/lib/prisma";
import {
  CanonicalMetricLayoutEntry,
  LiabilitySection,
  MetricLayoutGroup,
  MetricNodeType,
  canonicalMetricLayout,
  liabilitySectionForMetricKey,
  requiredPublishMetricKeys,
} from "@/integrations/brreg/annual-report-financials/taxonomy";

// ---------------------------------------------------------------------------
// Canonical-key registry.
//
// The single source of truth for the canonical keys' identity, display metadata,
// layout position and publish-gating flag. Seeded from the code skeleton
// (canonicalMetricLayout + requiredPublishMetricKeys) into the `CanonicalKey`
// table. Once seeded, the table is authoritative — a rename in the admin hub
// updates a row's `key`, so no code constant is left referencing the old name.
//
// Every reader here falls back to the in-code skeleton while the table is still
// empty, so the app (and tests/scripts) keep working before the first seed.
// ---------------------------------------------------------------------------

export type CanonicalRegistryEntry = {
  key: string;
  label: string;
  family: "INCOME_STATEMENT" | "BALANCE_SHEET";
  group: MetricLayoutGroup;
  nodeType: MetricNodeType;
  liabilitySection: LiabilitySection | null;
  isRequired: boolean;
  sortOrder: number;
};

/** The in-code skeleton projected into registry-entry shape (the seed + fallback). */
export function codeRegistryEntries(): CanonicalRegistryEntry[] {
  const requiredSet = new Set<string>(requiredPublishMetricKeys);
  return canonicalMetricLayout.map((entry: CanonicalMetricLayoutEntry, index) => ({
    key: entry.key,
    label: entry.label,
    family: entry.family,
    group: entry.group,
    nodeType: entry.nodeType,
    liabilitySection: liabilitySectionForMetricKey(entry.key),
    isRequired: requiredSet.has(entry.key),
    sortOrder: index,
  }));
}

/**
 * Load the canonical-key registry, ordered for display. Reads the DB table when
 * populated; otherwise returns the in-code skeleton so the app keeps working
 * before the first seed.
 */
export async function loadCanonicalRegistry(): Promise<CanonicalRegistryEntry[]> {
  const rows = await prisma.canonicalKey.findMany({ orderBy: { sortOrder: "asc" } });
  if (rows.length === 0) {
    return codeRegistryEntries();
  }
  return rows.map((row) => ({
    key: row.key,
    label: row.label,
    family: row.family === "BALANCE_SHEET" ? "BALANCE_SHEET" : "INCOME_STATEMENT",
    group: row.layoutGroup as MetricLayoutGroup,
    nodeType:
      row.nodeType === "subtotal"
        ? "subtotal"
        : row.nodeType === "total"
          ? "total"
          : "line",
    liabilitySection:
      row.liabilitySection === "LONG_TERM"
        ? "LONG_TERM"
        : row.liabilitySection === "CURRENT"
          ? "CURRENT"
          : null,
    isRequired: row.isRequired,
    sortOrder: row.sortOrder,
  }));
}

/** The publish-required keys, DB-backed with code fallback. */
export async function loadRequiredPublishMetricKeys(): Promise<string[]> {
  const registry = await loadCanonicalRegistry();
  return registry.filter((e) => e.isRequired).map((e) => e.key);
}

/** Seed the registry from the in-code skeleton when empty. Idempotent — does
 *  nothing once any row exists. Returns the number of rows inserted. */
export async function seedCanonicalRegistry(): Promise<number> {
  const existing = await prisma.canonicalKey.count();
  if (existing > 0) return 0;
  const entries = codeRegistryEntries();
  await prisma.canonicalKey.createMany({
    data: entries.map((e) => ({
      key: e.key,
      label: e.label,
      family: e.family,
      layoutGroup: e.group,
      nodeType: e.nodeType,
      liabilitySection: e.liabilitySection,
      isRequired: e.isRequired,
      sortOrder: e.sortOrder,
    })),
    skipDuplicates: true,
  });
  return entries.length;
}
