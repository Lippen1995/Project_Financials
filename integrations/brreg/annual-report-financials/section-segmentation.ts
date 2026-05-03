import { normalizeNorwegianText } from "@/integrations/brreg/annual-report-financials/text";
import {
  AnnualReportDocument,
  AnnualReportDocumentDiagnostics,
  AnnualReportNarrativeSection,
  AnnualReportPage,
  AnnualReportSection,
  SectionKind,
  SectionSignal,
} from "@/integrations/brreg/annual-report-financials/document-model";

// ---------------------------------------------------------------------------
// Keyword signal definitions per section kind (pre-normalized: no æ/ø/å)
// ---------------------------------------------------------------------------

type SectionSignalDef = {
  keywords: Array<{ text: string; weight: number }>;
  negativeKeywords: string[];
};

const SECTION_SIGNAL_DEFS: Record<SectionKind, SectionSignalDef> = {
  BOARD_REPORT: {
    keywords: [
      { text: "styrets arsberetning", weight: 4 },
      { text: "styrets beretning", weight: 4 },
      { text: "arsberetning", weight: 3 },
      { text: "virksomhetens art", weight: 2 },
      { text: "fortsatt drift", weight: 2 },
      { text: "nokkeltall", weight: 1 },
    ],
    negativeKeywords: ["resultatregnskap", "balanse", "noter til"],
  },
  AUDITOR_REPORT: {
    keywords: [
      { text: "uavhengig revisors beretning", weight: 5 },
      { text: "revisjonsberetning", weight: 4 },
      { text: "beretning fra uavhengig revisor", weight: 4 },
      { text: "revisors beretning", weight: 3 },
      { text: "grunnlag for konklusjon", weight: 3 },
      { text: "uttalelse om ovrige lovmessige krav", weight: 3 },
      { text: "konklusjon", weight: 2 },
    ],
    negativeKeywords: ["noter til arsregnskapet", "noter til regnskapet", "note "],
  },
  INCOME_STATEMENT: {
    keywords: [
      { text: "resultatregnskap", weight: 4 },
      { text: "driftsinntekter", weight: 2 },
      { text: "driftsresultat", weight: 2 },
      { text: "arsresultat", weight: 1 },
    ],
    negativeKeywords: ["styrets arsberetning", "arsberetning", "revisors beretning"],
  },
  BALANCE_SHEET: {
    keywords: [
      { text: "balanse", weight: 4 },
      { text: "eiendeler", weight: 2 },
      { text: "egenkapital og gjeld", weight: 3 },
      { text: "sum eiendeler", weight: 2 },
    ],
    negativeKeywords: ["styrets arsberetning", "arsberetning", "revisors beretning"],
  },
  NOTES: {
    keywords: [
      { text: "noter til arsregnskapet", weight: 4 },
      { text: "noter til regnskapet", weight: 4 },
      { text: "regnskapsprinsipper", weight: 2 },
      { text: "note ", weight: 1 },
    ],
    negativeKeywords: ["revisjonsberetning", "arsberetning"],
  },
  SIGNATURES: {
    keywords: [
      { text: "underskrift", weight: 3 },
      { text: "daglig leder", weight: 2 },
      { text: "styreleder", weight: 2 },
    ],
    negativeKeywords: [],
  },
  UNKNOWN: {
    keywords: [],
    negativeKeywords: [],
  },
};

const SECTION_START_THRESHOLD = 3;

const NARRATIVE_KINDS: SectionKind[] = ["BOARD_REPORT", "AUDITOR_REPORT"];

const EXPECTED_SECTIONS: SectionKind[] = [
  "BOARD_REPORT",
  "AUDITOR_REPORT",
  "INCOME_STATEMENT",
  "BALANCE_SHEET",
];

const AUDITOR_SUBSECTION_PATTERNS = [
  "konklusjon",
  "grunnlag for konklusjon",
  "grunnlag for",
  "uttalelse om ovrige lovmessige krav",
  "uttalelse om",
  "andre forhold",
  "revisors ansvar",
  "styrets ansvar",
];

const BOARD_SUBSECTION_PATTERNS = [
  "virksomhetens art",
  "fortsatt drift",
  "arbeidsmiljo",
  "ytre miljo",
  "likestilling",
  "framtidsutsikter",
  "nokkeltall",
  "finansiell risiko",
  "redegjoring",
];

// ---------------------------------------------------------------------------
// Core scoring
// ---------------------------------------------------------------------------

export function scorePage(
  normalizedText: string,
  kind: SectionKind,
): { score: number; signals: SectionSignal[] } {
  const def = SECTION_SIGNAL_DEFS[kind];
  if (!def || kind === "UNKNOWN") return { score: 0, signals: [] };

  const signals: SectionSignal[] = [];
  let score = 0;

  for (const { text: keyword, weight } of def.keywords) {
    const normalizedKeyword = normalizeNorwegianText(keyword);
    const offset = normalizedText.indexOf(normalizedKeyword);
    if (offset >= 0) {
      score += weight;
      signals.push({ keyword, weight, offset });
    }
  }

  for (const negKeyword of def.negativeKeywords) {
    const normalizedNeg = normalizeNorwegianText(negKeyword);
    if (normalizedText.includes(normalizedNeg)) {
      score -= 2;
    }
  }

  return { score: Math.max(0, score), signals };
}

type PageScore = {
  kind: SectionKind;
  score: number;
  signals: SectionSignal[];
};

function bestKindForPage(normalizedText: string): PageScore {
  const kinds: SectionKind[] = [
    "BOARD_REPORT",
    "AUDITOR_REPORT",
    "INCOME_STATEMENT",
    "BALANCE_SHEET",
    "NOTES",
    "SIGNATURES",
  ];

  let best: PageScore = { kind: "UNKNOWN", score: 0, signals: [] };
  for (const kind of kinds) {
    const { score, signals } = scorePage(normalizedText, kind);
    if (score > best.score) {
      best = { kind, score, signals };
    }
  }

  return best;
}

// ---------------------------------------------------------------------------
// Section spanning
// ---------------------------------------------------------------------------

export function segmentAnnualReportSections(pages: AnnualReportPage[]): AnnualReportSection[] {
  if (pages.length === 0) return [];

  const sections: AnnualReportSection[] = [];

  type ActiveSection = {
    kind: SectionKind;
    startPage: number;
    endPage: number;
    pages: AnnualReportPage[];
    signals: SectionSignal[];
    confidenceScore: number;
  };

  let current: ActiveSection | null = null;

  const flush = () => {
    if (current === null) return;
    sections.push({
      kind: current.kind,
      startPage: current.startPage,
      endPage: current.endPage,
      pages: [...current.pages],
      confidenceScore: current.confidenceScore,
      matchedSignals: current.signals,
    });
    current = null;
  };

  for (const page of pages) {
    const { kind, score, signals } = bestKindForPage(page.normalizedText);
    const confidenceScore = Number(Math.min(1, score / 8).toFixed(3));

    if (score >= SECTION_START_THRESHOLD) {
      if (current === null) {
        current = {
          kind,
          startPage: page.pageNumber,
          endPage: page.pageNumber,
          pages: [page],
          signals,
          confidenceScore,
        };
      } else if (kind !== current.kind) {
        flush();
        current = {
          kind,
          startPage: page.pageNumber,
          endPage: page.pageNumber,
          pages: [page],
          signals,
          confidenceScore,
        };
      } else {
        current.endPage = page.pageNumber;
        current.pages.push(page);
        if (confidenceScore > current.confidenceScore) {
          current.confidenceScore = confidenceScore;
          current.signals = signals;
        }
      }
    } else if (current !== null) {
      // Weak signal — extend the current section
      current.endPage = page.pageNumber;
      current.pages.push(page);
    }
  }

  flush();
  return sections;
}

// ---------------------------------------------------------------------------
// Subsection detection for narrative sections
// ---------------------------------------------------------------------------

function detectSubsections(
  fullText: string,
  patterns: string[],
): Array<{ heading: string; text: string }> {
  const lines = fullText.split(/\r?\n/);

  // Find all lines that match a subsection pattern (one match per line)
  type LineHit = { lineIndex: number; heading: string };
  const hits: LineHit[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const normalizedLine = normalizeNorwegianText(lines[i] ?? "");
    for (const pattern of patterns) {
      const normalizedPattern = normalizeNorwegianText(pattern);
      if (normalizedLine.includes(normalizedPattern)) {
        hits.push({ lineIndex: i, heading: (lines[i] ?? pattern).trim() });
        break;
      }
    }
  }

  // Build subsections by slicing raw lines between consecutive heading lines
  return hits.map((hit, index) => {
    const nextHit = hits[index + 1];
    const textLines = lines.slice(hit.lineIndex, nextHit ? nextHit.lineIndex : lines.length);
    return {
      heading: hit.heading.substring(0, 80),
      text: textLines.join("\n").trim(),
    };
  });
}

// ---------------------------------------------------------------------------
// Narrative extraction
// ---------------------------------------------------------------------------

export function extractAnnualReportNarratives(
  sections: AnnualReportSection[],
): AnnualReportNarrativeSection[] {
  return sections
    .filter((section) => NARRATIVE_KINDS.includes(section.kind))
    .map((section) => {
      const fullText = section.pages.map((page) => page.rawText).join("\n\n---\n\n");
      const subsectionPatterns =
        section.kind === "AUDITOR_REPORT"
          ? AUDITOR_SUBSECTION_PATTERNS
          : BOARD_SUBSECTION_PATTERNS;
      const subsections = detectSubsections(fullText, subsectionPatterns);

      return {
        ...section,
        fullText,
        subsections,
      };
    });
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

export function buildDocumentDiagnostics(
  sections: AnnualReportSection[],
  pageCount: number,
): AnnualReportDocumentDiagnostics {
  const sectionKinds = [...new Set(sections.map((s) => s.kind))];
  const missingExpectedSections = EXPECTED_SECTIONS.filter(
    (kind) => !sectionKinds.includes(kind),
  );

  const hasFinancials = sectionKinds.some(
    (k) => k === "INCOME_STATEMENT" || k === "BALANCE_SHEET",
  );
  const hasNarratives = sectionKinds.some((k) => NARRATIVE_KINDS.includes(k));

  let recommendedRouteHint: "OCR" | "DIGITAL" | "UNKNOWN" = "UNKNOWN";
  if (hasFinancials) {
    recommendedRouteHint = "DIGITAL";
  } else if (hasNarratives && pageCount > 0) {
    recommendedRouteHint = "OCR";
  }

  return {
    pageCount,
    sectionsFound: sections.length,
    sectionKinds,
    missingExpectedSections,
    recommendedRouteHint,
  };
}

// ---------------------------------------------------------------------------
// Top-level builder
// ---------------------------------------------------------------------------

export function buildAnnualReportDocumentFromPages(
  pages: Array<{ pageNumber: number; text: string; normalizedText: string }>,
): AnnualReportDocument {
  const annualReportPages: AnnualReportPage[] = pages.map((page) => ({
    pageNumber: page.pageNumber,
    rawText: page.text,
    normalizedText: page.normalizedText,
    charCount: page.text.length,
  }));

  const sections = segmentAnnualReportSections(annualReportPages);
  const narratives = extractAnnualReportNarratives(sections);
  const diagnostics = buildDocumentDiagnostics(sections, pages.length);

  return {
    pages: annualReportPages,
    sections,
    narratives,
    diagnostics,
  };
}
