/**
 * Projects financial line items from a source into the source-agnostic
 * FinancialLineItem table.
 *
 * This table is the substrate the metric-mapping admin surface works on,
 * replacing the PDF/OCR fact tables in that role.
 *
 * Today's only source is the free structured Regnskapsregisteret feed, whose
 * `canonicalValues` arrive already keyed by our own canonical names — our
 * mapper in integrations/brreg/structured-regnskap.ts does the naming, not
 * Brreg. Those rows therefore land with `metricKey` set and `sourceLabel` null:
 * there is no raw source label to map, and nothing for a reviewer to do.
 *
 * The paid K2 delivery is the case this table exists for. Those rows are
 * expected to carry the registry's own labels with no canonical key, landing as
 * `sourceLabel` set and `metricKey` null — which is exactly the
 * "needs mapping" queue that `countUnmappedLineItems` reports.
 */
import type { FinancialFactStatementType, Prisma, StatementScope } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { loadCanonicalRegistry } from "@/server/services/canonical-registry-service";

const STRUCTURED_SOURCE_SYSTEM = "BRREG";
const STRUCTURED_SOURCE_ENTITY_TYPE = "structuredAnnualAccounts";

/** Prefix on `sourceKey` identifying where within the payload a row came from. */
const STRUCTURED_SOURCE_KEY_PREFIX = "canonicalValues";

export type StructuredStatementPayload = {
  canonicalValues?: Record<string, number> | null;
};

export type LineItemDraft = {
  sourceKey: string;
  sourceLabel: string | null;
  metricKey: string | null;
  statementType: FinancialFactStatementType;
  value: bigint | null;
  sortOrder: number;
};

/**
 * Map canonical key -> statement type, from the DB-backed canonical registry.
 * Keys the registry does not know are still ingested, as INCOME_STATEMENT is
 * not a safe guess for them; they are returned so the caller can report them.
 */
export async function loadStatementTypeByMetricKey(): Promise<
  Map<string, FinancialFactStatementType>
> {
  const registry = await loadCanonicalRegistry();
  return new Map(
    registry.map((entry) => [
      entry.key,
      (entry.family === "BALANCE_SHEET"
        ? "BALANCE_SHEET"
        : "INCOME_STATEMENT") as FinancialFactStatementType,
    ]),
  );
}

/**
 * Turn one structured statement payload into line-item drafts.
 *
 * Ordering follows the registry so the admin surface lists items in statement
 * order rather than JSON key order; unknown keys sort last but keep a stable
 * relative order.
 */
export function buildStructuredLineItemDrafts(
  payload: StructuredStatementPayload | null,
  statementTypeByKey: Map<string, FinancialFactStatementType>,
  registryOrder: Map<string, number>,
): { drafts: LineItemDraft[]; unknownKeys: string[] } {
  const canonicalValues = payload?.canonicalValues;
  if (!canonicalValues || typeof canonicalValues !== "object") {
    return { drafts: [], unknownKeys: [] };
  }

  const unknownKeys: string[] = [];
  const drafts: LineItemDraft[] = [];

  for (const [metricKey, rawValue] of Object.entries(canonicalValues)) {
    if (typeof rawValue !== "number" || !Number.isFinite(rawValue)) continue;

    const statementType = statementTypeByKey.get(metricKey);
    if (!statementType) unknownKeys.push(metricKey);

    drafts.push({
      sourceKey: `${STRUCTURED_SOURCE_KEY_PREFIX}:${metricKey}`,
      // The structured feed has no raw label of its own — our mapper supplies
      // the name — so there is nothing for an alias to match on.
      sourceLabel: null,
      metricKey,
      statementType: statementType ?? "INCOME_STATEMENT",
      value: BigInt(Math.round(rawValue)),
      sortOrder: registryOrder.get(metricKey) ?? Number.MAX_SAFE_INTEGER,
    });
  }

  drafts.sort((left, right) => left.sortOrder - right.sortOrder);
  return {
    drafts: drafts.map((draft, index) => ({ ...draft, sortOrder: index })),
    unknownKeys,
  };
}

/**
 * Registry lookups memoised for the process. The registry is small and changes
 * only when an admin edits it, while ingestion projects one statement at a
 * time — reloading per statement would dominate the write cost.
 */
let registryCache: {
  statementTypeByKey: Map<string, FinancialFactStatementType>;
  registryOrder: Map<string, number>;
} | null = null;

export async function loadRegistryProjection() {
  if (registryCache) return registryCache;
  const [statementTypeByKey, registry] = await Promise.all([
    loadStatementTypeByMetricKey(),
    loadCanonicalRegistry(),
  ]);
  registryCache = {
    statementTypeByKey,
    registryOrder: new Map(registry.map((entry, index) => [entry.key, index])),
  };
  return registryCache;
}

/** Drop the memoised registry — call after an admin mutates canonical keys. */
export function resetRegistryProjectionCache() {
  registryCache = null;
}

export type StatementSource = {
  companyId: string;
  fiscalYear: number;
  statementScope: StatementScope;
  currency: string;
  unitScale: number;
  sourceSystem: string;
  sourceEntityType: string;
  sourceId: string;
  fetchedAt: Date;
  normalizedAt: Date;
  rawPayload: Prisma.JsonValue | null;
};

/**
 * Write drafts for one statement, replacing whatever that statement previously
 * contributed. Scoped delete + insert keeps re-ingestion idempotent and drops
 * keys the source no longer reports, which per-row upserts would leave behind.
 */
export async function replaceLineItemsForStatement(
  statement: StatementSource,
  drafts: LineItemDraft[],
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<number> {
  if (drafts.length === 0) {
    await client.financialLineItem.deleteMany({
      where: {
        companyId: statement.companyId,
        fiscalYear: statement.fiscalYear,
        statementScope: statement.statementScope,
        sourceKey: { startsWith: `${STRUCTURED_SOURCE_KEY_PREFIX}:` },
      },
    });
    return 0;
  }

  const write = async (tx: Prisma.TransactionClient | typeof prisma) => {
    await tx.financialLineItem.deleteMany({
      where: {
        companyId: statement.companyId,
        fiscalYear: statement.fiscalYear,
        statementScope: statement.statementScope,
        sourceKey: { startsWith: `${STRUCTURED_SOURCE_KEY_PREFIX}:` },
      },
    });

    await tx.financialLineItem.createMany({
      data: drafts.map((draft) => ({
        companyId: statement.companyId,
        fiscalYear: statement.fiscalYear,
        statementScope: statement.statementScope,
        statementType: draft.statementType,
        sourceKey: draft.sourceKey,
        sourceLabel: draft.sourceLabel,
        metricKey: draft.metricKey,
        value: draft.value,
        currency: statement.currency,
        unitScale: statement.unitScale,
        sortOrder: draft.sortOrder,
        sourceSystem: statement.sourceSystem,
        sourceEntityType: statement.sourceEntityType,
        sourceId: statement.sourceId,
        fetchedAt: statement.fetchedAt,
        normalizedAt: statement.normalizedAt,
      })),
      skipDuplicates: true,
    });

    return drafts.length;
  };

  // Already inside a caller's transaction: join it rather than nesting.
  return client === prisma ? prisma.$transaction(write) : write(client);
}

/**
 * Project a structured statement's canonical values into line items, inside the
 * caller's transaction so the statement and its line items commit together.
 */
export async function projectStructuredAccountsToLineItems(
  client: Prisma.TransactionClient,
  statement: StatementSource,
  canonicalValues: Record<string, number> | null | undefined,
): Promise<number> {
  const { statementTypeByKey, registryOrder } = await loadRegistryProjection();
  const { drafts } = buildStructuredLineItemDrafts(
    { canonicalValues: canonicalValues ?? null },
    statementTypeByKey,
    registryOrder,
  );
  return replaceLineItemsForStatement(statement, drafts, client);
}

export type BackfillResult = {
  statementsScanned: number;
  statementsWithItems: number;
  lineItemsWritten: number;
  unknownKeys: string[];
};

/**
 * Project every stored structured statement into line items.
 *
 * Idempotent: rerunning replaces each statement's rows rather than duplicating.
 */
export async function backfillStructuredLineItems(options: {
  limit?: number;
  batchSize?: number;
} = {}): Promise<BackfillResult> {
  const batchSize = options.batchSize ?? 200;
  const [statementTypeByKey, registry] = await Promise.all([
    loadStatementTypeByMetricKey(),
    loadCanonicalRegistry(),
  ]);
  const registryOrder = new Map(registry.map((entry, index) => [entry.key, index]));

  const result: BackfillResult = {
    statementsScanned: 0,
    statementsWithItems: 0,
    lineItemsWritten: 0,
    unknownKeys: [],
  };
  const unknown = new Set<string>();

  let cursor: string | undefined;
  for (;;) {
    const remaining =
      options.limit === undefined
        ? batchSize
        : Math.min(batchSize, options.limit - result.statementsScanned);
    if (remaining <= 0) break;

    const statements = await prisma.financialStatement.findMany({
      where: {
        sourceSystem: STRUCTURED_SOURCE_SYSTEM,
        sourceEntityType: STRUCTURED_SOURCE_ENTITY_TYPE,
      },
      orderBy: { id: "asc" },
      take: remaining,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: {
        id: true,
        companyId: true,
        fiscalYear: true,
        statementScope: true,
        currency: true,
        unitScale: true,
        sourceSystem: true,
        sourceEntityType: true,
        sourceId: true,
        fetchedAt: true,
        normalizedAt: true,
        rawPayload: true,
      },
    });
    if (statements.length === 0) break;
    cursor = statements[statements.length - 1].id;

    for (const statement of statements) {
      result.statementsScanned += 1;
      const { drafts, unknownKeys } = buildStructuredLineItemDrafts(
        statement.rawPayload as StructuredStatementPayload | null,
        statementTypeByKey,
        registryOrder,
      );
      for (const key of unknownKeys) unknown.add(key);
      if (drafts.length === 0) continue;

      const written = await replaceLineItemsForStatement(
        {
          companyId: statement.companyId,
          fiscalYear: statement.fiscalYear,
          statementScope: statement.statementScope,
          currency: statement.currency,
          unitScale: statement.unitScale ?? 1,
          sourceSystem: statement.sourceSystem ?? STRUCTURED_SOURCE_SYSTEM,
          sourceEntityType: statement.sourceEntityType ?? STRUCTURED_SOURCE_ENTITY_TYPE,
          sourceId: statement.sourceId ?? statement.id,
          fetchedAt: statement.fetchedAt ?? new Date(),
          normalizedAt: statement.normalizedAt ?? new Date(),
          rawPayload: statement.rawPayload,
        },
        drafts,
      );
      result.statementsWithItems += 1;
      result.lineItemsWritten += written;
    }
  }

  result.unknownKeys = [...unknown].sort();
  return result;
}

export type LineItemCoverage = {
  total: number;
  mapped: number;
  unmapped: number;
  distinctMetricKeys: number;
  distinctUnmappedLabels: number;
};

/** Coverage of the mapping substrate, for the admin surface and reporting. */
export async function getLineItemCoverage(): Promise<LineItemCoverage> {
  const [total, unmapped, metricKeys, unmappedLabels] = await Promise.all([
    prisma.financialLineItem.count(),
    prisma.financialLineItem.count({ where: { metricKey: null } }),
    prisma.financialLineItem.findMany({
      where: { metricKey: { not: null } },
      distinct: ["metricKey"],
      select: { metricKey: true },
    }),
    prisma.financialLineItem.findMany({
      where: { metricKey: null, sourceLabel: { not: null } },
      distinct: ["sourceLabel"],
      select: { sourceLabel: true },
    }),
  ]);

  return {
    total,
    mapped: total - unmapped,
    unmapped,
    distinctMetricKeys: metricKeys.length,
    distinctUnmappedLabels: unmappedLabels.length,
  };
}
