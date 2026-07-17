import path from "node:path";

import { prisma } from "@/lib/prisma";
import {
  DEFAULT_BOARD_REPORT_BATCH_LIMIT,
  DEFAULT_BOARD_REPORT_PUBLICATION_THRESHOLD,
  runBoardReportBatch,
  selectLargestLatestBoardReportCandidates,
  summarizeBoardReportBatch,
} from "@/server/batch/board-report-batch";

function valueFor(name: string): string | null {
  const prefix = `--${name}=`;
  const inline = process.argv.find((argument) => argument.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
}

function numberFor(name: string, fallback: number): number {
  const raw = valueFor(name);
  const value = raw === null ? fallback : Number(raw);
  if (!Number.isFinite(value)) throw new Error(`--${name} must be numeric.`);
  return value;
}

async function main() {
  const limit = numberFor("limit", DEFAULT_BOARD_REPORT_BATCH_LIMIT);
  const publicationThreshold = numberFor(
    "publish-threshold",
    DEFAULT_BOARD_REPORT_PUBLICATION_THRESHOLD,
  );
  const checkpointPath = path.resolve(
    valueFor("checkpoint") ?? "output/board-report-batch/top-200-latest.json",
  );

  if (process.argv.includes("--dry-run")) {
    const candidates = await selectLargestLatestBoardReportCandidates(limit);
    process.stdout.write(`${JSON.stringify({ limit, publicationThreshold, candidates }, null, 2)}\n`);
    return;
  }

  process.stdout.write(
    `Starting board-report batch: limit=${limit}, publish confidence>${publicationThreshold}, checkpoint=${checkpointPath}\n`,
  );
  const checkpoint = await runBoardReportBatch({
    checkpointPath,
    limit,
    publicationThreshold,
    onProgress(current, item) {
      const summary = summarizeBoardReportBatch(current.items);
      process.stdout.write(
        `[${summary.completed}/${summary.total}] #${item.rank} ${item.orgNumber} ${item.companyName}: ${item.status}` +
          `${item.confidence === null ? "" : ` (${(item.confidence * 100).toFixed(1)}%)`}` +
          `${item.error ? ` - ${item.error}` : ""}\n`,
      );
    },
  });
  process.stdout.write(`${JSON.stringify(summarizeBoardReportBatch(checkpoint.items), null, 2)}\n`);
}

main()
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
