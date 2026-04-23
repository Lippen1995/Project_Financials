import fixture from "@/server/document-understanding/__fixtures__/opendataloader-annual-report.json";
import {
  convertNormalizedDocumentToAnnualReportPages,
  normalizeOpenDataLoaderPayload,
  summarizeOpenDataLoaderRawPayload,
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

  it("preserves elements nested under live-style page containers", () => {
    const liveStylePayload = {
      pages: [
        {
          pageNumber: 1,
          elements: [
            {
              type: "heading",
              id: "h1",
              "bounding box": [72, 730, 520, 760],
              "heading level": 1,
              content: "Arsregnskap 2024",
            },
            {
              type: "table",
              id: "t1",
              "bounding box": [72, 600, 520, 720],
              content: "2024 2023\nSalgsinntekter 103097000 95210000",
            },
          ],
        },
      ],
    };

    const rawSummary = summarizeOpenDataLoaderRawPayload(liveStylePayload);
    const normalized = normalizeOpenDataLoaderPayload({
      payload: liveStylePayload,
      engineVersion: "2.2.1",
      engineMode: "local",
      hasEmbeddedText: true,
    });
    const pages = convertNormalizedDocumentToAnnualReportPages(normalized);

    expect(rawSummary.elementCount).toBe(2);
    expect(rawSummary.pageCount).toBe(1);
    expect(rawSummary.elementContainerPaths).toContain("$.pages[0].elements");
    expect(normalized.pageCount).toBe(1);
    expect(normalized.pages[0]?.blocks).toHaveLength(2);
    expect(normalized.pages[0]?.tables).toHaveLength(1);
    expect(pages[0]?.pageNumber).toBe(1);
    expect(pages[0]?.text).toContain("Salgsinntekter 103097000 95210000");
  });

  it("preserves live OpenDataLoader document-level kids elements", () => {
    const livePayload = {
      "file name": "opendataloader-smoke.pdf",
      "number of pages": 2,
      kids: [
        {
          type: "heading",
          id: 1,
          level: "Doctitle",
          "page number": 1,
          "bounding box": [50, 763.525, 152.091, 790.241],
          "heading level": 1,
          content: "Arsregnskap 2024 Eksempel Finans AS",
        },
        {
          type: "paragraph",
          id: 2,
          "page number": 2,
          "bounding box": [50, 707.525, 229.784, 790.241],
          content:
            "Resultatregnskap Belop i: NOK 2024 2023 Salgsinntekter 103097000 95210000",
        },
      ],
    };

    const rawSummary = summarizeOpenDataLoaderRawPayload(livePayload);
    const normalized = normalizeOpenDataLoaderPayload({
      payload: livePayload,
      engineVersion: "2.2.1",
      engineMode: "local",
      hasEmbeddedText: true,
    });
    const pages = convertNormalizedDocumentToAnnualReportPages(normalized);

    expect(rawSummary.topLevelKeys).toContain("kids");
    expect(rawSummary.elementContainerPaths).toEqual(["$.kids"]);
    expect(rawSummary.pageCount).toBe(2);
    expect(normalized.pageCount).toBe(2);
    expect(pages).toHaveLength(2);
    expect(pages[1]?.text).toContain("Resultatregnskap");
  });

  it("preserves live OpenDataLoader list item content for statement rows", () => {
    const livePayload = {
      kids: [
        {
          type: "paragraph",
          id: 1,
          "page number": 2,
          "bounding box": [50, 749.525, 197.961, 790.241],
          content: "Resultatregnskap\nBelop i: NOK\nAlle tall i notene er NOK 1 000",
        },
        {
          type: "list",
          id: 2,
          "page number": 2,
          "bounding box": [50, 665.525, 251.784, 748.241],
          "list items": [
            {
              type: "list item",
              "page number": 2,
              "bounding box": [50, 665.525, 251.784, 748.241],
              content:
                "2023 2024\nSalgsinntekter 103097000 95210000\nSum driftsinntekter 103097000 95210000",
              kids: [],
            },
          ],
        },
      ],
    };

    const normalized = normalizeOpenDataLoaderPayload({
      payload: livePayload,
      engineVersion: "2.2.1",
      engineMode: "local",
      hasEmbeddedText: true,
    });
    const pages = convertNormalizedDocumentToAnnualReportPages(normalized);

    expect(normalized.pages[0]?.blocks[1]?.kind).toBe("list");
    expect(normalized.pages[0]?.blocks[1]?.text).toContain(
      "Salgsinntekter 103097000 95210000",
    );
    expect(pages[0]?.lines.map((line) => line.text)).toContain(
      "Salgsinntekter 103097000 95210000",
    );
  });
});
