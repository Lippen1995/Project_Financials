import "@/lib/env";

import { prisma } from "@/lib/prisma";
import { financialDatasetActivationService } from "@/server/financials/fi-sim/activation/activation-service";

/**
 * The operator command for the FI-SIM dataset pointer.
 *
 * Every action names an actor and a reason because the database refuses the pointer change
 * without them. `status` is the one that should be run most: before a demo, to see which dataset
 * is live and who put it there.
 */

type Action = "status" | "activate" | "rollback" | "deactivate";

type Options = {
  action: Action;
  dataset: string | null;
  actorUserId: string;
  reason: string;
  historyLimit: number;
};

function parseOptions(argv: string[]): Options {
  const options: Options = {
    action: "status",
    dataset: null,
    actorUserId: "",
    reason: "",
    historyLimit: 10,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];
    const requireValue = () => {
      if (!value || value.startsWith("--")) throw new Error(`${argument} krever en verdi.`);
      index += 1;
      return value;
    };

    if (argument === "--action") {
      const action = requireValue();
      if (!["status", "activate", "rollback", "deactivate"].includes(action)) {
        throw new Error("--action må være status, activate, rollback eller deactivate.");
      }
      options.action = action as Action;
    } else if (argument === "--dataset") options.dataset = requireValue();
    else if (argument === "--actor") options.actorUserId = requireValue();
    else if (argument === "--reason") options.reason = requireValue();
    else if (argument === "--history") options.historyLimit = Number.parseInt(requireValue(), 10);
    else throw new Error(`Ukjent argument: ${argument}`);
  }

  if (options.action !== "status" && (!options.actorUserId || !options.reason)) {
    throw new Error("--actor og --reason er påkrevd for alt annet enn status.");
  }
  if (options.action === "activate" && !options.dataset) {
    throw new Error("--dataset er påkrevd ved aktivering.");
  }
  return options;
}

async function resolveDatasetId(reference: string) {
  const dataset = await prisma.simulatedFinancialDataset.findFirst({
    where: { OR: [{ id: reference }, { datasetVersion: reference }] },
    select: { id: true, datasetVersion: true, status: true },
  });
  if (!dataset) throw new Error(`Fant ikke datasett ${reference}.`);
  return dataset;
}

async function printStatus(historyLimit: number) {
  const { pointer } = await financialDatasetActivationService.readState();
  if (!pointer || pointer.mode === "REPORTED") {
    console.log("Aktivt finansdatasett: rapportert.");
  } else {
    const dataset = pointer.simulatedDatasetId
      ? await prisma.simulatedFinancialDataset.findUnique({
          where: { id: pointer.simulatedDatasetId },
          select: { datasetVersion: true, status: true },
        })
      : null;
    console.log(
      `Aktivt finansdatasett: simulert ${dataset?.datasetVersion ?? pointer.simulatedDatasetId} (${dataset?.status ?? "ukjent"}), aktiveringsrevisjon ${pointer.activationRevision}.`,
    );
  }

  const history = await financialDatasetActivationService.listActivations(historyLimit);
  if (history.length === 0) {
    console.log("Ingen aktiveringer er logget.");
    return;
  }
  console.log("Aktiveringslogg, nyeste først:");
  for (const entry of history) {
    console.log(
      `  ${entry.createdAt.toISOString()} ${entry.action} → ${entry.toMode}${
        entry.toSimulatedDatasetId ? ` ${entry.toSimulatedDatasetId}` : ""
      } (rev ${entry.toActivationRevision}) av ${entry.actorUserId} som ${entry.databaseUser} i ${entry.deploymentEnvironment}: ${entry.reason}`,
    );
  }
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const request = { actorUserId: options.actorUserId, reason: options.reason };

  if (options.action === "status") {
    await printStatus(options.historyLimit);
    return;
  }

  const outcome =
    options.action === "activate"
      ? await financialDatasetActivationService.activate({
          ...request,
          datasetId: (await resolveDatasetId(options.dataset!)).id,
        })
      : options.action === "rollback"
        ? await financialDatasetActivationService.rollback(request)
        : await financialDatasetActivationService.deactivate(request);

  console.log(
    `${outcome.action}: aktivt datasett er nå ${outcome.datasetMode}${
      outcome.simulatedDatasetId ? ` (${outcome.simulatedDatasetId})` : ""
    }, aktiveringsrevisjon ${outcome.activationRevision}.`,
  );
  console.log(
    "Husk at cacher, analyser og eksporter er versjonert på datasettversjon og faller ut av seg selv.",
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
