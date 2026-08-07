import type { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { buildGroupRelationshipSnapshotInTransaction } from "@/server/ownership/group-relationship-snapshot-builder";
import { CONTROL_THRESHOLD_PERCENT } from "@/server/ownership/ownership-thresholds";

function statementText(statement: unknown) {
  if (typeof statement !== "object" || statement === null || !("text" in statement)) {
    return "";
  }
  return String(statement.text);
}

function statementValues(statement: unknown) {
  if (typeof statement !== "object" || statement === null || !("values" in statement)) {
    return [];
  }
  return Array.isArray(statement.values) ? statement.values : [];
}

describe("buildGroupRelationshipSnapshotInTransaction", () => {
  it("blocks resolved membership only for conflicts and control-relevant unknown edges", async () => {
    const executeRaw = vi.fn().mockResolvedValue(0);
    const queryRaw = vi
      .fn()
      .mockResolvedValueOnce([{ relationship: "GROUP_SUBSIDIARY", count: 1n }])
      .mockResolvedValueOnce([{ count: 1n }]);
    const sourceImport = {
      id: "test-import",
      sourceSystem: "SKATTEETATEN",
      status: "COMPLETED" as const,
      sourceId: "test-source",
      sourceChecksum: null,
      importedRowCount: 1,
      fetchedAt: new Date("2026-01-01T00:00:00.000Z"),
    };
    const transaction = {
      $executeRaw: executeRaw,
      $queryRaw: queryRaw,
      shareholderRegisterImport: {
        findFirst: vi.fn().mockResolvedValue(sourceImport),
      },
      groupRelationshipPublication: {
        upsert: vi.fn().mockResolvedValue({}),
      },
    } as unknown as Prisma.TransactionClient;

    await buildGroupRelationshipSnapshotInTransaction(transaction, 2025, sourceImport);

    const membershipStatement = executeRaw.mock.calls
      .map(([statement]) => statement)
      .find((statement) => statementText(statement).includes("ambiguous_nodes"));
    const sql = statementText(membershipStatement);

    expect(sql).toMatch(/"relationship" = 'CONFLICT'/);
    expect(sql).toMatch(/"relationship" = 'UNKNOWN'/);
    expect(sql).toMatch(/"ownershipPercent" IS NULL/);
    expect(sql).toMatch(/"ownershipPercent" > \$\d+/);
    expect(statementValues(membershipStatement)).toContain(CONTROL_THRESHOLD_PERCENT);
  });
});
