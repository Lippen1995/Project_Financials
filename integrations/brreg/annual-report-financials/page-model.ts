import { normalizeNorwegianText } from "@/integrations/brreg/annual-report-financials/text";
import {
  AnnualReportParsedInputPage,
  AnnualReportParsedPage,
  PageTextLayer,
} from "@/integrations/brreg/annual-report-financials/types";

function hasStructuredPageShape(page: AnnualReportParsedInputPage): page is AnnualReportParsedPage {
  return "blocks" in page && Array.isArray(page.blocks) && "tables" in page && Array.isArray(page.tables);
}

export function toAnnualReportParsedPage(page: AnnualReportParsedInputPage): AnnualReportParsedPage {
  if (hasStructuredPageShape(page)) {
    return page;
  }

  const legacyPage = page as PageTextLayer;
  return {
    ...legacyPage,
    blocks: legacyPage.lines.map((line, index) => ({
      id: `legacy-line-${legacyPage.pageNumber}-${index}`,
      kind: index === 0 ? "heading" : "paragraph",
      rawType: index === 0 ? "legacy_heading" : "legacy_line",
      text: line.text,
      normalizedText: line.normalizedText ?? normalizeNorwegianText(line.text),
      bbox: {
        left: line.x,
        bottom: line.y,
        right: line.x + line.width,
        top: line.y + line.height,
      },
      metadata: {
        confidence: line.confidence,
      },
      source: {
        engine: "LEGACY",
        engineMode: "legacy",
        order: index,
        sourceElementId: `legacy-line-${legacyPage.pageNumber}-${index}`,
        sourceRawType: "legacy_line",
      },
    })),
    tables: [],
    source: {
      engine: "LEGACY",
      engineMode: "legacy",
      sourceElementId: `legacy-page-${legacyPage.pageNumber}`,
      sourceRawType: "legacy_page",
      order: legacyPage.pageNumber,
    },
  };
}

export function toAnnualReportParsedPages(
  pages: AnnualReportParsedInputPage[],
) {
  return pages.map(toAnnualReportParsedPage);
}
