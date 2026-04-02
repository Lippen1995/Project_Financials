import { PDFParse } from "pdf-parse";

import { DistressDocumentExcerpt, NormalizedFinancialDocument } from "@/lib/types";

export type ExtractedPage = {
  pageNumber: number;
  text: string;
  normalizedText: string;
  lines: string[];
};

type SectionKey = "annualReport" | "notes" | "audit";

type SectionExtractionResult = {
  annualReportExcerpts: DistressDocumentExcerpt[];
  notesExcerpts: DistressDocumentExcerpt[];
  auditExcerpts: DistressDocumentExcerpt[];
};

const SECTION_PATTERNS: Record<SectionKey, string[]> = {
  annualReport: [
    "arsberetning",
    "styrets arsberetning",
    "styrets beretning",
    "beretning om arsregnskapet",
    "virksomhetens art",
    "fortsatt drift",
  ],
  notes: [
    "noter til regnskapet",
    "noter til arsregnskapet",
    "regnskapsprinsipper",
    "lonnskostnad",
    "varelager",
    "kundefordringer",
    "pantstillelser",
    "hendelser etter balansedagen",
    "note ",
  ],
  audit: [
    "uavhengig revisors beretning",
    "revisjonsberetning",
    "beretning fra uavhengig revisor",
    "konklusjon",
    "grunnlag for konklusjon",
  ],
};

function normalizeForMatching(value: string) {
  return value
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanExcerpt(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function splitIntoUsefulLines(pageText: string) {
  return pageText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 4);
}

function getDocumentUrl(document: NormalizedFinancialDocument) {
  const annualReportFile = document.files.find((file) => file.type === "aarsregnskap" && file.url);
  if (annualReportFile?.url) {
    return annualReportFile.url;
  }

  return document.files.find((file) => file.url)?.url ?? null;
}

function scorePageForSection(page: ExtractedPage, section: SectionKey) {
  return SECTION_PATTERNS[section].reduce((score, pattern) => {
    if (page.normalizedText.includes(pattern)) {
      return score + (pattern.includes(" ") ? 3 : 1);
    }

    return score;
  }, 0);
}

function extractSnippet(page: ExtractedPage, section: SectionKey) {
  const patterns = SECTION_PATTERNS[section];
  const matchIndex = page.lines.findIndex((line) => {
    const normalizedLine = normalizeForMatching(line);
    return patterns.some((pattern) => normalizedLine.includes(pattern));
  });

  const startIndex = matchIndex >= 0 ? Math.max(0, matchIndex - 1) : 0;
  const endIndex = matchIndex >= 0 ? Math.min(page.lines.length, matchIndex + 4) : Math.min(page.lines.length, 3);
  const rawText = page.lines.slice(startIndex, endIndex).join(" ");
  return cleanExcerpt(rawText);
}

function buildExcerptTitle(section: SectionKey) {
  switch (section) {
    case "annualReport":
      return "Årsberetning";
    case "notes":
      return "Noter";
    case "audit":
      return "Revisjonsberetning";
  }
}

function dedupeExcerpts(excerpts: DistressDocumentExcerpt[]) {
  const seen = new Set<string>();
  return excerpts.filter((excerpt) => {
    const key = `${excerpt.pageNumber ?? "na"}:${excerpt.text}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export function extractSectionExcerptsFromPages(
  pages: ExtractedPage[],
  year: number,
  documentUrl?: string | null,
): SectionExtractionResult {
  function collect(section: SectionKey) {
    const matches = pages
      .map((page) => ({
        page,
        score: scorePageForSection(page, section),
      }))
      .filter((candidate) => candidate.score > 0)
      .sort((left, right) => right.score - left.score || left.page.pageNumber - right.page.pageNumber)
      .slice(0, 3)
      .map(({ page }) => ({
        title: buildExcerptTitle(section),
        text: extractSnippet(page, section),
        pageNumber: page.pageNumber,
        year,
        documentUrl: documentUrl ?? null,
      }))
      .filter((excerpt) => excerpt.text.length >= 40);

    return dedupeExcerpts(matches);
  }

  return {
    annualReportExcerpts: collect("annualReport"),
    notesExcerpts: collect("notes"),
    auditExcerpts: collect("audit"),
  };
}

async function downloadPdf(documentUrl: string) {
  const response = await fetch(documentUrl, {
    headers: {
      Accept: "application/octet-stream",
    },
    next: { revalidate: 3600 },
  });

  if (!response.ok) {
    throw new Error(`Failed to download annual report PDF: ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function extractPagesFromPdf(documentUrl: string) {
  const pdfBuffer = await downloadPdf(documentUrl);
  const parser = new PDFParse({ data: pdfBuffer });

  try {
    const result = await parser.getText();
    return result.pages.map((page) => ({
      pageNumber: page.num,
      text: page.text,
      normalizedText: normalizeForMatching(page.text),
      lines: splitIntoUsefulLines(page.text),
    }));
  } finally {
    await parser.destroy();
  }
}

export async function extractDocumentSectionsFromFinancialDocument(
  document: NormalizedFinancialDocument,
): Promise<SectionExtractionResult | null> {
  const documentUrl = getDocumentUrl(document);
  if (!documentUrl) {
    return null;
  }

  const pages = await extractPagesFromPdf(documentUrl);
  return extractSectionExcerptsFromPages(pages, document.year, documentUrl);
}
