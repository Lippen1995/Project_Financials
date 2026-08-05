import { prisma } from "@/lib/prisma";
import {
  getStatementTypeForMetricKey,
  liabilitySectionForMetricKey,
} from "@/server/financials/canonical-taxonomy";
import { loadCanonicalRegistry } from "@/server/services/canonical-registry-service";

// ---------------------------------------------------------------------------
// Canonical-key administration hub.
//
// The set of canonical keys is the union of:
//   1. the canonical registry (CanonicalKey) — the well-known skeleton, and
//   2. every metricKey observed in FinancialLineItem.
//
// The substrate is FinancialLineItem, not the PDF/OCR fact tables. Those are
// being retired, and their 218 + 379 distinct keys were largely extraction
// artifacts — typos, fused labels, one-off headings — rather than accounting
// concepts. Line items come from Brreg and will carry the paid K2 delivery.
//
// Management operations mutate line items directly, so a rename/merge/move
// applies to every affected company at once. metricKey is not part of any
// uniqueness constraint on FinancialLineItem, so a reassign is a plain bulk
// update: several source lines legitimately mapping to one standardised key is
// the normal case once K2 line items arrive, not a collision to resolve.
// Deletion is only allowed when no line item uses the key any longer.
// ---------------------------------------------------------------------------

export class CanonicalKeyError extends Error {}

export type CanonicalKeyFamily = "INCOME_STATEMENT" | "BALANCE_SHEET";

export type CanonicalKeyUsage = {
  key: string;
  label: string;
  family: CanonicalKeyFamily;
  /**
   * True when `family` is authoritative: a registry key (family from the
   * registry) or a custom key whose family a reviewer set explicitly. False
   * when `family` is only a guess derived from the facts' statementType — which
   * is unreliable for custom balance-detail keys. Consumers (e.g. the review
   * key-picker) can widen behaviour for unconfirmed keys.
   */
  familyConfirmed: boolean;
  /** Not part of the fixed code skeleton — created by a reviewer in manual review. */
  isCustom: boolean;
  /** One of the publish-required keys (renaming/deleting affects gating logic). */
  isRequired: boolean;
  /** Referenced by code (skeleton or required) — a rename here also needs a code change. */
  isCodeReferenced: boolean;
  /** Distinct companies with a line item on this key. */
  companyCount: number;
  /** Line-item rows carrying this key. */
  lineItemCount: number;
  /**
   * Distinct source labels mapped to this key. Zero for the free structured
   * feed, which arrives pre-mapped with no raw label. Once the paid K2
   * delivery lands this is the number that matters: how many different labels
   * the sources use for one standardised concept.
   */
  sourceLabelCount: number;
  /** Presentation node the key is assigned to, if any. */
  nodeId: string | null;
};

function humanizeKey(key: string): string {
  const cleaned = key.replace(/[_\s]+/g, " ").trim();
  if (!cleaned) return key;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function familyFromStatementType(statementType: string): CanonicalKeyFamily {
  return statementType === "BALANCE_SHEET" ? "BALANCE_SHEET" : "INCOME_STATEMENT";
}

/** One row per observed key, aggregated in the database. */
type KeyUsageRow = {
  metricKey: string;
  companyCount: number;
  lineItemCount: number;
  sourceLabelCount: number;
  statementType: string;
};

export async function getCanonicalKeyUsage(): Promise<CanonicalKeyUsage[]> {
  const [registry, usageRows, assignments, familyOverrides] = await Promise.all([
    loadCanonicalRegistry(),
    // Aggregated in Postgres rather than by pulling every line item: the
    // previous fact-table version fetched one row per (key, company) pair,
    // which is six figures of rows for an admin page that renders four numbers.
    prisma.$queryRawUnsafe<KeyUsageRow[]>(
      `SELECT "metricKey",
              COUNT(DISTINCT "companyId")::int   AS "companyCount",
              COUNT(*)::int                      AS "lineItemCount",
              COUNT(DISTINCT "sourceLabel")::int AS "sourceLabelCount",
              MIN("statementType"::text)         AS "statementType"
         FROM "FinancialLineItem"
        WHERE "metricKey" IS NOT NULL
        GROUP BY "metricKey"`,
    ),
    prisma.presentationNodeKey.findMany(),
    prisma.canonicalKeyFamilyOverride.findMany(),
  ]);

  const overrideByKey = new Map<string, CanonicalKeyFamily>(
    familyOverrides.map((o) => [
      o.metricKey,
      o.family === "BALANCE_SHEET" ? "BALANCE_SHEET" : "INCOME_STATEMENT",
    ]),
  );

  const usageByKey = new Map(usageRows.map((row) => [row.metricKey, row]));
  const familyByKey = new Map<string, CanonicalKeyFamily>(
    usageRows.map((row) => [row.metricKey, familyFromStatementType(row.statementType)]),
  );
  const nodeByKey = new Map(assignments.map((a) => [a.metricKey, a.nodeId]));

  const registryByKey = new Map(registry.map((e) => [e.key, e]));

  const build = (key: string): CanonicalKeyUsage => {
    const entry = registryByKey.get(key);
    const isCustom = !entry;
    const isRequired = entry?.isRequired ?? false;
    const overrideFamily = overrideByKey.get(key);
    // Registry family wins; then a reviewer's explicit override; then the
    // (unreliable) statementType-derived guess; finally a safe default.
    const family =
      entry?.family ?? overrideFamily ?? familyByKey.get(key) ?? "INCOME_STATEMENT";
    // A registry key's family is always authoritative; a custom key's only once
    // a reviewer has set it explicitly.
    const familyConfirmed = !isCustom || overrideFamily !== undefined;
    return {
      key,
      label: entry?.label ?? humanizeKey(key),
      family,
      familyConfirmed,
      isCustom,
      isRequired,
      // A registry (skeleton) key is referenced by code only as a seed/fallback;
      // required keys still gate publishing. Surfaced so the UI can flag that a
      // rename touches publish gating, even though it no longer needs a deploy.
      isCodeReferenced: !isCustom || isRequired,
      companyCount: usageByKey.get(key)?.companyCount ?? 0,
      lineItemCount: usageByKey.get(key)?.lineItemCount ?? 0,
      sourceLabelCount: usageByKey.get(key)?.sourceLabelCount ?? 0,
      nodeId: nodeByKey.get(key) ?? null,
    };
  };

  // Registry (skeleton) keys first, in layout order; then observed keys that
  // are not in the registry, by company count desc.
  const skeleton = registry.map((e) => build(e.key));
  const customKeys = [...usageByKey.keys()]
    .filter((k) => !registryByKey.has(k))
    .map(build)
    .sort((a, b) => b.companyCount - a.companyCount || a.key.localeCompare(b.key));

  return [...skeleton, ...customKeys];
}

/**
 * Set a key's statement family. For a registry key the family is updated on the
 * `CanonicalKey` row (authoritative source). For a custom key — which has no
 * registry row — the choice is persisted as a `CanonicalKeyFamilyOverride`,
 * making the family authoritative instead of the unreliable statementType-
 * derived guess. Idempotent.
 */
export async function setKeyFamily(input: {
  key: string;
  family: CanonicalKeyFamily;
}): Promise<void> {
  const key = input.key.trim();
  if (!key) throw new CanonicalKeyError("Mangler nøkkel.");
  if (input.family !== "INCOME_STATEMENT" && input.family !== "BALANCE_SHEET") {
    throw new CanonicalKeyError("Ugyldig familie.");
  }

  const registryRow = await prisma.canonicalKey.findUnique({ where: { key } });
  if (registryRow) {
    await prisma.canonicalKey.update({ where: { key }, data: { family: input.family } });
    return;
  }

  await prisma.canonicalKeyFamilyOverride.upsert({
    where: { metricKey: key },
    create: { metricKey: key, family: input.family },
    update: { family: input.family },
  });
}

/** Companies that currently use a given key, with display names. */
export async function getCompaniesForKey(
  key: string,
): Promise<{ companyId: string; name: string }[]> {
  const rows = await prisma.financialLineItem.findMany({
    where: { metricKey: key },
    distinct: ["companyId"],
    select: { companyId: true, company: { select: { name: true } } },
  });
  return rows
    .map((row) => ({ companyId: row.companyId, name: row.company?.name ?? row.companyId }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Move line items from one canonical key to another. With `companyIds` set,
 * only those companies are moved (a partial merge); otherwise every row of
 * `from` is moved (a full rename / merge). Applied to the line items, the
 * presentation-node assignment, AND the editable alias layer
 * (`MetricAlias.metricKey`) — so a rename also follows through to the mapping
 * and future ingestion emits the new key.
 *
 * metricKey is not part of any uniqueness constraint on FinancialLineItem, so
 * the line-item move is a plain bulk update with nothing to deduplicate. Two
 * source lines ending up on the same standardised key is the expected outcome
 * of a merge, and the normal shape of K2 data. The MetricAlias
 * @@unique([metricKey, normalizedAlias, liabilitySection]) collision is still
 * resolved by keeping the existing target row and dropping the duplicate
 * source. Alias + presentation moves only happen on a full rename, never on a
 * per-company partial merge (aliases are not company-scoped).
 */
export async function reassignCanonicalKey(input: {
  from: string;
  to: string;
  companyIds?: string[] | null;
}): Promise<{
  lineItemsMoved: number;
  aliasesMoved: number;
  aliasesDropped: number;
}> {
  const from = input.from;
  const to = input.to.trim();
  if (!from) throw new CanonicalKeyError("Mangler kildenøkkel.");
  if (!to) throw new CanonicalKeyError("Mangler målnøkkel.");
  if (from === to) throw new CanonicalKeyError("Kilde og mål er samme nøkkel.");

  const companyFilter =
    input.companyIds && input.companyIds.length > 0 ? input.companyIds : null;

  return prisma.$transaction(async (tx) => {
    // metricKey carries no uniqueness constraint — safe bulk update.
    const lineItems = await tx.financialLineItem.updateMany({
      where: {
        metricKey: from,
        ...(companyFilter ? { companyId: { in: companyFilter } } : {}),
      },
      data: { metricKey: to },
    });

    let aliasesMoved = 0;
    let aliasesDropped = 0;

    // Presentation assignment + alias rows move only on a full reassign — they
    // describe the key itself, not a per-company fact, so a partial merge leaves
    // them untouched.
    if (!companyFilter) {
      const fromAssign = await tx.presentationNodeKey.findUnique({
        where: { metricKey: from },
      });
      if (fromAssign) {
        const toAssign = await tx.presentationNodeKey.findUnique({
          where: { metricKey: to },
        });
        if (toAssign) {
          await tx.presentationNodeKey.delete({ where: { metricKey: from } });
        } else {
          await tx.presentationNodeKey.update({
            where: { metricKey: from },
            data: { metricKey: to },
          });
        }
      }

      // Editable alias layer: re-point every alias of `from` to `to` so the
      // extraction mapping follows the rename. The unique constraint is
      // [metricKey, normalizedAlias, liabilitySection]; the target's
      // liabilitySection differs only for the maturity-split keys, so collisions
      // are resolved per (normalizedAlias, liabilitySection) by keeping the
      // existing target row and dropping the duplicate source.
      const aliasSources = await tx.metricAlias.findMany({
        where: { metricKey: from },
        select: { id: true, normalizedAlias: true, liabilitySection: true },
      });
      if (aliasSources.length > 0) {
        const targetLiabilitySection = liabilitySectionForMetricKey(to);
        const existingTargetAliases = await tx.metricAlias.findMany({
          where: { metricKey: to },
          select: { normalizedAlias: true, liabilitySection: true },
        });
        const takenAlias = new Set(
          existingTargetAliases.map(
            (a) => `${a.normalizedAlias}|${a.liabilitySection ?? ""}`,
          ),
        );

        const aliasToUpdate: string[] = [];
        const aliasToDelete: string[] = [];
        for (const a of aliasSources) {
          // After the move the row's liabilitySection becomes the target key's.
          const slot = `${a.normalizedAlias}|${targetLiabilitySection ?? ""}`;
          if (takenAlias.has(slot)) {
            aliasToDelete.push(a.id);
          } else {
            takenAlias.add(slot);
            aliasToUpdate.push(a.id);
          }
        }

        if (aliasToUpdate.length > 0) {
          await tx.metricAlias.updateMany({
            where: { id: { in: aliasToUpdate } },
            data: {
              metricKey: to,
              statementFamily:
                getStatementTypeForMetricKey(to) ??
                getStatementTypeForMetricKey(from) ??
                "BALANCE_SHEET",
              liabilitySection: targetLiabilitySection,
            },
          });
          aliasesMoved = aliasToUpdate.length;
        }
        if (aliasToDelete.length > 0) {
          await tx.metricAlias.deleteMany({ where: { id: { in: aliasToDelete } } });
          aliasesDropped = aliasToDelete.length;
        }
      }

      // Registry: re-point the canonical-key identity itself. If `to` already
      // exists (a merge into another skeleton key) the source row is removed in
      // favour of the existing target; otherwise the source row is renamed,
      // keeping its layout/label/required metadata under the new key.
      const fromRegistry = await tx.canonicalKey.findUnique({ where: { key: from } });
      if (fromRegistry) {
        const toRegistry = await tx.canonicalKey.findUnique({ where: { key: to } });
        if (toRegistry) {
          await tx.canonicalKey.delete({ where: { key: from } });
        } else {
          await tx.canonicalKey.update({
            where: { key: from },
            data: { key: to },
          });
        }
      }

      // Custom-key family override follows the rename. If the target already has
      // one (a merge), keep it and drop the source's; otherwise re-point.
      const fromOverride = await tx.canonicalKeyFamilyOverride.findUnique({
        where: { metricKey: from },
      });
      if (fromOverride) {
        const toOverride = await tx.canonicalKeyFamilyOverride.findUnique({
          where: { metricKey: to },
        });
        if (toOverride) {
          await tx.canonicalKeyFamilyOverride.delete({ where: { metricKey: from } });
        } else {
          await tx.canonicalKeyFamilyOverride.update({
            where: { metricKey: from },
            data: { metricKey: to },
          });
        }
      }
    }

    return {
      lineItemsMoved: lineItems.count,
      aliasesMoved,
      aliasesDropped,
    };
  });
}

/** Delete a canonical key. Only permitted when no line item uses it any longer. */
export async function deleteCanonicalKey(key: string): Promise<void> {
  if (!key) throw new CanonicalKeyError("Mangler nøkkel.");
  const inUse = await prisma.financialLineItem.findFirst({
    where: { metricKey: key },
    select: { id: true },
  });
  if (inUse) {
    throw new CanonicalKeyError(
      "Kan ikke slette en nøkkel som fortsatt brukes. Flytt selskapene til en annen nøkkel først.",
    );
  }
  // No company uses the key any longer — drop its registry identity, node
  // assignment and any orphaned alias rows so nothing references it any more.
  await prisma.$transaction([
    prisma.canonicalKey.deleteMany({ where: { key } }),
    prisma.presentationNodeKey.deleteMany({ where: { metricKey: key } }),
    prisma.metricAlias.deleteMany({ where: { metricKey: key } }),
    prisma.canonicalKeyFamilyOverride.deleteMany({ where: { metricKey: key } }),
  ]);
}
