import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  buildAliasMapping,
  normalizeAlias,
  resolveRegistryFields,
} from "@/server/financials/mapping/mapping-engine";
import {
  loadCanonicalRegistry,
  type CanonicalRegistryEntry,
} from "@/server/services/canonical-registry-service";

/**
 * Where a mapping decision is written.
 *
 * Reads always come from the live views, which resolve whichever dataset is active. Writes
 * cannot: a view is not writable, so a reviewer's alias has to land in a table. Which table is
 * decided here, by the same fail-closed resolution the read views use — if mapping wrote to the
 * simulated store while reads were still reported, a reviewer would be mapping against figures
 * nobody can see.
 *
 * The rule this protects is a stop criterion in the FI-SIM plan: mapping performed during an
 * investor demo must not be able to change a reported record.
 */

export type MappingTarget =
  | { kind: "reported" }
  | {
      kind: "simulated";
      datasetId: string;
      mappingRevision: bigint;
      taxonomyVersion: string;
    };

export class MappingTargetUnavailableError extends Error {}

export class MetricAliasConflictError extends Error {}

type LiveDatasetRow = { datasetMode: "reported" | "simulated" };

/**
 * Resolve the store that matches the dataset currently being read.
 *
 * The mode comes from live_financial_dataset_v1 rather than from ActiveFinancialDataset
 * directly, because the view is what applies the deployment-environment and feature-flag gates.
 * Reading the pointer straight would let a mapping write follow a dataset that the gates are
 * refusing to serve.
 */
export async function resolveActiveMappingTarget(): Promise<MappingTarget> {
  const [live] = await prisma.$queryRaw<LiveDatasetRow[]>`
    SELECT "datasetMode" FROM live_financial_dataset_v1
  `;

  if (!live || live.datasetMode === "reported") {
    return { kind: "reported" };
  }

  const pointer = await prisma.activeFinancialDataset.findUnique({
    where: { id: "global" },
    select: {
      simulatedDatasetId: true,
      mappingRevision: true,
      simulatedDataset: { select: { taxonomyVersion: true } },
    },
  });

  if (!pointer?.simulatedDatasetId || !pointer.simulatedDataset) {
    // The view said simulated but the pointer cannot supply a dataset. Refusing is the only
    // safe answer: falling back to the reported store would write demo mapping into real data.
    throw new MappingTargetUnavailableError(
      "Aktivt datasett er simulert, men peker ikke på et gyldig simulert datasett.",
    );
  }

  return {
    kind: "simulated",
    datasetId: pointer.simulatedDatasetId,
    mappingRevision: pointer.mappingRevision,
    taxonomyVersion: pointer.simulatedDataset.taxonomyVersion,
  };
}

function asConflict(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    throw new MetricAliasConflictError("Dette aliaset er allerede koblet til denne nøkkelen");
  }
  throw error;
}

export type CreateAliasInput = {
  alias: string;
  metricKey: string;
  userId?: string | null;
};

export function createMappingStore(
  loadRegistry: () => Promise<readonly CanonicalRegistryEntry[]> = loadCanonicalRegistry,
  resolveTarget: () => Promise<MappingTarget> = resolveActiveMappingTarget,
) {
  return {
    resolveTarget,

    async createAlias(input: CreateAliasInput) {
      const [registry, target] = await Promise.all([loadRegistry(), resolveTarget()]);
      const mapping = buildAliasMapping(input, registry);

      try {
        if (target.kind === "reported") {
          return await prisma.metricAlias.create({
            data: {
              metricKey: mapping.metricKey,
              alias: mapping.alias,
              normalizedAlias: mapping.normalizedAlias,
              statementFamily: mapping.statementFamily,
              liabilitySection: mapping.liabilitySection,
              createdByUserId: input.userId ?? null,
            },
          });
        }

        return await prisma.simulatedMetricAlias.create({
          data: {
            datasetId: target.datasetId,
            mappingRevision: target.mappingRevision,
            taxonomyVersion: target.taxonomyVersion,
            metricKey: mapping.metricKey,
            alias: mapping.alias,
            normalizedAlias: mapping.normalizedAlias,
            statementFamily: mapping.statementFamily,
            liabilitySection: mapping.liabilitySection,
            createdByUserId: input.userId ?? null,
          },
        });
      } catch (error) {
        asConflict(error);
      }
    },

    async updateAlias(input: { id: string; alias?: string; metricKey?: string }) {
      const target = await resolveTarget();
      const registry = input.metricKey === undefined ? [] : await loadRegistry();

      const data: {
        alias?: string;
        normalizedAlias?: string;
        metricKey?: string;
        statementFamily?: string;
        liabilitySection?: string | null;
      } = {};

      if (input.alias !== undefined) {
        const { alias, normalizedAlias } = normalizeAlias(input.alias);
        data.alias = alias;
        data.normalizedAlias = normalizedAlias;
      }
      if (input.metricKey !== undefined) {
        const fields = resolveRegistryFields(input.metricKey, registry);
        data.metricKey = input.metricKey;
        data.statementFamily = fields.statementFamily;
        data.liabilitySection = fields.liabilitySection;
      }

      try {
        if (target.kind === "reported") {
          return await prisma.metricAlias.update({
            where: { id: input.id },
            data: data as Prisma.MetricAliasUpdateInput,
          });
        }
        // Scoped to the active dataset and revision so a demo edit cannot reach another
        // dataset's mapping, even with a guessed id.
        const updated = await prisma.simulatedMetricAlias.updateMany({
          where: {
            id: input.id,
            datasetId: target.datasetId,
            mappingRevision: target.mappingRevision,
          },
          data,
        });
        if (updated.count === 0) {
          throw new MappingTargetUnavailableError("Aliaset finnes ikke i det aktive datasettet.");
        }
        return prisma.simulatedMetricAlias.findUniqueOrThrow({ where: { id: input.id } });
      } catch (error) {
        asConflict(error);
      }
    },

    async deleteAlias(id: string) {
      const target = await resolveTarget();
      if (target.kind === "reported") {
        await prisma.metricAlias.delete({ where: { id } });
        return;
      }
      const deleted = await prisma.simulatedMetricAlias.deleteMany({
        where: { id, datasetId: target.datasetId, mappingRevision: target.mappingRevision },
      });
      if (deleted.count === 0) {
        throw new MappingTargetUnavailableError("Aliaset finnes ikke i det aktive datasettet.");
      }
    },
  };
}

export const mappingStore = createMappingStore();
