import { describe, expect, it } from "vitest";

import { mapRowsToCanonicalFacts } from "@/integrations/brreg/annual-report-financials/canonical-mapping";
import { classifyPages } from "@/integrations/brreg/annual-report-financials/page-classification";
import {
  buildClassificationIssues,
  calculateConfidenceScore,
  canPublishAutomatically,
} from "@/integrations/brreg/annual-report-financials/publish-gate";
import {
  documentRegressionFixtures,
  ocrRegressionFixtures,
} from "@/integrations/brreg/annual-report-financials/regression-fixtures";
import { preflightAnnualReportDocument } from "@/integrations/brreg/annual-report-financials/preflight";
import { normalizeNorwegianText } from "@/integrations/brreg/annual-report-financials/text";
import { ReconstructedRow, PageTextLayer } from "@/integrations/brreg/annual-report-financials/types";
import { reconstructStatementRows } from "@/integrations/brreg/annual-report-financials/table-reconstruction";
import { validateCanonicalFacts } from "@/integrations/brreg/annual-report-financials/validation";

function escapePdfText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function buildSimplePdfBuffer(pages: string[][]) {
  const objects: string[] = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

  const pageRefs: string[] = [];
  for (let index = 0; index < pages.length; index += 1) {
    const pageObjectId = 4 + index * 2;
    const contentObjectId = pageObjectId + 1;
    pageRefs.push(`${pageObjectId} 0 R`);

    const content = [
      "BT",
      "/F1 11 Tf",
      "14 TL",
      "50 780 Td",
      ...pages[index].flatMap((line, lineIndex) =>
        lineIndex === 0 ? [`(${escapePdfText(line)}) Tj`] : ["T*", `(${escapePdfText(line)}) Tj`],
      ),
      "ET",
    ].join("\n");

    objects[pageObjectId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjectId} 0 R >>`;
    objects[contentObjectId] = `<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`;
  }

  objects[2] = `<< /Type /Pages /Count ${pages.length} /Kids [${pageRefs.join(" ")}] >>`;

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (let index = 1; index < objects.length; index += 1) {
    offsets[index] = Buffer.byteLength(pdf, "utf8");
    pdf += `${index} 0 obj\n${objects[index]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length}\n`;
  pdf += "0000000000 65535 f \n";
  for (let index = 1; index < objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, "utf8");
}

function buildOcrPageTextLayers(
  pages: Array<{
    pageNumber: number;
    lines: Array<{ words: string[] }>;
  }>,
): PageTextLayer[] {
  return pages.map((page) => {
    const lines = page.lines.map((line, lineIndex) => {
      const words = line.words
        .filter((word) => word.length > 0)
        .map((word, wordIndex) => ({
          text: word,
          normalizedText: normalizeNorwegianText(word),
          x: 40 + wordIndex * 90,
          y: 40 + lineIndex * 16,
          width: Math.max(8, word.length * 7),
          height: 12,
          confidence: 0.86,
          lineNumber: lineIndex,
        }));
      const text = words.map((word) => word.text).join(" ");
      return {
        text,
        normalizedText: normalizeNorwegianText(text),
        x: 40,
        y: 40 + lineIndex * 16,
        width: Math.max(80, text.length * 7),
        height: 12,
        confidence: 0.86,
        words,
      };
    });
    const text = lines.map((line) => line.text).join("\n");
    return {
      pageNumber: page.pageNumber,
      text,
      normalizedText: normalizeNorwegianText(text),
      lines,
      hasEmbeddedText: false,
    };
  });
}

function runPipelineFromPages(fiscalYear: number, pages: PageTextLayer[]) {
  const classifications = classifyPages(pages);
  const rows = reconstructStatementRows(pages, classifications);
  const mapped = mapRowsToCanonicalFacts({
    filingFiscalYear: fiscalYear,
    classifications,
    rows,
  });
  const validation = validateCanonicalFacts(mapped.facts);
  const issues = [
    ...buildClassificationIssues(fiscalYear, classifications),
    ...mapped.issues,
    ...validation.issues,
  ];
  const confidenceScore = calculateConfidenceScore({
    classifications,
    selectedFactCount: validation.selectedFacts.size,
    validationScore: validation.validationScore,
    duplicateSupport:
      validation.stats.duplicateComparisons > 0
        ? validation.stats.duplicateMatches / validation.stats.duplicateComparisons
        : 0,
    noteSupport:
      validation.stats.noteComparisons > 0
        ? validation.stats.noteMatches / validation.stats.noteComparisons
        : 0,
    issueCount: issues.length,
  });
  const shouldPublish = canPublishAutomatically({
    filingFiscalYear: fiscalYear,
    classifications,
    selectedFacts: validation.selectedFacts,
    validationIssues: issues,
    confidenceScore,
  });

  return {
    pages,
    classifications,
    rows,
    mapped,
    validation,
    issues,
    confidenceScore,
    shouldPublish,
  };
}

function assertFixtureExpectations(
  result: ReturnType<typeof runPipelineFromPages>,
  expected: {
    shouldPublish: boolean;
    classificationTypes: string[];
    unitScaleByPage: Record<number, 1 | 1000 | null>;
    factValues: Record<string, number | undefined>;
    requiredIssueCodes?: string[];
  },
) {
  expect(result.classifications.map((classification) => classification.type)).toEqual(
    expected.classificationTypes,
  );

  for (const [pageNumber, unitScale] of Object.entries(expected.unitScaleByPage)) {
    expect(
      result.classifications.find(
        (classification) => classification.pageNumber === Number(pageNumber),
      )?.unitScale ?? null,
    ).toBe(unitScale);
  }

  for (const [metricKey, value] of Object.entries(expected.factValues)) {
    expect(result.validation.selectedFacts.get(metricKey as any)?.value).toBe(value);
  }

  for (const ruleCode of expected.requiredIssueCodes ?? []) {
    expect(result.issues.some((issue) => issue.ruleCode === ruleCode)).toBe(true);
  }
  expect(result.shouldPublish).toBe(expected.shouldPublish);
}

describe("annual-report regression fixtures", () => {
  for (const fixture of documentRegressionFixtures) {
    it(`processes document fixture ${fixture.name} through preflight and parser stages`, async () => {
      const pdfBuffer = buildSimplePdfBuffer(fixture.pages);
      const preflight = await preflightAnnualReportDocument(pdfBuffer);

      expect(preflight.hasTextLayer).toBe(true);
      if (fixture.expected.shouldPublish) {
        expect(preflight.hasReliableTextLayer).toBe(true);
      }
      expect(preflight.parsedPages).toHaveLength(fixture.pages.length);

      const result = runPipelineFromPages(fixture.fiscalYear, preflight.parsedPages);
      assertFixtureExpectations(result, fixture.expected as any);

      if (fixture.expected.shouldPublish) {
        expect(result.validation.stats.duplicateComparisons).toBeGreaterThan(0);
        expect(result.validation.stats.duplicateMatches).toBeGreaterThan(0);
        expect(result.validation.stats.noteComparisons).toBeGreaterThan(0);
        expect(result.validation.stats.noteMatches).toBeGreaterThan(0);
      }
    });
  }

  for (const fixture of ocrRegressionFixtures) {
    it(`processes OCR-style fixture ${fixture.name} without fake-pdf shortcuts`, () => {
      const pages = buildOcrPageTextLayers(fixture.pages);
      const result = runPipelineFromPages(fixture.fiscalYear, pages);
      assertFixtureExpectations(result, fixture.expected as any);
    });
  }

  it("stitches continuation-page balance rows into a coherent statement", async () => {
    const happyPath = documentRegressionFixtures[0];
    const pdfBuffer = buildSimplePdfBuffer(happyPath.pages);
    const preflight = await preflightAnnualReportDocument(pdfBuffer);
    const result = runPipelineFromPages(happyPath.fiscalYear, preflight.parsedPages);

    const continuationRows: ReconstructedRow[] = result.rows.filter(
      (row) => row.sectionType === "STATUTORY_BALANCE_CONTINUATION",
    );

    expect(continuationRows.some((row) => row.normalizedLabel.includes("sum egenkapital"))).toBe(
      true,
    );
    expect(
      continuationRows.some((row) =>
        row.normalizedLabel.includes("sum egenkapital og gjeld"),
      ),
    ).toBe(true);
  });

  it("keeps ambiguous document fixtures in manual review instead of publishing", async () => {
    const ambiguous = documentRegressionFixtures[1];
    const pdfBuffer = buildSimplePdfBuffer(ambiguous.pages);
    const preflight = await preflightAnnualReportDocument(pdfBuffer);
    const result = runPipelineFromPages(ambiguous.fiscalYear, preflight.parsedPages);

    expect(result.shouldPublish).toBe(false);
    expect(result.issues.some((issue) => issue.severity === "ERROR")).toBe(true);
  });
});
