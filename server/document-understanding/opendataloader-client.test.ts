import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import fixture from "@/server/document-understanding/__fixtures__/opendataloader-annual-report.json";

const convertMock = vi.fn();

vi.mock("@/server/document-understanding/opendataloader-config", async () => {
  const actual = await vi.importActual<typeof import("@/server/document-understanding/opendataloader-config")>(
    "@/server/document-understanding/opendataloader-config",
  );
  return actual;
});

vi.mock("@opendataloader/pdf", () => ({
  convert: convertMock,
}));

vi.mock("@/server/document-understanding/opendataloader-runtime", () => ({
  assertOpenDataLoaderRuntimeReady: vi.fn(async () => ({
    packageInstalled: true,
    packageVersion: "2.2.1",
    java: {
      rawVersion: "17.0.0",
      majorVersion: 17,
      available: true,
    },
    localModeReady: true,
    hybridConfigured: true,
  })),
}));

describe("opendataloader-client", () => {
  beforeEach(() => {
    convertMock.mockReset();
  });

  afterEach(async () => {
    const tmpDir = path.join(process.cwd(), ".tmp", "odl-client-tests");
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("parses a filing through local mode and discovers JSON, markdown, and annotated PDF artifacts", async () => {
    convertMock.mockImplementationOnce(async (_inputPath: string, options: { outputDir?: string }) => {
      const outputDir = options.outputDir!;
      await fs.mkdir(outputDir, { recursive: true });
      await fs.writeFile(
        path.join(outputDir, "sample.json"),
        JSON.stringify(fixture, null, 2),
      );
      await fs.writeFile(path.join(outputDir, "sample.md"), "# Arsregnskap 2024");
      await fs.writeFile(path.join(outputDir, "sample_annotated.pdf"), Buffer.from("%PDF-1.4"));
      return "";
    });

    const { parseAnnualReportPdfWithOpenDataLoader } = await import(
      "@/server/document-understanding/opendataloader-client"
    );
    const result = await parseAnnualReportPdfWithOpenDataLoader({
      pdfBuffer: Buffer.from("%PDF-1.4"),
      sourceFilename: "sample.pdf",
      preflight: {
        pageCount: 4,
        hasTextLayer: true,
        hasReliableTextLayer: true,
        parsedPages: [],
      },
      config: {
        enabled: true,
        mode: "local",
        hybridBackend: "docling-fast",
        hybridUrl: null,
        forceOcr: false,
        useStructTree: true,
        timeoutMs: 30_000,
        dualRun: false,
        storeAnnotatedPdf: true,
        fallbackToLegacy: true,
      },
    });

    expect(convertMock).toHaveBeenCalledTimes(1);
    expect(convertMock.mock.calls[0]?.[1]).toMatchObject({
      format: "json,markdown,pdf",
      useStructTree: true,
      quiet: true,
      keepLineBreaks: true,
    });
    expect(result.routing.executionMode).toBe("local");
    expect(result.artifacts.markdown?.filename).toBe("sample.md");
    expect(result.artifacts.annotatedPdf?.filename).toBe("sample_annotated.pdf");
    expect(result.annualReportPages).toHaveLength(4);
  });

  it("routes scanned documents through hybrid mode with timeout and backend options", async () => {
    convertMock.mockImplementationOnce(async (_inputPath: string, options: { outputDir?: string }) => {
      const outputDir = options.outputDir!;
      await fs.mkdir(outputDir, { recursive: true });
      await fs.writeFile(
        path.join(outputDir, "scanned.json"),
        JSON.stringify(fixture, null, 2),
      );
      await fs.writeFile(path.join(outputDir, "scanned.md"), "# Scanned");
      return "";
    });

    const { parseAnnualReportPdfWithOpenDataLoader } = await import(
      "@/server/document-understanding/opendataloader-client"
    );
    const result = await parseAnnualReportPdfWithOpenDataLoader({
      pdfBuffer: Buffer.from("%PDF-1.4"),
      sourceFilename: "scanned.pdf",
      preflight: {
        pageCount: 4,
        hasTextLayer: false,
        hasReliableTextLayer: false,
        parsedPages: [],
      },
      config: {
        enabled: true,
        mode: "auto",
        hybridBackend: "docling-fast",
        hybridUrl: "http://localhost:5002",
        forceOcr: false,
        useStructTree: false,
        timeoutMs: 45_000,
        dualRun: false,
        storeAnnotatedPdf: false,
        fallbackToLegacy: true,
      },
    });

    expect(convertMock.mock.calls[0]?.[1]).toMatchObject({
      hybrid: "docling-fast",
      hybridMode: "full",
      hybridUrl: "http://localhost:5002",
      hybridTimeout: "45000",
    });
    expect(result.routing.executionMode).toBe("hybrid");
    expect(result.routing.requiresOcr).toBe(true);
  });

  it("surfaces OpenDataLoader execution failures cleanly", async () => {
    convertMock.mockRejectedValueOnce(new Error("Timed out while waiting for hybrid backend"));

    const { parseAnnualReportPdfWithOpenDataLoader } = await import(
      "@/server/document-understanding/opendataloader-client"
    );

    await expect(
      parseAnnualReportPdfWithOpenDataLoader({
        pdfBuffer: Buffer.from("%PDF-1.4"),
        sourceFilename: "failed.pdf",
        preflight: {
          pageCount: 4,
          hasTextLayer: false,
          hasReliableTextLayer: false,
          parsedPages: [],
        },
        config: {
          enabled: true,
          mode: "auto",
          hybridBackend: "docling-fast",
          hybridUrl: "http://localhost:5002",
          forceOcr: false,
          useStructTree: false,
          timeoutMs: 10_000,
          dualRun: false,
          storeAnnotatedPdf: false,
          fallbackToLegacy: true,
        },
      }),
    ).rejects.toThrow("Timed out while waiting for hybrid backend");
  });

  it("includes concise raw and normalized diagnostics when no pages survive normalization", async () => {
    convertMock.mockImplementationOnce(async (_inputPath: string, options: { outputDir?: string }) => {
      const outputDir = options.outputDir!;
      await fs.mkdir(outputDir, { recursive: true });
      await fs.writeFile(path.join(outputDir, "empty.json"), JSON.stringify({ elements: [] }));
      await fs.writeFile(path.join(outputDir, "empty.md"), "");
      return "";
    });

    const { OpenDataLoaderParseError, parseAnnualReportPdfWithOpenDataLoader } = await import(
      "@/server/document-understanding/opendataloader-client"
    );

    await expect(
      parseAnnualReportPdfWithOpenDataLoader({
        pdfBuffer: Buffer.from("%PDF-1.4"),
        sourceFilename: "empty.pdf",
        preflight: {
          pageCount: 1,
          hasTextLayer: true,
          hasReliableTextLayer: true,
          parsedPages: [],
        },
        config: {
          enabled: true,
          mode: "local",
          hybridBackend: "docling-fast",
          hybridUrl: null,
          forceOcr: false,
          useStructTree: false,
          timeoutMs: 30_000,
          dualRun: false,
          storeAnnotatedPdf: false,
          fallbackToLegacy: true,
        },
      }),
    ).rejects.toMatchObject({
      name: "OpenDataLoaderParseError",
      diagnostics: {
        failureStage: "annual-report-page-conversion",
        rawOutput: {
          topLevelKeys: ["elements"],
          elementCount: 0,
          pageCount: 0,
        },
        normalizedOutput: {
          pageCount: 0,
          blockCount: 0,
          tableCount: 0,
        },
        annualReportPageCount: 0,
      },
    } satisfies Partial<OpenDataLoaderParseError>);
  });
});
