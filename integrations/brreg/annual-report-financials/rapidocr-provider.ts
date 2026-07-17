import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { normalizeNorwegianText } from "@/integrations/brreg/annual-report-financials/text";
import type { AnnualReportParsedPage } from "@/integrations/brreg/annual-report-financials/types";

const execFileAsync = promisify(execFile);

type RapidLine = {
  text: string;
  confidence: number;
  box: [[number, number], [number, number], [number, number], [number, number]];
};

type RapidPayload = {
  engine: "rapidocr";
  pages: Array<{ pageNumber: number; text: string; lines: RapidLine[] }>;
};

function isRapidPayload(value: unknown): value is RapidPayload {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RapidPayload>;
  return candidate.engine === "rapidocr" && Array.isArray(candidate.pages) && candidate.pages.every(
    (page) =>
      Number.isInteger(page?.pageNumber) &&
      typeof page?.text === "string" &&
      Array.isArray(page?.lines) &&
      page.lines.every(
        (line) =>
          typeof line?.text === "string" &&
          Number.isFinite(line?.confidence) &&
          Array.isArray(line?.box) &&
          line.box.length === 4,
      ),
  );
}

export function parseRapidOcrPayload(stdout: string): { pages: AnnualReportParsedPage[] } {
  let payload: unknown;
  try {
    payload = JSON.parse(stdout);
  } catch {
    throw new Error("RapidOCR sidecar returned an invalid payload.");
  }
  if (!isRapidPayload(payload)) {
    throw new Error("RapidOCR sidecar returned an invalid payload.");
  }

  return {
    pages: payload.pages.map((page) => {
      const blocks = page.lines.map((line, index) => {
        const xs = line.box.map((point) => point[0]);
        const ys = line.box.map((point) => point[1]);
        return {
          id: `rapidocr-${page.pageNumber}-${index}`,
          kind: "paragraph" as const,
          rawType: "rapidocr_line",
          text: line.text,
          normalizedText: normalizeNorwegianText(line.text),
          bbox: {
            left: Math.min(...xs),
            bottom: Math.min(...ys),
            right: Math.max(...xs),
            top: Math.max(...ys),
          },
          metadata: { confidence: line.confidence },
          source: {
            engine: "LEGACY" as const,
            engineMode: "legacy" as const,
            sourceElementId: `rapidocr-${page.pageNumber}-${index}`,
            sourceRawType: "rapidocr_line",
            order: index,
          },
        };
      });
      return {
        pageNumber: page.pageNumber,
        text: page.text,
        normalizedText: normalizeNorwegianText(page.text),
        lines: [],
        hasEmbeddedText: false,
        blocks,
        tables: [],
        source: {
          engine: "LEGACY" as const,
          engineMode: "legacy" as const,
          sourceElementId: `rapidocr-page-${page.pageNumber}`,
          sourceRawType: "rapidocr_page",
          order: page.pageNumber,
        },
        metadata: { ocrDerived: true, ocrEngine: "rapidocr" },
      } satisfies AnnualReportParsedPage;
    }),
  };
}

export function rapidOcrIsEnabled(): boolean {
  return process.env.BOARD_REPORT_RAPIDOCR_ENABLED?.trim().toLowerCase() === "true";
}

export async function extractRapidOcrPages(
  pdfBuffer: Buffer,
  pageNumbers: number[],
  options: { rotationDegrees?: 0 | 90 | 180 | 270 },
): Promise<{ pages: AnnualReportParsedPage[] }> {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "fjord-rapidocr-"));
  const inputPath = path.join(temporaryDirectory, "input.pdf");
  try {
    await fs.writeFile(inputPath, pdfBuffer);
    const image = process.env.BOARD_REPORT_RAPIDOCR_IMAGE?.trim() || "fjord-rapidocr";
    const { stdout } = await execFileAsync(
      "docker",
      [
        "run",
        "--rm",
        "-v",
        `${temporaryDirectory}:/work:ro`,
        image,
        "/work/input.pdf",
        pageNumbers.join(","),
        String(options.rotationDegrees ?? 0),
      ],
      { maxBuffer: 256 * 1024 * 1024, timeout: 60 * 60 * 1000 },
    );
    return parseRapidOcrPayload(stdout);
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
}
