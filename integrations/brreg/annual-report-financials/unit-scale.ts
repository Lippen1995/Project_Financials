import { AnnualReportUnitScale } from "@/integrations/brreg/annual-report-financials/types";
import { normalizeNorwegianText } from "@/integrations/brreg/annual-report-financials/text";

export type UnitScaleDetectionResult = {
  unitScale: AnnualReportUnitScale | null;
  confidence: number;
  reason: string | null;
};

const THOUSAND_PATTERNS = [
  /belop i(?:\s*[:.-])?\s*nok\s*1[\s.]*000/,
  /belop i(?:\s*[:.-])?\s*1[\s.]*000\s*kr/,
  /belop i(?:\s*[:.-])?\s*tusen/,
  /tall i hele tusen/,
  /alle tall i nok\s*1[\s.]*000/,
];

const NOK_PATTERNS = [
  /belop i(?:\s*[:.-])?\s*nok\b/,
  /alle tall i nok\b/,
  /regnskapstall i nok\b/,
];

export function detectUnitScale(text: string): UnitScaleDetectionResult {
  const normalized = normalizeNorwegianText(text);

  for (const pattern of THOUSAND_PATTERNS) {
    if (pattern.test(normalized)) {
      return {
        unitScale: 1000,
        confidence: 0.97,
        reason: "Declared NOK 1000 on page",
      };
    }
  }

  for (const pattern of NOK_PATTERNS) {
    if (pattern.test(normalized)) {
      return {
        unitScale: 1,
        confidence: 0.9,
        reason: "Declared whole NOK on page",
      };
    }
  }

  return {
    unitScale: null,
    confidence: 0,
    reason: null,
  };
}
