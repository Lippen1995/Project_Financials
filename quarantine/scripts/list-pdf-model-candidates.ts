#!/usr/bin/env tsx

import { PdfModelCandidateStatus } from "@prisma/client";

import {
  listPdfModelCandidates,
} from "@/server/services/pdf-model-candidate-service";

type Args = {
  status?: PdfModelCandidateStatus;
  modelTarget?: string;
  modelId?: string;
  limit?: number;
  json: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { json: false };
  for (const arg of argv) {
    if (arg === "--json") args.json = true;
    else if (arg.startsWith("--status=")) {
      args.status = arg.slice("--status=".length) as PdfModelCandidateStatus;
    } else if (arg.startsWith("--modelTarget=")) {
      args.modelTarget = arg.slice("--modelTarget=".length);
    } else if (arg.startsWith("--modelId=")) {
      args.modelId = arg.slice("--modelId=".length);
    } else if (arg.startsWith("--limit=")) {
      args.limit = Number.parseInt(arg.slice("--limit=".length), 10);
    }
  }
  return args;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required to list PDF model candidates.");
    process.exit(1);
  }

  const args = parseArgs(process.argv.slice(2));
  if (args.status && !Object.values(PdfModelCandidateStatus).includes(args.status)) {
    console.error(`Invalid --status. Use one of: ${Object.values(PdfModelCandidateStatus).join(", ")}`);
    process.exit(1);
  }

  const candidates = await listPdfModelCandidates({
    status: args.status,
    modelTarget: args.modelTarget,
    modelId: args.modelId,
    limit: args.limit,
  });

  if (args.json) {
    console.log(JSON.stringify({ data: candidates }, null, 2));
    return;
  }

  console.log(`PDF model candidates (${candidates.length})`);
  for (const candidate of candidates) {
    console.log(
      `${candidate.id}  ${candidate.status.padEnd(19)} ${candidate.modelId}@${candidate.modelVersion}  ${candidate.modelTarget}`,
    );
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : "Unexpected error.");
  process.exit(1);
});
