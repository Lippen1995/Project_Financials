import { mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { prisma } from "@/lib/prisma";
import { publishAcceptedBoardReportExtraction } from "@/server/persistence/board-report-extraction-repository";
import { discoverAnnualReportFilingsForCompany } from "@/server/services/annual-report-financials-service";
import {
  BoardReportExtractionService,
  boardReportPublicationPolicyTag,
} from "@/server/services/board-report-extraction-service";

export const DEFAULT_BOARD_REPORT_BATCH_LIMIT = 200;
export const DEFAULT_BOARD_REPORT_PUBLICATION_THRESHOLD = 0.9;

export type BoardReportBatchItemStatus =
  | "PENDING"
  | "RUNNING"
  | "PUBLISHED"
  | "WITHHELD"
  | "NOT_FOUND"
  | "UNREADABLE"
  | "FAILED";

export type BoardReportBatchCandidate = {
  rank: number;
  companyId: string;
  orgNumber: string;
  companyName: string;
  revenue: string;
  filingId: string;
  fiscalYear: number;
  discoveredAt: string;
};

export type BoardReportBatchItem = BoardReportBatchCandidate & {
  status: BoardReportBatchItemStatus;
  attempts: number;
  extractionId: string | null;
  extractionStatus: string | null;
  confidence: number | null;
  pageRanges: Array<{ pageStart: number; pageEnd: number }>;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
};

export type BoardReportBatchCheckpoint = {
  version: "board-report-batch-v1";
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  filingDiscovery: {
    refreshedAt: string;
    failures: Array<{ orgNumber: string; error: string }>;
  };
  config: {
    limit: number;
    publicationThresholdExclusive: number;
    selection: "LATEST_BRREG_COMPANY_REVENUE_DESC_LATEST_BRREG_FILING";
  };
  items: BoardReportBatchItem[];
};

export type BoardReportBatchSummary = Record<BoardReportBatchItemStatus, number> & {
  total: number;
  completed: number;
};

export function isAbovePublicationThreshold(
  confidence: number,
  threshold = DEFAULT_BOARD_REPORT_PUBLICATION_THRESHOLD,
): boolean {
  return confidence > threshold;
}

export function summarizeBoardReportBatch(
  items: BoardReportBatchItem[],
): BoardReportBatchSummary {
  const summary: BoardReportBatchSummary = {
    total: items.length,
    completed: 0,
    PENDING: 0,
    RUNNING: 0,
    PUBLISHED: 0,
    WITHHELD: 0,
    NOT_FOUND: 0,
    UNREADABLE: 0,
    FAILED: 0,
  };
  for (const item of items) summary[item.status] += 1;
  summary.completed =
    summary.PUBLISHED +
    summary.WITHHELD +
    summary.NOT_FOUND +
    summary.UNREADABLE +
    summary.FAILED;
  return summary;
}

export async function selectLargestLatestBoardReportCandidates(
  limit = DEFAULT_BOARD_REPORT_BATCH_LIMIT,
): Promise<BoardReportBatchCandidate[]> {
  const statements = await prisma.financialStatement.findMany({
    where: {
      sourceSystem: "BRREG",
      statementScope: "COMPANY",
      revenue: { not: null },
      company: {
        annualReportFilings: {
          some: {
            sourceSystem: "BRREG",
            sourceDocumentType: "ANNUAL_REPORT_PDF",
            isLatestForFiscalYear: true,
          },
        },
      },
    },
    orderBy: [{ fiscalYear: "desc" }, { normalizedAt: "desc" }],
    select: {
      revenue: true,
      company: {
        select: {
          id: true,
          orgNumber: true,
          name: true,
          annualReportFilings: {
            where: {
              sourceSystem: "BRREG",
              sourceDocumentType: "ANNUAL_REPORT_PDF",
              isLatestForFiscalYear: true,
            },
            orderBy: [{ fiscalYear: "desc" }, { discoveredAt: "desc" }],
            take: 1,
            select: { id: true, fiscalYear: true, discoveredAt: true },
          },
        },
      },
    },
  });

  const latestByCompany = new Map<string, (typeof statements)[number]>();
  for (const statement of statements) {
    if (!latestByCompany.has(statement.company.id)) {
      latestByCompany.set(statement.company.id, statement);
    }
  }
  const ranked = [...latestByCompany.values()]
    .filter((statement) => statement.revenue !== null && statement.company.annualReportFilings[0])
    .sort((left, right) => {
      if (left.revenue === right.revenue) {
        return left.company.orgNumber.localeCompare(right.company.orgNumber);
      }
      return left.revenue! > right.revenue! ? -1 : 1;
    })
    .slice(0, limit);

  return ranked.map((statement, index) => {
    const filing = statement.company.annualReportFilings[0]!;
    return {
      rank: index + 1,
      companyId: statement.company.id,
      orgNumber: statement.company.orgNumber,
      companyName: statement.company.name,
      revenue: statement.revenue!.toString(),
      filingId: filing.id,
      fiscalYear: filing.fiscalYear,
      discoveredAt: filing.discoveredAt.toISOString(),
    };
  });
}

function itemFromCandidate(candidate: BoardReportBatchCandidate): BoardReportBatchItem {
  return {
    ...candidate,
    status: "PENDING",
    attempts: 0,
    extractionId: null,
    extractionStatus: null,
    confidence: null,
    pageRanges: [],
    error: null,
    startedAt: null,
    completedAt: null,
  };
}

async function writeCheckpointAtomic(
  checkpointPath: string,
  checkpoint: BoardReportBatchCheckpoint,
): Promise<void> {
  checkpoint.updatedAt = new Date().toISOString();
  await mkdir(path.dirname(checkpointPath), { recursive: true });
  const temporaryPath = `${checkpointPath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(checkpoint, null, 2)}\n`, "utf8");
  await rename(temporaryPath, checkpointPath);
}

async function loadOrCreateCheckpoint(input: {
  checkpointPath: string;
  limit: number;
  publicationThreshold: number;
}): Promise<BoardReportBatchCheckpoint> {
  try {
    const checkpoint = JSON.parse(
      await readFile(input.checkpointPath, "utf8"),
    ) as BoardReportBatchCheckpoint;
    if (
      checkpoint.version !== "board-report-batch-v1" ||
      checkpoint.config.limit !== input.limit ||
      checkpoint.config.publicationThresholdExclusive !== input.publicationThreshold
    ) {
      throw new Error("Existing checkpoint configuration does not match this run.");
    }
    for (const item of checkpoint.items) {
      if (item.status === "RUNNING") item.status = "PENDING";
    }
    await writeCheckpointAtomic(input.checkpointPath, checkpoint);
    return checkpoint;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  let candidates = await selectLargestLatestBoardReportCandidates(input.limit);
  const discoveryFailures: Array<{ orgNumber: string; error: string }> = [];
  for (const candidate of candidates) {
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      try {
        await discoverAnnualReportFilingsForCompany(candidate.orgNumber);
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        if (!/status 429/i.test(error instanceof Error ? error.message : String(error))) break;
        if (attempt < 6) {
          const backoffMs = Math.min(30_000, 2_000 * 2 ** (attempt - 1));
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
        }
      }
    }
    if (lastError) {
      discoveryFailures.push({
        orgNumber: candidate.orgNumber,
        error: lastError instanceof Error ? lastError.message : String(lastError),
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  if (discoveryFailures.length > 0) {
    throw new Error(
      `Could not refresh latest Brreg filings for ${discoveryFailures.length}/${candidates.length} companies; extraction was not started. First error: ${discoveryFailures[0]!.orgNumber}: ${discoveryFailures[0]!.error}`,
    );
  }
  candidates = await selectLargestLatestBoardReportCandidates(input.limit);
  if (candidates.length !== input.limit) {
    throw new Error(
      `Requested ${input.limit} companies, but only ${candidates.length} have both official revenue and a Brreg annual-report filing.`,
    );
  }
  const now = new Date().toISOString();
  const checkpoint: BoardReportBatchCheckpoint = {
    version: "board-report-batch-v1",
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    filingDiscovery: {
      refreshedAt: now,
      failures: discoveryFailures,
    },
    config: {
      limit: input.limit,
      publicationThresholdExclusive: input.publicationThreshold,
      selection: "LATEST_BRREG_COMPANY_REVENUE_DESC_LATEST_BRREG_FILING",
    },
    items: candidates.map(itemFromCandidate),
  };
  await writeCheckpointAtomic(input.checkpointPath, checkpoint);
  return checkpoint;
}

async function acquireBatchLock(lockPath: string): Promise<() => Promise<void>> {
  await mkdir(path.dirname(lockPath), { recursive: true });
  try {
    const handle = await open(lockPath, "wx");
    await handle.writeFile(`${process.pid}\n`, "utf8");
    await handle.close();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const ageMs = Date.now() - (await stat(lockPath)).mtimeMs;
    if (ageMs < 2 * 60 * 60 * 1_000) {
      throw new Error(`Another board-report batch appears active: ${lockPath}`);
    }
    await rm(lockPath, { force: true });
    return acquireBatchLock(lockPath);
  }
  return async () => rm(lockPath, { force: true });
}

function terminalStatus(extractionStatus: string, published: boolean): BoardReportBatchItemStatus {
  if (published) return "PUBLISHED";
  if (extractionStatus === "NOT_FOUND") return "NOT_FOUND";
  if (extractionStatus === "UNREADABLE" || extractionStatus === "SOURCE_UNAVAILABLE") {
    return "UNREADABLE";
  }
  return "WITHHELD";
}

export async function runBoardReportBatch(input: {
  checkpointPath: string;
  limit?: number;
  publicationThreshold?: number;
  onProgress?: (checkpoint: BoardReportBatchCheckpoint, item: BoardReportBatchItem) => void;
}): Promise<BoardReportBatchCheckpoint> {
  const limit = input.limit ?? DEFAULT_BOARD_REPORT_BATCH_LIMIT;
  const publicationThreshold =
    input.publicationThreshold ?? DEFAULT_BOARD_REPORT_PUBLICATION_THRESHOLD;
  const releaseLock = await acquireBatchLock(`${input.checkpointPath}.lock`);
  const service = new BoardReportExtractionService();
  let stopRequested = false;
  const requestStop = () => { stopRequested = true; };
  process.once("SIGINT", requestStop);
  process.once("SIGTERM", requestStop);

  try {
    const checkpoint = await loadOrCreateCheckpoint({
      checkpointPath: input.checkpointPath,
      limit,
      publicationThreshold,
    });

    for (const item of checkpoint.items) {
      if (stopRequested) break;
      if (item.status !== "PENDING" && item.status !== "FAILED") continue;
      item.status = "RUNNING";
      item.attempts += 1;
      item.startedAt = new Date().toISOString();
      item.completedAt = null;
      item.error = null;
      await writeCheckpointAtomic(input.checkpointPath, checkpoint);

      try {
        const policySuffix = boardReportPublicationPolicyTag(publicationThreshold);
        const existing = await prisma.boardReportExtraction.findFirst({
          where: { filingId: item.filingId, extractorVersion: { endsWith: policySuffix } },
          orderBy: { createdAt: "desc" },
        });
        if (existing) {
          let published = false;
          if (
            existing.status === "EXTRACTED" &&
            Boolean(existing.text) &&
            isAbovePublicationThreshold(existing.confidence, publicationThreshold)
          ) {
            await publishAcceptedBoardReportExtraction(existing.id, {
              minimumConfidenceExclusive: publicationThreshold,
            });
            published = true;
          }
          item.extractionId = existing.id;
          item.extractionStatus = existing.status;
          item.confidence = existing.confidence;
          item.status = terminalStatus(existing.status, published);
        } else {
          const outcome = await service.extractForFiling(item.filingId, {
            persist: true,
            publish: true,
            allowOcrAutoPublish: true,
            publishMinConfidence: publicationThreshold,
          });
          item.extractionId = outcome.extractionId;
          item.extractionStatus = outcome.result.status;
          item.confidence = outcome.result.confidence;
          item.pageRanges = outcome.result.pageRanges;
          item.status = terminalStatus(outcome.result.status, outcome.published);
        }
      } catch (error) {
        item.status = "FAILED";
        item.error = error instanceof Error ? error.message : String(error);
      }

      item.completedAt = new Date().toISOString();
      await writeCheckpointAtomic(input.checkpointPath, checkpoint);
      input.onProgress?.(checkpoint, item);
    }

    const summary = summarizeBoardReportBatch(checkpoint.items);
    if (summary.completed === checkpoint.items.length) {
      checkpoint.completedAt = new Date().toISOString();
      await writeCheckpointAtomic(input.checkpointPath, checkpoint);
    }
    return checkpoint;
  } finally {
    process.removeListener("SIGINT", requestStop);
    process.removeListener("SIGTERM", requestStop);
    await releaseLock();
  }
}
