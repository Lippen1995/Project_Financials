import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

import { PreflightResult } from "@/integrations/brreg/annual-report-financials/types";
import { chooseOpenDataLoaderRoute, resolveOpenDataLoaderConfig } from "@/server/document-understanding/opendataloader-config";
import {
  convertNormalizedDocumentToAnnualReportPages,
  normalizeOpenDataLoaderPayload,
  summarizeOpenDataLoaderRawPayload,
} from "@/server/document-understanding/opendataloader-normalizer";
import { assertOpenDataLoaderRuntimeReady } from "@/server/document-understanding/opendataloader-runtime";
import {
  OpenDataLoaderArtifactFile,
  OpenDataLoaderGeneratedArtifacts,
  OpenDataLoaderNormalizedOutputSummary,
  OpenDataLoaderParseDiagnostics,
  OpenDataLoaderParseResult,
  OpenDataLoaderResolvedConfig,
} from "@/server/document-understanding/opendataloader-types";

type OpenDataLoaderLoadedArtifacts = OpenDataLoaderGeneratedArtifacts & {
  outputFilenames: string[];
};

export class OpenDataLoaderParseError extends Error {
  constructor(
    message: string,
    public readonly diagnostics: OpenDataLoaderParseDiagnostics,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "OpenDataLoaderParseError";
  }
}

function toChecksum(content: Buffer) {
  return createHash("sha256").update(content).digest("hex");
}

async function listFilesRecursively(rootDirectory: string): Promise<string[]> {
  const entries = await fs.readdir(rootDirectory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = path.join(rootDirectory, entry.name);
      if (entry.isDirectory()) {
        return listFilesRecursively(absolutePath);
      }
      return [absolutePath];
    }),
  );

  return nested.flat();
}

function pickArtifactFile(paths: string[], extensions: string[], preferredStem: string) {
  const normalizedStem = preferredStem.toLowerCase();
  const candidates = paths.filter((candidate) =>
    extensions.some((extension) => candidate.toLowerCase().endsWith(extension)),
  );

  return (
    candidates.find((candidate) => path.basename(candidate).toLowerCase().includes(normalizedStem)) ??
    candidates.find((candidate) => path.basename(candidate).toLowerCase().includes("annotated")) ??
    candidates[0] ??
    null
  );
}

async function readArtifactFile(absolutePath: string, mimeType: string): Promise<OpenDataLoaderArtifactFile> {
  return {
    filename: path.basename(absolutePath),
    mimeType,
    content: await fs.readFile(absolutePath),
    storageMetadata: {
      generatedBy: "opendataloader",
      sourcePath: absolutePath,
    },
  };
}

async function loadGeneratedArtifacts(input: {
  outputDir: string;
  inputStem: string;
  includeAnnotatedPdf: boolean;
}): Promise<OpenDataLoaderLoadedArtifacts> {
  const generatedPaths = await listFilesRecursively(input.outputDir);
  const jsonPath = pickArtifactFile(generatedPaths, [".json"], input.inputStem);
  if (!jsonPath) {
    throw new Error("OpenDataLoader completed without writing a JSON artifact.");
  }

  const markdownPath = pickArtifactFile(generatedPaths, [".md", ".markdown"], input.inputStem);
  const annotatedPdfPath = input.includeAnnotatedPdf
    ? pickArtifactFile(generatedPaths, [".pdf"], `${input.inputStem}_annotated`)
    : null;

  const rawJson = await readArtifactFile(jsonPath, "application/json");
  const payload = JSON.parse(rawJson.content.toString("utf8"));

  return {
    outputFilenames: generatedPaths.map((generatedPath) =>
      path.relative(input.outputDir, generatedPath),
    ).sort(),
    rawJson: {
      ...rawJson,
      payload,
    },
    markdown: markdownPath ? await readArtifactFile(markdownPath, "text/markdown") : null,
    annotatedPdf:
      annotatedPdfPath ? await readArtifactFile(annotatedPdfPath, "application/pdf") : null,
  };
}

async function resolveOpenDataLoaderEngineVersion() {
  try {
    const packageJsonPath = path.join(
      process.cwd(),
      "node_modules",
      "@opendataloader",
      "pdf",
      "package.json",
    );
    const content = await fs.readFile(packageJsonPath, "utf8");
    const parsed = JSON.parse(content) as { version?: string };
    return parsed.version ?? null;
  } catch {
    return null;
  }
}

function summarizeNormalizedDocument(
  pageResult: OpenDataLoaderParseResult["normalizedDocument"],
): OpenDataLoaderNormalizedOutputSummary {
  const blockKindCounts = pageResult.pages.reduce<Record<string, number>>((counts, page) => {
    for (const block of page.blocks) {
      counts[block.kind] = (counts[block.kind] ?? 0) + 1;
    }
    return counts;
  }, {});
  const rawTypeCounts = pageResult.pages.reduce<Record<string, number>>((counts, page) => {
    for (const block of page.blocks) {
      counts[block.rawType] = (counts[block.rawType] ?? 0) + 1;
    }
    return counts;
  }, {});

  return {
    pageCount: pageResult.pages.length,
    blockCount: pageResult.pages.reduce((sum, page) => sum + page.blocks.length, 0),
    tableCount: pageResult.pages.reduce((sum, page) => sum + page.tables.length, 0),
    blockKindCounts,
    rawTypeCounts,
    pages: pageResult.pages.map((page) => ({
      pageNumber: page.pageNumber,
      blockCount: page.blocks.length,
      tableCount: page.tables.length,
      textLength: page.text.length,
      blockKindCounts: page.blocks.reduce<Record<string, number>>((counts, block) => {
        counts[block.kind] = (counts[block.kind] ?? 0) + 1;
        return counts;
      }, {}),
      rawTypeCounts: page.blocks.reduce<Record<string, number>>((counts, block) => {
        counts[block.rawType] = (counts[block.rawType] ?? 0) + 1;
        return counts;
      }, {}),
    })),
  };
}


/**
 * Quick TCP-connect probe. Returns immediately on success; rejects with the
 * underlying error (with `code` populated) on failure. Used to fail fast
 * when the Docling server isn't reachable on the network — far cheaper than
 * sending the full multipart parse request and waiting for its timeout.
 */
async function probeDoclingPort(hostname: string, port: number, timeoutMs: number): Promise<void> {
  const { connect } = await import("node:net");
  return new Promise<void>((resolve, reject) => {
    const socket = connect({ host: hostname, port });
    const fail = (error: NodeJS.ErrnoException) => {
      socket.removeAllListeners();
      socket.destroy();
      reject(error);
    };
    const timer = setTimeout(() => {
      const err = new Error(
        `Docling TCP probe to ${hostname}:${port} timed out after ${timeoutMs}ms`,
      ) as NodeJS.ErrnoException;
      err.code = "ETIMEDOUT";
      fail(err);
    }, timeoutMs);
    socket.once("connect", () => {
      clearTimeout(timer);
      socket.end();
      resolve();
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      fail(error as NodeJS.ErrnoException);
    });
  });
}

async function callDoclingServerDirectly(input: {
  pdfBuffer: Buffer;
  sourceFilename: string;
  hybridUrl: string;
  timeoutMs: number;
}): Promise<unknown> {
  // Use node:http directly to avoid Next.js's patched global fetch (which breaks FormData uploads)
  const { request: httpRequest } = await import("node:http");
  const parsedUrl = new URL(`${input.hybridUrl}/v1/convert/file`);

  // Before sending the heavy multipart parse request — which can sit on a
  // 30-minute response timeout when Docling is hung — verify the TCP port
  // is actually accepting connections. A 5-second probe turns "Docling is
  // gone" into a sub-second failure instead of a half-hour wait per filing.
  const probePort = Number(parsedUrl.port) || 80;
  try {
    await probeDoclingPort(parsedUrl.hostname, probePort, 5_000);
  } catch (probeError) {
    const code = (probeError as NodeJS.ErrnoException)?.code ?? "ETIMEDOUT";
    console.warn(
      `[ODL] Docling probe to ${parsedUrl.hostname}:${probePort} failed (${code}) — falling back to Legacy without sending the parse request.`,
    );
    const propagated = new Error(
      `Docling server probe failed: ${(probeError as Error)?.message ?? String(probeError)}`,
    ) as NodeJS.ErrnoException;
    propagated.code = code;
    throw propagated;
  }
  const boundary = `----DoclingBoundary${Date.now().toString(16)}`;
  const preamble = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${input.sourceFilename}"\r\nContent-Type: application/pdf\r\n\r\n`,
    "utf8",
  );
  const epilogue = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
  const body = Buffer.concat([preamble, input.pdfBuffer, epilogue]);

  const maxAttempts = 3;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await new Promise<unknown>((resolve, reject) => {
        const req = httpRequest(
          {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || 80,
            path: parsedUrl.pathname,
            method: "POST",
            headers: {
              "Content-Type": `multipart/form-data; boundary=${boundary}`,
              "Content-Length": body.length,
            },
            timeout: input.timeoutMs,
          },
          (res) => {
            const chunks: Buffer[] = [];
            res.on("data", (chunk: Buffer) => chunks.push(chunk));
            res.on("end", () => {
              const raw = Buffer.concat(chunks).toString("utf8");
              if (res.statusCode && res.statusCode >= 400) {
                reject(new Error(`Docling server responded with ${res.statusCode}: ${raw.slice(0, 200)}`));
              } else {
                try {
                  resolve(JSON.parse(raw));
                } catch {
                  reject(new Error(`Docling server returned non-JSON: ${raw.slice(0, 200)}`));
                }
              }
            });
            res.on("error", reject);
          },
        );
        req.on("timeout", () => {
          // Tag the error so the retry loop can recognise a hung server and
          // fail fast instead of waiting another full timeout per attempt.
          const timeoutError = new Error(
            `Docling request timed out after ${input.timeoutMs}ms`,
          ) as NodeJS.ErrnoException;
          timeoutError.code = "ETIMEDOUT";
          req.destroy(timeoutError);
        });
        req.on("error", reject);
        req.write(body);
        req.end();
      });
      return result;
    } catch (error) {
      lastError = error;
      const code = (error as NodeJS.ErrnoException)?.code;
      const message = (error as Error)?.message || String(error);
      // A refused/unreachable/timed-out connection means the Docling server
      // is not actually serving — either down or hung. Retrying with 30–60 s
      // backoff just burns 90+ minutes per filing for nothing (the timeout
      // alone is 30 minutes); fail fast straight to the Legacy fallback.
      // Genuinely transient HTTP errors (5xx) still get retried below.
      if (
        code === "ECONNREFUSED" ||
        code === "ENOTFOUND" ||
        code === "ECONNRESET" ||
        code === "ETIMEDOUT"
      ) {
        console.warn(
          `[ODL] Docling server unreachable (${code}) — skipping retries, falling back to Legacy.`,
        );
        break;
      }
      if (attempt < maxAttempts) {
        const backoffMs = 30_000 * attempt;
        console.warn(
          `[ODL] callDoclingServerDirectly attempt ${attempt} failed (${code ?? "?"}: ${message}), retrying in ${backoffMs / 1000}s…`,
        );
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
  }
  throw lastError;
}

function formatDiagnosticsForError(diagnostics: OpenDataLoaderParseDiagnostics) {
  return JSON.stringify(
    {
      input: diagnostics.input,
      artifacts: diagnostics.artifacts,
      rawOutput: diagnostics.rawOutput,
      normalizedOutput: diagnostics.normalizedOutput,
      annualReportPageCount: diagnostics.annualReportPageCount,
      failureStage: diagnostics.failureStage,
      failureReason: diagnostics.failureReason,
    },
    null,
    2,
  );
}

export async function parseAnnualReportPdfWithOpenDataLoader(input: {
  pdfBuffer: Buffer;
  sourceFilename: string;
  preflight: PreflightResult;
  config?: OpenDataLoaderResolvedConfig;
  routeOverride?: OpenDataLoaderParseResult["routing"];
}) {
  const config = input.config ?? resolveOpenDataLoaderConfig();
  const route =
    input.routeOverride ??
    chooseOpenDataLoaderRoute({
      config,
      preflight: input.preflight,
    });

  if (!route.enabled) {
    throw new Error("OpenDataLoader is disabled.");
  }

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "projectx-odl-"));
  const inputPath = path.join(tempRoot, input.sourceFilename);
  const outputDir = path.join(tempRoot, "output");
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(inputPath, input.pdfBuffer);

  const engineVersion = await resolveOpenDataLoaderEngineVersion();
  const startedAt = Date.now();
  const diagnostics: OpenDataLoaderParseDiagnostics = {
    input: {
      sourceFilename: input.sourceFilename,
      sourceByteLength: input.pdfBuffer.byteLength,
      preflightPageCount: input.preflight.pageCount,
      hasTextLayer: input.preflight.hasTextLayer,
      hasReliableTextLayer: input.preflight.hasReliableTextLayer,
      route: {
        executionMode: route.executionMode,
        hybridMode: route.hybridMode,
        requiresOcr: route.requiresOcr,
        useStructTree: route.useStructTree,
        reasonCode: route.reasonCode,
        reason: route.reason,
      },
    },
  };

  try {
    await assertOpenDataLoaderRuntimeReady({
      config,
      route,
    });

    if (route.requiresOcr && route.executionMode === "hybrid" && config.hybridUrl) {
      const rawPayload = await callDoclingServerDirectly({
        pdfBuffer: input.pdfBuffer,
        sourceFilename: input.sourceFilename,
        hybridUrl: config.hybridUrl,
        timeoutMs: config.timeoutMs,
      });
      const overridePath = path.join(outputDir, `${path.parse(input.sourceFilename).name}.json`);
      await fs.writeFile(overridePath, JSON.stringify(rawPayload), "utf8");
    } else {
      const { convert } = await import("@opendataloader/pdf");
      const format = ["json", "markdown", ...(config.storeAnnotatedPdf ? ["pdf"] : [])].join(",");
      await convert(inputPath, {
        outputDir,
        format,
        quiet: true,
        keepLineBreaks: true,
        useStructTree: route.useStructTree,
        hybrid: route.executionMode === "hybrid" ? config.hybridBackend : undefined,
        hybridMode: route.executionMode === "hybrid" ? route.hybridMode ?? "auto" : undefined,
        hybridUrl: route.executionMode === "hybrid" ? config.hybridUrl ?? undefined : undefined,
        hybridTimeout: route.executionMode === "hybrid" ? String(config.timeoutMs) : undefined,
        hybridFallback: route.executionMode === "hybrid" ? config.fallbackToLegacy : undefined,
        imageOutput: "off",
        includeHeaderFooter: false,
      });
    }
    const artifacts = await loadGeneratedArtifacts({
      outputDir,
      inputStem: path.parse(input.sourceFilename).name,
      includeAnnotatedPdf: config.storeAnnotatedPdf,
    });
    diagnostics.artifacts = {
      outputFilenames: artifacts.outputFilenames,
      rawJsonFilename: artifacts.rawJson.filename,
      markdownFilename: artifacts.markdown?.filename ?? null,
      annotatedPdfFilename: artifacts.annotatedPdf?.filename ?? null,
    };
    diagnostics.rawOutput = summarizeOpenDataLoaderRawPayload(artifacts.rawJson.payload);

    const normalizedDocument = normalizeOpenDataLoaderPayload({
      payload: artifacts.rawJson.payload,
      engineVersion,
      engineMode: route.executionMode,
      hasEmbeddedText: input.preflight.hasReliableTextLayer,
    });
    diagnostics.normalizedOutput = summarizeNormalizedDocument(normalizedDocument);
    const annualReportPages = convertNormalizedDocumentToAnnualReportPages(normalizedDocument);
    diagnostics.annualReportPageCount = annualReportPages.length;

    if (annualReportPages.length === 0) {
      diagnostics.failureStage = "annual-report-page-conversion";
      diagnostics.failureReason = "OpenDataLoader returned no normalized pages for this filing.";
      throw new OpenDataLoaderParseError(
        `OpenDataLoader returned no normalized pages for this filing.\n${formatDiagnosticsForError(diagnostics)}`,
        diagnostics,
      );
    }

    const blockCount = normalizedDocument.pages.reduce(
      (sum, page) => sum + page.blocks.length,
      0,
    );
    const tableBlockCount = normalizedDocument.pages.reduce(
      (sum, page) => sum + page.blocks.filter((block) => block.kind === "table").length,
      0,
    );

    return {
      engine: "OPENDATALOADER",
      engineVersion,
      routing: route,
      preflight: input.preflight,
      normalizedDocument,
      annualReportPages,
      diagnostics,
      artifacts: {
        rawJson: {
          ...artifacts.rawJson,
          storageMetadata: {
            ...artifacts.rawJson.storageMetadata,
            checksum: toChecksum(artifacts.rawJson.content),
          },
        },
        markdown: artifacts.markdown
          ? {
              ...artifacts.markdown,
              storageMetadata: {
                ...artifacts.markdown.storageMetadata,
                checksum: toChecksum(artifacts.markdown.content),
              },
            }
          : null,
        annotatedPdf: artifacts.annotatedPdf
          ? {
              ...artifacts.annotatedPdf,
              storageMetadata: {
                ...artifacts.annotatedPdf.storageMetadata,
                checksum: toChecksum(artifacts.annotatedPdf.content),
              },
            }
          : null,
      },
      metrics: {
        durationMs: Date.now() - startedAt,
        pageCount: normalizedDocument.pageCount,
        blockCount,
        tableBlockCount,
      },
    } satisfies OpenDataLoaderParseResult;
  } catch (error) {
    if (error instanceof OpenDataLoaderParseError) {
      throw error;
    }

    diagnostics.failureStage = diagnostics.rawOutput
      ? "normalization-or-conversion"
      : diagnostics.artifacts
        ? "raw-output-loading"
        : "opendataloader-invocation";
    diagnostics.failureReason = error instanceof Error ? error.message : String(error);
    throw new OpenDataLoaderParseError(
      `OpenDataLoader parse failed at ${diagnostics.failureStage}: ${diagnostics.failureReason}\n${formatDiagnosticsForError(diagnostics)}`,
      diagnostics,
      error,
    );
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}
