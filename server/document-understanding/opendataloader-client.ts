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
  return {
    pageCount: pageResult.pages.length,
    blockCount: pageResult.pages.reduce((sum, page) => sum + page.blocks.length, 0),
    tableCount: pageResult.pages.reduce((sum, page) => sum + page.tables.length, 0),
    pages: pageResult.pages.map((page) => ({
      pageNumber: page.pageNumber,
      blockCount: page.blocks.length,
      tableCount: page.tables.length,
      textLength: page.text.length,
    })),
  };
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
      hybridTimeout:
        route.executionMode === "hybrid" ? String(config.timeoutMs) : undefined,
      hybridFallback:
        route.executionMode === "hybrid" ? config.fallbackToLegacy : undefined,
      imageOutput: "off",
      includeHeaderFooter: false,
    });

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
