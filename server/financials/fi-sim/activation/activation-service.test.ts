import type { PrismaClient } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createFinancialDatasetActivationService } from "./activation-service";

type PointerRow = {
  id: string;
  mode: "REPORTED" | "SIMULATED";
  simulatedDatasetId: string | null;
  activationRevision: bigint;
  mappingRevision: bigint;
};

type AuditRow = {
  id: bigint;
  action: "ACTIVATE" | "ROLLBACK" | "DEACTIVATE";
  toMode: "REPORTED" | "SIMULATED";
  toSimulatedDatasetId: string | null;
};

/**
 * A stand-in for the parts of the client the service touches. The database enforces the rules
 * that matter — role, demo session, monotonic revision, audit — and the disposable-database
 * verification proves those. What is worth testing in isolation is the decision the service makes
 * before it gets there: which dataset a rollback should point at, and when it should refuse.
 */
function fakeClient(state: {
  pointer: PointerRow | null;
  datasets: Array<{ id: string; status: string; datasetVersion: string }>;
  audits: AuditRow[];
  /** The newest mapping revision written for the dataset being activated, if any. */
  datasetMappingRevision?: bigint;
}) {
  const settings: string[] = [];
  const client = {
    settings,
    updates: [] as Array<Record<string, unknown>>,
    async $transaction(run: (transaction: unknown) => Promise<unknown>) {
      return run(client);
    },
    async $executeRaw(strings: TemplateStringsArray, ...values: unknown[]) {
      settings.push(strings.join("?") + JSON.stringify(values));
      return 1;
    },
    activeFinancialDataset: {
      async findUnique() {
        return state.pointer;
      },
      async update({ data }: { data: Record<string, unknown> }) {
        client.updates.push(data);
        return { ...state.pointer, ...data } as PointerRow;
      },
      async create({ data }: { data: Record<string, unknown> }) {
        client.updates.push(data);
        return data as unknown as PointerRow;
      },
    },
    simulatedFinancialDataset: {
      async findUnique({ where }: { where: { id: string } }) {
        return state.datasets.find((dataset) => dataset.id === where.id) ?? null;
      },
    },
    simulatedFinancialLineMapping: {
      async aggregate() {
        return { _max: { mappingRevision: state.datasetMappingRevision ?? null } };
      },
    },
    financialDatasetActivationAudit: {
      async findFirst({ where }: { where?: { toSimulatedDatasetId?: { not: string | null } } }) {
        const exclude = where?.toSimulatedDatasetId?.not ?? undefined;
        return (
          [...state.audits]
            .sort((left, right) => Number(right.id - left.id))
            .find(
              (audit) =>
                audit.toMode === "SIMULATED" &&
                audit.toSimulatedDatasetId !== null &&
                audit.toSimulatedDatasetId !== exclude,
            ) ?? null
        );
      },
    },
  };
  return client as unknown as PrismaClient & { settings: string[]; updates: Array<Record<string, unknown>> };
}

function inDemoDeployment() {
  vi.stubEnv("FJORD_DEPLOYMENT_ENVIRONMENT", "investor-demo");
  vi.stubEnv("FJORD_FINANCIAL_SIMULATION_ENABLED", "true");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

const validatedDataset = { id: "dataset-2", status: "VALIDATED", datasetVersion: "demo-2" };
const previousDataset = { id: "dataset-1", status: "VALIDATED", datasetVersion: "demo-1" };

describe("FI-SIM activation command", () => {
  it("refuses activation outside a classified investor-demo deployment", async () => {
    vi.stubEnv("FJORD_DEPLOYMENT_ENVIRONMENT", "production");
    vi.stubEnv("FJORD_FINANCIAL_SIMULATION_ENABLED", "true");
    const client = fakeClient({ pointer: null, datasets: [validatedDataset], audits: [] });

    await expect(
      createFinancialDatasetActivationService(client).activate({
        datasetId: "dataset-2",
        actorUserId: "simen",
        reason: "Investor demo",
      }),
    ).rejects.toThrow(/investor-demo/);
    expect(client.updates).toEqual([]);
  });

  it("refuses an activation nobody takes responsibility for", async () => {
    inDemoDeployment();
    const service = createFinancialDatasetActivationService(
      fakeClient({ pointer: null, datasets: [validatedDataset], audits: [] }),
    );

    await expect(
      service.activate({ datasetId: "dataset-2", actorUserId: "  ", reason: "Investor demo" }),
    ).rejects.toThrow(/aktør/);
    await expect(
      service.activate({ datasetId: "dataset-2", actorUserId: "simen", reason: "" }),
    ).rejects.toThrow(/begrunnelse/);
  });

  it("refuses a dataset that has not validated", async () => {
    inDemoDeployment();
    const service = createFinancialDatasetActivationService(
      fakeClient({
        pointer: null,
        datasets: [{ id: "dataset-3", status: "BUILDING", datasetVersion: "demo-3" }],
        audits: [],
      }),
    );

    await expect(
      service.activate({ datasetId: "dataset-3", actorUserId: "simen", reason: "Demo" }),
    ).rejects.toThrow(/BUILDING/);
  });

  it("declares the session the database trigger demands", async () => {
    inDemoDeployment();
    const client = fakeClient({ pointer: null, datasets: [validatedDataset], audits: [] });

    await createFinancialDatasetActivationService(client).activate({
      datasetId: "dataset-2",
      actorUserId: "simen",
      reason: "Investor demo 12. august",
    });

    const declared = client.settings.join("\n");
    expect(declared).toContain("app.activation_actor");
    expect(declared).toContain("app.activation_reason");
    expect(declared).toContain("app.activation_action");
    expect(declared).toContain("investor-demo");
    expect(declared).toContain("ACTIVATE");
  });

  it("raises the activation revision on every swap", async () => {
    inDemoDeployment();
    const client = fakeClient({
      pointer: {
        id: "global",
        mode: "SIMULATED",
        simulatedDatasetId: "dataset-1",
        activationRevision: 7n,
        mappingRevision: 2n,
      },
      datasets: [validatedDataset, previousDataset],
      audits: [],
    });

    const outcome = await createFinancialDatasetActivationService(client).activate({
      datasetId: "dataset-2",
      actorUserId: "simen",
      reason: "Nytt datasett",
    });

    expect(client.updates[0]).toMatchObject({ activationRevision: 8n, mode: "SIMULATED" });
    expect(outcome.financialDatasetVersion).toBe("simulated:dataset-2:8");
  });

  it("carries the dataset's mapping revision so activating it publishes its mapping", async () => {
    // The live view takes the newest mapping row at or below the pointer's revision. Activating a
    // mapped dataset with the pointer left at 0 would show every line as unmapped, which is
    // indistinguishable from mapping never having been run.
    inDemoDeployment();
    const client = fakeClient({
      pointer: null,
      datasets: [validatedDataset],
      audits: [],
      datasetMappingRevision: 3n,
    });

    await createFinancialDatasetActivationService(client).activate({
      datasetId: "dataset-2",
      actorUserId: "simen",
      reason: "Demo med mapping",
    });

    expect(client.updates[0]).toMatchObject({ mappingRevision: 3n });
  });

  it("never lowers the mapping revision when the next dataset has less mapping", async () => {
    // The database refuses a decrease, and it is right to: a lower revision would retract
    // mappings that had already been published. A higher pointer is harmless, because the view
    // still picks each line's newest row at or below it.
    inDemoDeployment();
    const client = fakeClient({
      pointer: {
        id: "global",
        mode: "SIMULATED",
        simulatedDatasetId: "dataset-1",
        activationRevision: 4n,
        mappingRevision: 9n,
      },
      datasets: [validatedDataset, previousDataset],
      audits: [],
      datasetMappingRevision: 2n,
    });

    await createFinancialDatasetActivationService(client).activate({
      datasetId: "dataset-2",
      actorUserId: "simen",
      reason: "Bytt datasett",
    });

    expect(client.updates[0]).toMatchObject({ mappingRevision: 9n });
  });

  it("rolls back to the previously activated dataset without copying it", async () => {
    inDemoDeployment();
    const client = fakeClient({
      pointer: {
        id: "global",
        mode: "SIMULATED",
        simulatedDatasetId: "dataset-2",
        activationRevision: 8n,
        mappingRevision: 2n,
      },
      datasets: [validatedDataset, previousDataset],
      audits: [
        { id: 1n, action: "ACTIVATE", toMode: "SIMULATED", toSimulatedDatasetId: "dataset-1" },
        { id: 2n, action: "ACTIVATE", toMode: "SIMULATED", toSimulatedDatasetId: "dataset-2" },
      ],
    });

    const outcome = await createFinancialDatasetActivationService(client).rollback({
      actorUserId: "simen",
      reason: "Tallene så feil ut",
    });

    expect(outcome.simulatedDatasetId).toBe("dataset-1");
    expect(outcome.activationRevision).toBe(9n);
    expect(client.updates[0]).toMatchObject({ simulatedDatasetId: "dataset-1" });
    expect(client.settings.join("\n")).toContain("ROLLBACK");
  });

  it("refuses a rollback when nothing was activated before", async () => {
    inDemoDeployment();
    const service = createFinancialDatasetActivationService(
      fakeClient({
        pointer: {
          id: "global",
          mode: "SIMULATED",
          simulatedDatasetId: "dataset-2",
          activationRevision: 8n,
          mappingRevision: 0n,
        },
        datasets: [validatedDataset],
        audits: [
          { id: 1n, action: "ACTIVATE", toMode: "SIMULATED", toSimulatedDatasetId: "dataset-2" },
        ],
      }),
    );

    await expect(
      service.rollback({ actorUserId: "simen", reason: "Tilbake" }),
    ).rejects.toThrow(/ingen tidligere aktivert/i);
  });

  it("lets the demo be switched off even when the demo flag is already off", async () => {
    // The one direction that must always work. Requiring the flag that turns the demo on in order
    // to turn it off would make the flag useless in the situation where it matters most.
    vi.stubEnv("FJORD_DEPLOYMENT_ENVIRONMENT", "production");
    vi.stubEnv("FJORD_FINANCIAL_SIMULATION_ENABLED", "false");
    const client = fakeClient({
      pointer: {
        id: "global",
        mode: "SIMULATED",
        simulatedDatasetId: "dataset-2",
        activationRevision: 8n,
        mappingRevision: 0n,
      },
      datasets: [validatedDataset],
      audits: [],
    });

    const outcome = await createFinancialDatasetActivationService(client).deactivate({
      actorUserId: "simen",
      reason: "Demoen er over",
    });

    expect(outcome.datasetMode).toBe("reported");
    expect(client.updates[0]).toMatchObject({ mode: "REPORTED", simulatedDatasetId: null });
    // It must not claim to be a demo deployment on the way out.
    expect(client.settings.join("\n")).not.toContain("app.deployment_environment");
  });
});
