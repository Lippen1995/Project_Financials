import { Prisma, type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { isInvestorDemoFinancialSimulationEnabled } from "@/server/financials/financials-repository";

/**
 * The controlled activation command, from spec section F8.
 *
 * Activation is the moment the product starts showing simulated figures to people who will make
 * decisions on them, so it is a command with a named actor and a reason, never a configuration
 * change someone makes in a database console. Three gates stand in front of it, and they are
 * deliberately not the same gate written three times:
 *
 * 1. This module refuses unless the process is a classified investor-demo deployment.
 * 2. The database refuses a simulated pointer unless the session says the same thing, and refuses
 *    any pointer change at all without the simulation-admin role.
 * 3. A trigger writes the audit row and rejects the change when nobody said who or why.
 *
 * Deactivation is exempt from the first gate on purpose. Turning the demo *off* is the safe
 * direction, and requiring the demo flag to be on in order to switch back to reported figures
 * would make the flag impossible to use in the one situation where it matters most.
 */

export type FinancialActivationAction = "ACTIVATE" | "ROLLBACK" | "DEACTIVATE";

export type FinancialActivationOutcome = {
  action: FinancialActivationAction;
  datasetMode: "reported" | "simulated";
  simulatedDatasetId: string | null;
  activationRevision: bigint;
  mappingRevision: bigint;
  financialDatasetVersion: string;
};

export type FinancialActivationRequest = {
  actorUserId: string;
  reason: string;
};

type ActivationClient = PrismaClient;
type ActivationTransaction = Prisma.TransactionClient;

const POINTER_ID = "global";

function requireAudited(request: FinancialActivationRequest) {
  if (!request.actorUserId.trim()) {
    throw new Error("Aktivering av finansdatasett krever en navngitt aktør.");
  }
  if (!request.reason.trim()) {
    throw new Error("Aktivering av finansdatasett krever en begrunnelse.");
  }
}

async function declareActivationSession(
  transaction: ActivationTransaction,
  params: { action: FinancialActivationAction; request: FinancialActivationRequest },
) {
  if (params.action !== "DEACTIVATE") {
    await transaction.$executeRaw`SELECT set_config('app.deployment_environment', 'investor-demo', true)`;
    await transaction.$executeRaw`SELECT set_config('app.fi_sim_enabled', 'on', true)`;
  }
  await transaction.$executeRaw`SELECT set_config('app.activation_actor', ${params.request.actorUserId.trim()}, true)`;
  await transaction.$executeRaw`SELECT set_config('app.activation_reason', ${params.request.reason.trim()}, true)`;
  await transaction.$executeRaw`SELECT set_config('app.activation_action', ${params.action}, true)`;
}

function toOutcome(
  action: FinancialActivationAction,
  pointer: {
    mode: "REPORTED" | "SIMULATED";
    simulatedDatasetId: string | null;
    activationRevision: bigint;
    mappingRevision: bigint;
  },
): FinancialActivationOutcome {
  const simulated = pointer.mode === "SIMULATED" && pointer.simulatedDatasetId !== null;
  return {
    action,
    datasetMode: simulated ? "simulated" : "reported",
    simulatedDatasetId: simulated ? pointer.simulatedDatasetId : null,
    activationRevision: pointer.activationRevision,
    mappingRevision: pointer.mappingRevision,
    // Mirrors live_financial_dataset_v1. The reported branch depends on the reported revision,
    // which only the reported ingest moves, so it is not this command's to report.
    financialDatasetVersion: simulated
      ? `simulated:${pointer.simulatedDatasetId}:${pointer.activationRevision}`
      : "reported",
  };
}

/**
 * The mapping revision the pointer must carry to expose a dataset's own mapping.
 *
 * The live view takes the newest mapping row at or below the pointer's revision, so the pointer
 * has to be at least as high as the dataset's newest mapping — otherwise a dataset is activated
 * with its lines showing as unmapped, which looks exactly like a mapping that has not been done.
 * It also may never go down: the database refuses that, and rightly, since a lower revision would
 * retract mappings that had already been published.
 */
async function mappingRevisionFor(
  transaction: ActivationTransaction,
  params: { simulatedDatasetId: string | null; current: bigint },
) {
  if (params.simulatedDatasetId === null) return params.current;
  const newest = await transaction.simulatedFinancialLineMapping.aggregate({
    where: { line: { statement: { datasetId: params.simulatedDatasetId } } },
    _max: { mappingRevision: true },
  });
  const datasetRevision = newest._max.mappingRevision ?? 0n;
  return datasetRevision > params.current ? datasetRevision : params.current;
}

async function movePointer(
  transaction: ActivationTransaction,
  params: {
    action: FinancialActivationAction;
    request: FinancialActivationRequest;
    simulatedDatasetId: string | null;
    actorUserId: string;
  },
) {
  await declareActivationSession(transaction, params);
  const current = await transaction.activeFinancialDataset.findUnique({
    where: { id: POINTER_ID },
  });
  const mode = params.simulatedDatasetId === null ? "REPORTED" : "SIMULATED";
  const mappingRevision = await mappingRevisionFor(transaction, {
    simulatedDatasetId: params.simulatedDatasetId,
    current: current?.mappingRevision ?? 0n,
  });

  if (!current) {
    return transaction.activeFinancialDataset.create({
      data: {
        id: POINTER_ID,
        mode,
        simulatedDatasetId: params.simulatedDatasetId,
        activationRevision: 1n,
        mappingRevision,
        activatedAt: new Date(),
        activatedByUserId: params.actorUserId,
      },
    });
  }

  return transaction.activeFinancialDataset.update({
    where: { id: POINTER_ID },
    data: {
      mode,
      simulatedDatasetId: params.simulatedDatasetId,
      // The database refuses a revision that does not increase, so the swap and the version bump
      // are one statement and a concurrent reader can never see a half-changed dataset.
      activationRevision: current.activationRevision + 1n,
      mappingRevision,
      activatedAt: new Date(),
      activatedByUserId: params.actorUserId,
    },
  });
}

function assertDemoDeployment(action: FinancialActivationAction) {
  if (action === "DEACTIVATE") return;
  if (!isInvestorDemoFinancialSimulationEnabled()) {
    throw new Error(
      "Simulerte finansdata kan bare aktiveres i et miljø som er klassifisert som investor-demo, med FJORD_FINANCIAL_SIMULATION_ENABLED=true.",
    );
  }
}

export function createFinancialDatasetActivationService(client: ActivationClient = prisma) {
  async function readState() {
    const [pointer, latestAudit] = await Promise.all([
      client.activeFinancialDataset.findUnique({ where: { id: POINTER_ID } }),
      client.financialDatasetActivationAudit.findFirst({ orderBy: { id: "desc" } }),
    ]);
    return {
      pointer: pointer
        ? {
            mode: pointer.mode,
            simulatedDatasetId: pointer.simulatedDatasetId,
            activationRevision: pointer.activationRevision,
            mappingRevision: pointer.mappingRevision,
          }
        : null,
      latestAudit,
    };
  }

  return {
    readState,

    async activate(
      params: FinancialActivationRequest & { datasetId: string },
    ): Promise<FinancialActivationOutcome> {
      requireAudited(params);
      assertDemoDeployment("ACTIVATE");
      return client.$transaction(async (transaction) => {
        const dataset = await transaction.simulatedFinancialDataset.findUnique({
          where: { id: params.datasetId },
          select: { id: true, status: true, datasetVersion: true },
        });
        if (!dataset) {
          throw new Error(`Fant ikke simulert datasett ${params.datasetId}.`);
        }
        if (dataset.status !== "VALIDATED") {
          throw new Error(
            `Datasett ${dataset.datasetVersion} har status ${dataset.status} og kan ikke aktiveres.`,
          );
        }
        const pointer = await movePointer(transaction, {
          action: "ACTIVATE",
          request: params,
          simulatedDatasetId: dataset.id,
          actorUserId: params.actorUserId,
        });
        return toOutcome("ACTIVATE", pointer);
      });
    },

    /**
     * Points back at the previously activated dataset. It activates the existing immutable rows;
     * nothing is copied, regenerated or rewritten, which is the whole reason datasets are
     * immutable in the first place.
     */
    async rollback(params: FinancialActivationRequest): Promise<FinancialActivationOutcome> {
      requireAudited(params);
      assertDemoDeployment("ROLLBACK");
      return client.$transaction(async (transaction) => {
        const pointer = await transaction.activeFinancialDataset.findUnique({
          where: { id: POINTER_ID },
        });
        const currentDatasetId =
          pointer?.mode === "SIMULATED" ? pointer.simulatedDatasetId : null;
        const previous = await transaction.financialDatasetActivationAudit.findFirst({
          where: {
            toMode: "SIMULATED",
            toSimulatedDatasetId: currentDatasetId
              ? { not: currentDatasetId }
              : { not: null },
          },
          orderBy: { id: "desc" },
        });
        const targetId = previous?.toSimulatedDatasetId ?? null;
        if (!targetId) {
          throw new Error(
            "Det finnes ingen tidligere aktivert demo-datasett å rulle tilbake til.",
          );
        }
        const target = await transaction.simulatedFinancialDataset.findUnique({
          where: { id: targetId },
          select: { id: true, status: true, datasetVersion: true },
        });
        if (!target || target.status !== "VALIDATED") {
          throw new Error(
            `Forrige datasett ${targetId} er ikke lenger validert og kan ikke reaktiveres.`,
          );
        }
        const moved = await movePointer(transaction, {
          action: "ROLLBACK",
          request: params,
          simulatedDatasetId: target.id,
          actorUserId: params.actorUserId,
        });
        return toOutcome("ROLLBACK", moved);
      });
    },

    async deactivate(params: FinancialActivationRequest): Promise<FinancialActivationOutcome> {
      requireAudited(params);
      return client.$transaction(async (transaction) => {
        const moved = await movePointer(transaction, {
          action: "DEACTIVATE",
          request: params,
          simulatedDatasetId: null,
          actorUserId: params.actorUserId,
        });
        return toOutcome("DEACTIVATE", moved);
      });
    },

    async listActivations(limit = 20) {
      return client.financialDatasetActivationAudit.findMany({
        orderBy: { id: "desc" },
        take: limit,
      });
    },
  };
}

export const financialDatasetActivationService = createFinancialDatasetActivationService();
