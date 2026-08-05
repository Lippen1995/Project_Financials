#!/usr/bin/env tsx

import {
  createPdfModelCandidateFromManifestArtifact,
} from "@/server/services/pdf-model-candidate-service";

type Args = {
  manifestArtifactId?: string;
  gateArtifactId?: string;
  analysisArtifactId?: string;
  note?: string;
  json: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { json: false };
  for (const arg of argv) {
    if (arg === "--json") args.json = true;
    else if (arg.startsWith("--manifestArtifactId=")) {
      args.manifestArtifactId = arg.slice("--manifestArtifactId=".length);
    } else if (arg.startsWith("--gateArtifactId=")) {
      args.gateArtifactId = arg.slice("--gateArtifactId=".length);
    } else if (arg.startsWith("--analysisArtifactId=")) {
      args.analysisArtifactId = arg.slice("--analysisArtifactId=".length);
    } else if (arg.startsWith("--note=")) {
      args.note = arg.slice("--note=".length);
    }
  }
  return args;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required to create PDF model candidates.");
    process.exit(1);
  }

  const args = parseArgs(process.argv.slice(2));
  if (!args.manifestArtifactId) {
    console.error("--manifestArtifactId=<id> is required.");
    process.exit(1);
  }

  const candidate = await createPdfModelCandidateFromManifestArtifact({
    manifestArtifactId: args.manifestArtifactId,
    gateArtifactId: args.gateArtifactId,
    analysisArtifactId: args.analysisArtifactId,
    note: args.note,
  });

  if (args.json) {
    console.log(JSON.stringify(candidate, null, 2));
    return;
  }

  console.log("Created PDF model candidate");
  console.log(`  id: ${candidate.id}`);
  console.log(`  model: ${candidate.modelId}@${candidate.modelVersion}`);
  console.log(`  target: ${candidate.modelTarget}`);
  console.log(`  status: ${candidate.status}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : "Unexpected error.");
  process.exit(1);
});
