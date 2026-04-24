import { afterEach, describe, expect, it, vi } from "vitest";

function createPngBuffer(width: number, height: number) {
  const buffer = Buffer.alloc(24);
  buffer.write("89504e470d0a1a0a", 0, "hex");
  buffer.writeUInt32BE(13, 8);
  buffer.write("IHDR", 12, "ascii");
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

describe("annual-report OCR guardrails", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("rejects tiny OCR image regions before recognize is called", async () => {
    const screenshots = {
      pages: [
        {
          pageNumber: 2,
          data: createPngBuffer(16, 24),
        },
      ],
    };
    const recognize = vi.fn();
    const terminate = vi.fn();

    vi.doMock("pdf-parse", () => ({
      PDFParse: class {
        async getScreenshot() {
          return screenshots;
        }
        async destroy() {}
      },
    }));

    vi.doMock("tesseract.js", () => ({
      createWorker: vi.fn(async () => ({
        recognize,
        terminate,
      })),
    }));

    const module = await import("@/integrations/brreg/annual-report-financials/ocr");
    const result = await module.extractOcrPagesWithDiagnostics(Buffer.from("pdf"));

    expect(result.pages).toEqual([]);
    expect(result.diagnostics.tinyCropSkippedCount).toBe(1);
    expect(result.diagnostics.ocrAttemptCount).toBe(0);
    expect(result.diagnostics.usableOcrRegionCount).toBe(0);
    expect(result.diagnostics.manualReviewDueToOcrQualityCount).toBe(1);
    expect(result.diagnostics.regionFailures[0]).toMatchObject({
      pageNumber: 2,
      stage: "pre_ocr_validation",
      category: "tiny_crop",
    });
    expect(recognize).not.toHaveBeenCalled();
    expect(terminate).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid OCR image buffers before OCR", async () => {
    const screenshots = {
      pages: [
        {
          pageNumber: 3,
          data: Buffer.alloc(0),
        },
      ],
    };

    vi.doMock("pdf-parse", () => ({
      PDFParse: class {
        async getScreenshot() {
          return screenshots;
        }
        async destroy() {}
      },
    }));

    vi.doMock("tesseract.js", () => ({
      createWorker: vi.fn(async () => ({
        recognize: vi.fn(),
        terminate: vi.fn(),
      })),
    }));

    const module = await import("@/integrations/brreg/annual-report-financials/ocr");
    const result = await module.extractOcrPagesWithDiagnostics(Buffer.from("pdf"));

    expect(result.pages).toEqual([]);
    expect(result.diagnostics.invalidCropCount).toBe(1);
    expect(result.diagnostics.ocrAttemptCount).toBe(0);
    expect(result.diagnostics.regionFailures[0]).toMatchObject({
      pageNumber: 3,
      stage: "pre_ocr_validation",
      category: "invalid_image_buffer",
    });
  });

  it("records weak OCR quality conservatively with structured counters", async () => {
    const screenshots = {
      pages: [
        {
          pageNumber: 4,
          data: createPngBuffer(256, 256),
        },
      ],
    };

    vi.doMock("pdf-parse", () => ({
      PDFParse: class {
        async getScreenshot() {
          return screenshots;
        }
        async destroy() {}
      },
    }));

    vi.doMock("tesseract.js", () => ({
      createWorker: vi.fn(async () => ({
        recognize: vi.fn(async () => ({
          data: {
            text: " ",
            words: [],
          },
        })),
        terminate: vi.fn(),
      })),
    }));

    const module = await import("@/integrations/brreg/annual-report-financials/ocr");
    const result = await module.extractOcrPagesWithDiagnostics(Buffer.from("pdf"));

    expect(result.pages).toEqual([]);
    expect(result.diagnostics.ocrAttemptCount).toBe(1);
    expect(result.diagnostics.usableOcrRegionCount).toBe(0);
    expect(result.diagnostics.pageLevelOcrFallbackCount).toBe(1);
    expect(result.diagnostics.manualReviewDueToOcrQualityCount).toBe(1);
    expect(result.diagnostics.regionFailures[0]).toMatchObject({
      pageNumber: 4,
      stage: "recognition",
      category: "ocr_quality_too_weak",
    });
    expect(result.diagnostics.suppressedFailureMessages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "OCR produced no usable lines for this page-level region.",
          count: 1,
        }),
      ]),
    );
  });
});
