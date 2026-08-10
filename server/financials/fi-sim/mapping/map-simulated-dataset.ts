import type { PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { defaultMetricDefinitions } from "@/server/financials/canonical-taxonomy";
import { FI_SIM_CONCEPTS } from "../catalog/concepts";
import {
  decideSimulatedLineMapping,
  overlayDefinitions,
  summariseMappingCoverage,
  type SimulatedAliasOverlayEntry,
  type SimulatedLineMappingDecision,
  type SimulatedMappingCoverage,
} from "./simulated-line-mapping";

/**
 * Mapping an existing simulated dataset, from spec section 11.
 *
 * Mapping happens after validation, on purpose. A dataset is immutable once validated — but its
 * mapping is a separate append-only history, so the figures can be frozen while what they are
 * called goes on being corrected. That is also why nothing here updates or deletes: a correction
 * is a new revision, and the pointer decides which revision the product reads.
 */

const WRITE_CHUNK = 2_000;

export type SimulatedDatasetMappingResult = {
  datasetId: string;
  datasetVersion: string;
  mappingRevision: bigint;
  coverage: SimulatedMappingCoverage;
  written: number;
  dryRun: boolean;
};

type MappingClient = PrismaClient;

const labelByConcept = new Map(
  FI_SIM_CONCEPTS.map((concept) => [concept.conceptKey, concept.sourceLabel]),
);

function intentionallyUnmappedFrom(manifest: unknown): Set<string> {
  if (!manifest || typeof manifest !== "object") return new Set();
  const listed = (manifest as Record<string, unknown>).intentionallyUnmappedConcepts;
  if (!Array.isArray(listed)) return new Set();
  return new Set(listed.filter((entry): entry is string => typeof entry === "string"));
}

export async function mapSimulatedDataset(
  params: { datasetReference: string; dryRun: boolean; createdByUserId?: string },
  client: MappingClient = prisma,
): Promise<SimulatedDatasetMappingResult> {
  const dataset = await client.simulatedFinancialDataset.findFirst({
    where: {
      OR: [{ id: params.datasetReference }, { datasetVersion: params.datasetReference }],
    },
    select: { id: true, datasetVersion: true, status: true, manifest: true },
  });
  if (!dataset) {
    throw new Error(`Fant ikke simulert datasett ${params.datasetReference}.`);
  }
  if (dataset.status !== "VALIDATED") {
    // The database refuses the insert anyway; failing here says why.
    throw new Error(
      `Datasett ${dataset.datasetVersion} har status ${dataset.status}. Bare validerte datasett kan mappes.`,
    );
  }

  const overlay: SimulatedAliasOverlayEntry[] = (
    await client.simulatedMetricAlias.findMany({
      where: { datasetId: dataset.id, isActive: true },
      select: {
        alias: true,
        metricKey: true,
        statementFamily: true,
        liabilitySection: true,
      },
    })
  ).map((row) => ({
    alias: row.alias,
    metricKey: row.metricKey,
    statementFamily: row.statementFamily as SimulatedAliasOverlayEntry["statementFamily"],
    liabilitySection: row.liabilitySection as SimulatedAliasOverlayEntry["liabilitySection"],
  }));

  const definitions = [...defaultMetricDefinitions, ...overlayDefinitions(overlay)];
  const overlayMetricKeys = new Set(overlay.map((entry) => entry.metricKey));
  const intentionallyUnmapped = intentionallyUnmappedFrom(dataset.manifest);

  const lines = await client.simulatedFinancialLine.findMany({
    where: { statement: { datasetId: dataset.id } },
    select: {
      id: true,
      conceptKey: true,
      sourceLabel: true,
      presentationRole: true,
      statement: { select: { statementType: true } },
    },
    orderBy: { id: "asc" },
  });

  const decisions: SimulatedLineMappingDecision[] = lines.map((line) =>
    decideSimulatedLineMapping(
      {
        id: line.id,
        conceptKey: line.conceptKey,
        sourceLabel: line.sourceLabel,
        presentationRole: line.presentationRole,
        statementType: line.statement.statementType as "INCOME_STATEMENT" | "BALANCE_SHEET",
      },
      { definitions, overlayMetricKeys, intentionallyUnmapped },
    ),
  );
  const coverage = summariseMappingCoverage(decisions, labelByConcept);

  // The revision is global and monotonic rather than per dataset, so activating one dataset after
  // another can never ask the pointer to move its mapping revision backwards — which the database
  // refuses, and rightly: a lower revision would hide mappings that had already been published.
  const [highestMapping, pointer] = await Promise.all([
    client.simulatedFinancialLineMapping.aggregate({ _max: { mappingRevision: true } }),
    client.activeFinancialDataset.findUnique({
      where: { id: "global" },
      select: { mappingRevision: true },
    }),
  ]);
  const previous = [
    highestMapping._max.mappingRevision ?? 0n,
    pointer?.mappingRevision ?? 0n,
  ].reduce((left, right) => (left > right ? left : right));
  const mappingRevision = previous + 1n;

  if (params.dryRun) {
    return {
      datasetId: dataset.id,
      datasetVersion: dataset.datasetVersion,
      mappingRevision,
      coverage,
      written: 0,
      dryRun: true,
    };
  }

  let written = 0;
  for (let index = 0; index < decisions.length; index += WRITE_CHUNK) {
    const chunk = decisions.slice(index, index + WRITE_CHUNK);
    const result = await client.simulatedFinancialLineMapping.createMany({
      data: chunk.map((decision) => ({
        lineId: decision.lineId,
        mappingRevision,
        // A null row is not an absent row: it records that the engine looked at this revision and
        // found nothing, which is what makes the revision a complete statement about the dataset.
        metricKey: decision.metricKey,
        mappingMethod: decision.mappingMethod,
        mappedByUserId: params.createdByUserId ?? null,
      })),
    });
    written += result.count;
  }

  return {
    datasetId: dataset.id,
    datasetVersion: dataset.datasetVersion,
    mappingRevision,
    coverage,
    written,
    dryRun: false,
  };
}

export function formatMappingCoverageMarkdown(
  result: SimulatedDatasetMappingResult,
  generatedAt: Date,
) {
  const share = result.coverage.lines === 0
    ? 0
    : (result.coverage.mapped / result.coverage.lines) * 100;
  return [
    `# FI-SIM mappingrapport: ${result.datasetVersion}`,
    "",
    result.dryRun ? "**Tørrkjøring.** Ingenting er skrevet." : "Mappingen er skrevet.",
    "",
    "| | |",
    "|---|---|",
    `| Kjørt | ${generatedAt.toISOString()} |`,
    `| Mappingrevisjon | ${result.mappingRevision} |`,
    `| Linjer | ${result.coverage.lines} |`,
    `| Mappet | ${result.coverage.mapped} |`,
    `| Umappet | ${result.coverage.unmapped} |`,
    `| Mappinggrad | ${share.toFixed(1)} % |`,
    "",
    "## Metode",
    "",
    "| Metode | Linjer |",
    "|---|---|",
    ...Object.entries(result.coverage.byMethod).map(([method, count]) => `| ${method} | ${count} |`),
    "",
    "## Per konsept",
    "",
    "Hva demoen viser ferdig mappet, og hva den lar en gjennomgang gjøre.",
    "",
    "| Konsept | Etikett | Metrikk | Metode | Linjer |",
    "|---|---|---|---|---|",
    ...result.coverage.byConcept.map(
      (entry) =>
        `| ${entry.conceptKey} | ${entry.sourceLabel} | ${entry.metricKey ?? "—"} | ${entry.method} | ${entry.lines} |`,
    ),
    "",
  ].join("\n");
}
