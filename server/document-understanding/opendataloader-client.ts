import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

import { PreflightResult } from "@/integrations/brreg/annual-report-financials/types";
import { chooseOpenDataLoaderRoute, resolveOpenDataLoaderConfig } from "@/server/document-understanding/opendataloader-config";
import { convertNormalizedDocumentToPageTextLayers, normalizeOpenDataLoaderPayload } from "@/server/document-understanding/opendataloader-normalizer";
import {
  OpenDataLoaderArtifactFile,
  OpenDataLoaderGeneratedArtifacts,
  OpenDataLoaderParseResult,
  OpenDataLoaderResolvedConfig,
} from "@/server/document-understanding/opendataloader-types";

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
}) {
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
    rawJson: {
      ...rawJson,
      payload,
    },
    markdown: markdownPath ? await readArtifactFile(markdownPath, "text/markdown") : null,
    annotatedPdf:
      annotatedPdfPath ? await readArtifactFile(annotatedPdfPath, "application/pdf") : null,
  } satisfies OpenDataLoaderGeneratedArtifacts;
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

export async function parseAnnualReportPdfWithOpenDataLoader(input: {
  pdfBuffer: Buffer;
  sourceFilename: string;
  preflight: PreflightResult;
  config?: OpenDataLoaderResolvedConfig;
}) {
  const config = input.config ?? resolveOpenDataLoaderConfig();
  const route = chooseOpenDataLoaderRoute({
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

  try {
    const { convert } = await import("@opendataloader/pdf");
    const format = ["json", "markdown", ...(config.storeAnnotatedPdf ? ["pdf"] : [])].join(",");

    await convert(inputPath, {
      outputDir,
      format,
      quiet: true,
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

    const normalizedDocument = normalizeOpenDataLoaderPayload({
      payload: artifacts.rawJson.payload,
      engineVersion,
      hasEmbeddedText: input.preflight.hasReliableTextLayer,
    });
    const pageTextLayers = convertNormalizedDocumentToPageTextLayers(normalizedDocument);

    if (pageTextLayers.length === 0) {
      throw new Error("OpenDataLoader returned no normalized pages for this filing.");
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
      pageTextLayers,
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
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}
