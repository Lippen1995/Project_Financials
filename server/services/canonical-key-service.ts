import { prisma } from "@/lib/prisma";
import {
  getStatementTypeForMetricKey,
  liabilitySectionForMetricKey,
} from "@/integrations/brreg/annual-report-financials/taxonomy";
import { loadCanonicalRegistry } from "@/server/services/canonical-registry-service";

// ---------------------------------------------------------------------------
// Canonical-key administration hub.
//
// The set of canonical keys is the union of:
//   1. the fixed code skeleton (canonicalMetricLayout) — well-known keys, and
//   2. every metricKey a reviewer has ever persisted in the fact tables.
//
// Management operations here mutate the underlying financial fact rows directly
// (financialFact + annualReportReviewedFact), so a rename/merge/move is applied
// to all affected companies automatically. Deletion is only allowed when no
// company uses the key any longer.
// ---------------------------------------------------------------------------

export class CanonicalKeyError extends Error {}

export type CanonicalKeyFamily = "INCOME_STATEMENT" | "BALANCE_SHEET";

export type CanonicalKeyUsage = {
  key: string;
  label: string;
  family: CanonicalKeyFamily;
  /** Not part of the fixed code skeleton — created by a reviewer in manual review. */
  isCustom: boolean;
  /** One of the publish-required keys (renaming/deleting affects gating logic). */
  isRequired: boolean;
  /** Referenced by code (skeleton or required) — a rename here also needs a code change. */
  isCodeReferenced: boolean;
  /** Distinct companies using the key across both fact tables. */
  companyCount: number;
  /** Fact rows in financialFact (machine-extracted). */
  machineFactCount: number;
  /** Fact rows in annualReportReviewedFact (manual review). */
  reviewedFactCount: number;
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

export async function getCanonicalKeyUsage(): Promise<CanonicalKeyUsage[]> {
  const [registry, reviewedPairs, machinePairs, reviewedCounts, machineCounts, assignments] =
    await Promise.all([
      loadCanonicalRegistry(),
      prisma.annualReportReviewedFact.findMany({
        distinct: ["metricKey", "companyId"],
        select: { metricKey: true, companyId: true, statementType: true },
      }),
      prisma.financialFact.findMany({
        distinct: ["metricKey", "companyId"],
        select: { metricKey: true, companyId: true, statementType: true },
      }),
      prisma.annualReportReviewedFact.groupBy({
        by: ["metricKey"],
        _count: { _all: true },
      }),
      prisma.financialFact.groupBy({ by: ["metricKey"], _count: { _all: true } }),
      prisma.presentationNodeKey.findMany(),
    ]);

  const companiesByKey = new Map<string, Set<string>>();
  const familyByKey = new Map<string, CanonicalKeyFamily>();
  for (const row of [...reviewedPairs, ...machinePairs]) {
    let set = companiesByKey.get(row.metricKey);
    if (!set) {
      set = new Set();
      companiesByKey.set(row.metricKey, set);
    }
    set.add(row.companyId);
    if (!familyByKey.has(row.metricKey)) {
      familyByKey.set(row.metricKey, familyFromStatementType(row.statementType));
    }
  }

  const reviewedCountByKey = new Map(
    reviewedCounts.map((c) => [c.metricKey, c._count._all]),
  );
  const machineCountByKey = new Map(
    machineCounts.map((c) => [c.metricKey, c._count._all]),
  );
  const nodeByKey = new Map(assignments.map((a) => [a.metricKey, a.nodeId]));

  const registryByKey = new Map(registry.map((e) => [e.key, e]));

  const build = (key: string): CanonicalKeyUsage => {
    const entry = registryByKey.get(key);
    const isCustom = !entry;
    const isRequired = entry?.isRequired ?? false;
    return {
      key,
      label: entry?.label ?? humanizeKey(key),
      family: entry?.family ?? familyByKey.get(key) ?? "INCOME_STATEMENT",
      isCustom,
      isRequired,
      // A registry (skeleton) key is referenced by code only as a seed/fallback;
      // required keys still gate publishing. Surfaced so the UI can flag that a
      // rename touches publish gating, even though it no longer needs a deploy.
      isCodeReferenced: !isCustom || isRequired,
      companyCount: companiesByKey.get(key)?.size ?? 0,
      machineFactCount: machineCountByKey.get(key) ?? 0,
      reviewedFactCount: reviewedCountByKey.get(key) ?? 0,
      nodeId: nodeByKey.get(key) ?? null,
    };
  };

  // Registry (skeleton) keys first, in layout order; then custom keys by company
  // count desc.
  const skeleton = registry.map((e) => build(e.key));
  const customKeys = [...companiesByKey.keys()]
    .filter((k) => !registryByKey.has(k))
    .map(build)
    .sort((a, b) => b.companyCount - a.companyCount || a.key.localeCompare(b.key));

  return [...skeleton, ...customKeys];
}

/** Companies that currently use a given key, with display names. */
export async function getCompaniesForKey(
  key: string,
): Promise<{ companyId: string; name: string }[]> {
  const [reviewed, machine] = await Promise.all([
    prisma.annualReportReviewedFact.findMany({
      where: { metricKey: key },
      distinct: ["companyId"],
      select: { companyId: true, company: { select: { name: true } } },
    }),
    prisma.financialFact.findMany({
      where: { metricKey: key },
      distinct: ["companyId"],
      select: { companyId: true, company: { select: { name: true } } },
    }),
  ]);
  const byId = new Map<string, string>();
  for (const row of [...reviewed, ...machine]) {
    byId.set(row.companyId, row.company?.name ?? row.companyId);
  }
  return [...byId.entries()]
    .map(([companyId, name]) => ({ companyId, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Move fact rows from one canonical key to another. With `companyIds` set, only
 * those companies are moved (a partial merge); otherwise every row of `from` is
 * moved (a full rename / merge). Applied to both fact tables, the
 * presentation-node assignment, AND the editable alias layer
 * (`MetricAlias.metricKey`) — so a rename also follows through to the extraction
 * mapping and future filings emit the new key. Handles the AnnualReportReviewedFact
 * @@unique([reviewId, metricKey, statementScope]) collision by dropping the
 * duplicate source row in favour of the existing target row, and the
 * MetricAlias @@unique([metricKey, normalizedAlias, liabilitySection]) collision
 * the same way. Alias + presentation moves only happen on a full rename, never on
 * a per-company partial merge (aliases are not company-scoped).
 */
export async function reassignCanonicalKey(input: {
  from: string;
  to: string;
  companyIds?: string[] | null;
}): Promise<{
  machineFactsMoved: number;
  reviewedFactsMoved: number;
  reviewedFactsDropped: number;
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
    // financialFact has no metricKey uniqueness — safe bulk update.
    const machine = await tx.financialFact.updateMany({
      where: {
        metricKey: from,
        ...(companyFilter ? { companyId: { in: companyFilter } } : {}),
      },
      data: { metricKey: to },
    });

    // annualReportReviewedFact: unique [reviewId, metricKey, statementScope].
    const sources = await tx.annualReportReviewedFact.findMany({
      where: {
        metricKey: from,
        ...(companyFilter ? { companyId: { in: companyFilter } } : {}),
      },
      select: { id: true, reviewId: true, statementScope: true },
    });

    let reviewedFactsMoved = 0;
    let reviewedFactsDropped = 0;

    if (sources.length > 0) {
      const reviewIds = [...new Set(sources.map((s) => s.reviewId))];
      const existingTargets = await tx.annualReportReviewedFact.findMany({
        where: { metricKey: to, reviewId: { in: reviewIds } },
        select: { reviewId: true, statementScope: true },
      });
      const taken = new Set(
        existingTargets.map((t) => `${t.reviewId}|${t.statementScope}`),
      );

      const toUpdate: string[] = [];
      const toDelete: string[] = [];
      for (const s of sources) {
        const slot = `${s.reviewId}|${s.statementScope}`;
        if (taken.has(slot)) {
          toDelete.push(s.id);
        } else {
          taken.add(slot);
          toUpdate.push(s.id);
        }
      }

      if (toUpdate.length > 0) {
        await tx.annualReportReviewedFact.updateMany({
          where: { id: { in: toUpdate } },
          data: { metricKey: to },
        });
        reviewedFactsMoved = toUpdate.length;
      }
      if (toDelete.length > 0) {
        await tx.annualReportReviewedFact.deleteMany({
          where: { id: { in: toDelete } },
        });
        reviewedFactsDropped = toDelete.length;
      }
    }

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
    }

    return {
      machineFactsMoved: machine.count,
      reviewedFactsMoved,
      reviewedFactsDropped,
      aliasesMoved,
      aliasesDropped,
    };
  });
}

/** Delete a canonical key. Only permitted when no company uses it any longer. */
export async function deleteCanonicalKey(key: string): Promise<void> {
  if (!key) throw new CanonicalKeyError("Mangler nøkkel.");
  const [machine, reviewed] = await Promise.all([
    prisma.financialFact.findFirst({ where: { metricKey: key }, select: { id: true } }),
    prisma.annualReportReviewedFact.findFirst({
      where: { metricKey: key },
      select: { id: true },
    }),
  ]);
  if (machine || reviewed) {
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
  ]);
}
