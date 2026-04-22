import fixture from "@/server/document-understanding/__fixtures__/opendataloader-annual-report.json";
import {
  convertNormalizedDocumentToAnnualReportPages,
  normalizeOpenDataLoaderPayload,
} from "@/server/document-understanding/opendataloader-normalizer";
import { describe, expect, it } from "vitest";

describe("opendataloader-normalizer", () => {
  it("normalizes representative OpenDataLoader output into internal blocks", () => {
    const normalized = normalizeOpenDataLoaderPayload({
      payload: fixture,
      engineVersion: "2.2.1",
      engineMode: "local",
      hasEmbeddedText: true,
    });

    expect(normalized.engine).toBe("OPENDATALOADER");
    expect(normalized.engineMode).toBe("local");
    expect(normalized.pageCount).toBe(4);
    expect(normalized.pages[1]?.blocks.some((block) => block.kind === "table")).toBe(true);
    expect(normalized.pages[1]?.tables[0]?.rows.length).toBeGreaterThan(0);
    expect(normalized.pages[1]?.blocks[0]?.source.engineMode).toBe("local");
    expect(normalized.pages[1]?.blocks[0]?.bbox).toBeTruthy();
    expect(normalized.pages[1]?.tables[0]?.bbox).toBeTruthy();
    expect(normalized.pages[1]?.text).toContain("Driftsresultat 21210000 17710000");
  });

  it("converts normalized blocks and tables into rich annual-report pages used by the financial pipeline", () => {
    const normalized = normalizeOpenDataLoaderPayload({
      payload: fixture,
      engineVersion: "2.2.1",
      hasEmbeddedText: true,
    });
    const pages = convertNormalizedDocumentToAnnualReportPages(normalized);

    expect(pages).toHaveLength(4);
    expect(pages[1]?.text).toContain("Resultatregnskap");
    expect(pages[1]?.tables[0]?.rows.some((row) => row.text.includes("Salgsinntekter 103097000 95210000"))).toBe(true);
    expect(pages[1]?.blocks[0]?.bbox?.top).toBeGreaterThan(0);
    expect(pages[1]?.blocks[0]?.source.sourceElementId).toBeTruthy();
    expect(pages[1]?.source.engineMode).toBe("local");
    expect(pages[2]?.tables[0]?.rows.some((row) => row.text.includes("Sum egenkapital og gjeld 92155000 85701000"))).toBe(true);
  });
});
