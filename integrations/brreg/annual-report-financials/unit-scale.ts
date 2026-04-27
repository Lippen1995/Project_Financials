import {
  AnnualReportParsedPage,
  PageTextLayer,
  UnitScaleDetectionResult,
  UnitScaleSignal,
} from "@/integrations/brreg/annual-report-financials/types";
import { normalizeNorwegianText } from "@/integrations/brreg/annual-report-financials/text";

type ScalePattern = {
  unitScale: 1 | 1000;
  regex: RegExp;
  confidence: number;
  source: UnitScaleSignal["source"];
};

const THOUSAND_PATTERNS: ScalePattern[] = [
  {
    unitScale: 1000,
    regex: /bel[o0]p [i1l](?:\s*[:.\-])?\s*nok\s*(?:1[\s.]?000|1000)\b/,
    confidence: 0.99,
    source: "PAGE_HEADER",
  },
  {
    unitScale: 1000,
    regex: /bel[o0]p [i1l](?:\s*[:.\-])?\s*(?:1[\s.]?000|1000)\s*(?:kr|nok)\b/,
    confidence: 0.98,
    source: "PAGE_HEADER",
  },
  {
    unitScale: 1000,
    regex: /(?:alle|samtlige)\s+tall(?:ene)?\s+i\s+(?:notene|note)\s+er\s+(?:oppgitt\s+i\s+)?nok\s*(?:1[\s.]?000|1000)\b/,
    confidence: 0.97,
    source: "NOTE_DECLARATION",
  },
  {
    unitScale: 1000,
    regex: /alle tall i notene er(?: oppgitt i)? (?:nok\s*)?(?:1[\s.]?000|1000)\b/,
    confidence: 0.97,
    source: "NOTE_DECLARATION",
  },
  {
    unitScale: 1000,
    regex: /tall i hele tusen\b/,
    confidence: 0.94,
    source: "PAGE_BODY",
  },
  {
    unitScale: 1000,
    regex: /(?:nok|kr)\s*tusen\b/,
    confidence: 0.9,
    source: "PAGE_BODY",
  },
  {
    unitScale: 1000,
    regex: /\bt[\s-]?nok\b/,
    confidence: 0.97,
    source: "PAGE_HEADER",
  },
  {
    unitScale: 1000,
    regex: /nok\s*1[.\s]?000\b/,
    confidence: 0.98,
    source: "PAGE_HEADER",
  },
];

const WHOLE_NOK_PATTERNS: ScalePattern[] = [
  {
    unitScale: 1,
    regex: /bel[o0]p [i1l](?:\s*[:.\-])?\s*nok\b(?!\s*(?:1[\s.]?000|1000))/,
    confidence: 0.95,
    source: "PAGE_HEADER",
  },
  {
    unitScale: 1,
    regex: /alle tall(?:ene)? er(?: oppgitt i)? nok\b(?!\s*(?:1[\s.]?000|1000))/,
    confidence: 0.9,
    source: "PAGE_BODY",
  },
  {
    unitScale: 1,
    regex: /tall i hele kroner\b/,
    confidence: 0.88,
    source: "PAGE_BODY",
  },
];

function collectSignals(text: string) {
  const normalized = normalizeNorwegianText(text);
  const signals: UnitScaleSignal[] = [];

  for (const pattern of [...THOUSAND_PATTERNS, ...WHOLE_NOK_PATTERNS]) {
    const match = normalized.match(pattern.regex);
    if (!match) {
      continue;
    }

    signals.push({
      unitScale: pattern.unitScale,
      confidence: pattern.confidence,
      source: pattern.source,
      matchedText: match[0],
    });
  }

  return signals;
}

function summarizeSignals(signals: UnitScaleSignal[]): UnitScaleDetectionResult {
  if (signals.length === 0) {
    return {
      unitScale: null,
      confidence: 0,
      reason: null,
      conflictingSignals: false,
      signals: [],
    };
  }

  const scoreByScale = new Map<1 | 1000, number>([
    [1, 0],
    [1000, 0],
  ]);

  for (const signal of signals) {
    scoreByScale.set(signal.unitScale, (scoreByScale.get(signal.unitScale) ?? 0) + signal.confidence);
  }

  const wholeNokScore = scoreByScale.get(1) ?? 0;
  const thousandScore = scoreByScale.get(1000) ?? 0;
  const conflictingSignals = wholeNokScore > 0 && thousandScore > 0;

  if (conflictingSignals) {
    return {
      unitScale: null,
      confidence: 0,
      reason: "Conflicting unit declarations on page",
      conflictingSignals: true,
      signals,
    };
  }

  const unitScale = thousandScore > wholeNokScore ? 1000 : 1;
  const confidence = Math.max(wholeNokScore, thousandScore) / signals.length;

  return {
    unitScale,
    confidence: Number(Math.min(0.995, confidence).toFixed(3)),
    reason:
      unitScale === 1000
        ? conflictingSignals
          ? "Primary unit declaration indicates NOK 1000, but conflicting signals were also found"
          : "Declared NOK 1000 on page"
        : conflictingSignals
          ? "Primary unit declaration indicates whole NOK, but conflicting signals were also found"
          : "Declared whole NOK on page",
    conflictingSignals,
    signals,
  };
}

function collectTextFromPage(page: PageTextLayer | AnnualReportParsedPage) {
  if ("blocks" in page && Array.isArray(page.blocks) && page.blocks.length > 0) {
    const topBlocks = [...page.blocks]
      .sort((left, right) => {
        const leftTop = left.bbox?.top ?? 0;
        const rightTop = right.bbox?.top ?? 0;
        return rightTop - leftTop;
      })
      .slice(0, 12)
      .map((block) => block.text);

    return [...topBlocks, page.text].join("\n");
  }

  return page.text;
}

export function detectUnitScale(textOrPage: string | PageTextLayer | AnnualReportParsedPage): UnitScaleDetectionResult {
  const text =
    typeof textOrPage === "string" ? textOrPage : collectTextFromPage(textOrPage);
  return summarizeSignals(collectSignals(text));
}
