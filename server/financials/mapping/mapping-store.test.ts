import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  metricAliasCreate: vi.fn(),
  metricAliasUpdate: vi.fn(),
  metricAliasDelete: vi.fn(),
  simulatedCreate: vi.fn(),
  simulatedUpdateMany: vi.fn(),
  simulatedDeleteMany: vi.fn(),
  simulatedFindUniqueOrThrow: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    metricAlias: {
      create: mocks.metricAliasCreate,
      update: mocks.metricAliasUpdate,
      delete: mocks.metricAliasDelete,
    },
    simulatedMetricAlias: {
      create: mocks.simulatedCreate,
      updateMany: mocks.simulatedUpdateMany,
      deleteMany: mocks.simulatedDeleteMany,
      findUniqueOrThrow: mocks.simulatedFindUniqueOrThrow,
    },
  },
}));

const { createMappingStore, MappingTargetUnavailableError } = await import(
  "@/server/financials/mapping/mapping-store"
);
import type { CanonicalRegistryEntry } from "@/server/services/canonical-registry-service";

const registry = [
  { key: "revenue", family: "INCOME_STATEMENT", liabilitySection: null },
] as unknown as CanonicalRegistryEntry[];

const loadRegistry = async () => registry;
const reported = async () => ({ kind: "reported" }) as const;
const simulated = async () =>
  ({
    kind: "simulated",
    datasetId: "ds-1",
    mappingRevision: 7n,
    taxonomyVersion: "FI-SIM-2026.1",
  }) as const;

beforeEach(() => vi.clearAllMocks());

describe("mapping store routing", () => {
  it("writes to the reported alias table in reported mode", async () => {
    const store = createMappingStore(loadRegistry, reported);

    await store.createAlias({ alias: "Driftsinntekter", metricKey: "revenue" });

    expect(mocks.metricAliasCreate).toHaveBeenCalledTimes(1);
    expect(mocks.simulatedCreate).not.toHaveBeenCalled();
    expect(mocks.metricAliasCreate.mock.calls[0][0].data).toMatchObject({
      metricKey: "revenue",
      alias: "Driftsinntekter",
      statementFamily: "INCOME_STATEMENT",
    });
  });

  it("never touches the reported table in simulated mode", async () => {
    const store = createMappingStore(loadRegistry, simulated);

    await store.createAlias({ alias: "Driftsinntekter", metricKey: "revenue" });

    // The FI-SIM stop criterion: mapping during a demo must not be able to change a reported
    // record. This assertion is the one that must never be relaxed.
    expect(mocks.metricAliasCreate).not.toHaveBeenCalled();
    expect(mocks.metricAliasUpdate).not.toHaveBeenCalled();
    expect(mocks.metricAliasDelete).not.toHaveBeenCalled();
    expect(mocks.simulatedCreate).toHaveBeenCalledTimes(1);
  });

  it("stamps the simulated row with the active dataset and revision", async () => {
    const store = createMappingStore(loadRegistry, simulated);

    await store.createAlias({ alias: "Driftsinntekter", metricKey: "revenue" });

    expect(mocks.simulatedCreate.mock.calls[0][0].data).toMatchObject({
      datasetId: "ds-1",
      mappingRevision: 7n,
      taxonomyVersion: "FI-SIM-2026.1",
      metricKey: "revenue",
      statementFamily: "INCOME_STATEMENT",
    });
  });

  it("resolves an alias identically in both modes", async () => {
    await createMappingStore(loadRegistry, reported).createAlias({
      alias: "  Driftsinntekter  ",
      metricKey: "revenue",
    });
    await createMappingStore(loadRegistry, simulated).createAlias({
      alias: "  Driftsinntekter  ",
      metricKey: "revenue",
    });

    const reportedRow = mocks.metricAliasCreate.mock.calls[0][0].data;
    const simulatedRow = mocks.simulatedCreate.mock.calls[0][0].data;

    expect(simulatedRow.alias).toBe(reportedRow.alias);
    expect(simulatedRow.normalizedAlias).toBe(reportedRow.normalizedAlias);
    expect(simulatedRow.statementFamily).toBe(reportedRow.statementFamily);
    expect(simulatedRow.liabilitySection).toBe(reportedRow.liabilitySection);
  });

  it("scopes a simulated update to the active dataset and revision", async () => {
    mocks.simulatedUpdateMany.mockResolvedValue({ count: 1 });
    mocks.simulatedFindUniqueOrThrow.mockResolvedValue({ id: "a-1" });
    const store = createMappingStore(loadRegistry, simulated);

    await store.updateAlias({ id: "a-1", alias: "Ny tekst" });

    expect(mocks.simulatedUpdateMany.mock.calls[0][0].where).toMatchObject({
      id: "a-1",
      datasetId: "ds-1",
      mappingRevision: 7n,
    });
  });

  it("refuses a simulated edit that matches no row in the active dataset", async () => {
    mocks.simulatedUpdateMany.mockResolvedValue({ count: 0 });
    const store = createMappingStore(loadRegistry, simulated);

    await expect(store.updateAlias({ id: "other-dataset", alias: "x" })).rejects.toThrow(
      MappingTargetUnavailableError,
    );
  });

  it("scopes a simulated delete the same way", async () => {
    mocks.simulatedDeleteMany.mockResolvedValue({ count: 1 });
    const store = createMappingStore(loadRegistry, simulated);

    await store.deleteAlias("a-1");

    expect(mocks.metricAliasDelete).not.toHaveBeenCalled();
    expect(mocks.simulatedDeleteMany.mock.calls[0][0].where).toMatchObject({
      datasetId: "ds-1",
      mappingRevision: 7n,
    });
  });

  it("rejects an unknown metric key before any write", async () => {
    const store = createMappingStore(loadRegistry, reported);

    await expect(store.createAlias({ alias: "Noe", metricKey: "typo" })).rejects.toThrow();
    expect(mocks.metricAliasCreate).not.toHaveBeenCalled();
  });
});
