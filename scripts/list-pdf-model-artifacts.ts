import { PdfModelArtifactKind } from "@prisma/client";

import { listPersistedPdfModelArtifactSnapshots } from "@/server/services/pdf-model-artifact-snapshot-service";

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function readOption(prefix: string): string | undefined {
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function readNumberOption(prefix: string): number | undefined {
  const value = readOption(prefix);
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("list:pdf-model-artifacts requires DATABASE_URL.");
  }
  const kind = readOption("--kind=");
  const snapshots = await listPersistedPdfModelArtifactSnapshots({
    kind: kind ? PdfModelArtifactKind[kind as keyof typeof PdfModelArtifactKind] : undefined,
    modelId: readOption("--modelId="),
    limit: readNumberOption("--limit="),
  });
  if (hasFlag("--json")) {
    console.log(JSON.stringify(snapshots, null, 2));
    return;
  }
  for (const snapshot of snapshots) {
    console.log(`${snapshot.id} ${snapshot.kind} ${snapshot.modelId ?? "-"} ${snapshot.modelVersion ?? "-"} ${snapshot.status}`);
  }
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
