import { detectUnitScale } from "@/integrations/brreg/annual-report-financials/unit-scale";
import { normalizeNorwegianText } from "@/integrations/brreg/annual-report-financials/text";
import {
  PageClassification,
  PageTextLayer,
} from "@/integrations/brreg/annual-report-financials/types";
import { StatementSectionType } from "@/integrations/brreg/annual-report-financials/taxonomy";

type ClassificationRule = {
  type: StatementSectionType;
  keywords: string[];
};

const classificationRules: ClassificationRule[] = [
  {
    type: "STATUTORY_INCOME",
    keywords: ["resultatregnskap", "driftsinntekter", "driftsresultat", "arsresultat"],
  },
  {
    type: "STATUTORY_BALANCE",
    keywords: ["balanse", "eiendeler", "sum eiendeler", "egenkapital og gjeld"],
  },
  {
    type: "SUPPLEMENTARY_INCOME",
    keywords: ["artsinndelt resultatregnskap", "resultatregnskap i sammendrag", "sum driftsinntekter"],
  },
  {
    type: "SUPPLEMENTARY_BALANCE",
    keywords: ["balanse i sammendrag", "sum egenkapital og gjeld", "sum kortsiktig gjeld"],
  },
  {
    type: "NOTE",
    keywords: ["noter til arsregnskapet", "noter til regnskapet", "note ", "regnskapsprinsipper"],
  },
  {
    type: "AUDITOR_REPORT",
    keywords: ["uavhengig revisors beretning", "revisjonsberetning", "konklusjon"],
  },
  {
    type: "BOARD_REPORT",
    keywords: ["styrets arsberetning", "arsberetning", "virksomhetens art", "fortsatt drift"],
  },
  {
    type: "COVER",
    keywords: ["arsregnskap", "arsrapport", "organisasjonsnummer", "resultatregnskap og balanse"],
  },
];

function scoreType(text: string, rule: ClassificationRule) {
  return rule.keywords.reduce((score, keyword) => {
    const normalizedKeyword = normalizeNorwegianText(keyword);
    return text.includes(normalizedKeyword) ? score + Math.max(1, normalizedKeyword.length / 8) : score;
  }, 0);
}

function extractDeclaredYears(text: string) {
  return Array.from(new Set((text.match(/\b20\d{2}\b/g) ?? []).map((year) => Number(year)))).slice(0, 4);
}

export function classifyPages(pages: PageTextLayer[]) {
  const classifications: PageClassification[] = [];

  for (const page of pages) {
    const unitScale = detectUnitScale(page.text);
    const scores = classificationRules.map((rule) => ({
      type: rule.type,
      score: scoreType(page.normalizedText, rule),
      reasons: rule.keywords.filter((keyword) =>
        page.normalizedText.includes(normalizeNorwegianText(keyword)),
      ),
    }));

    scores.sort((left, right) => right.score - left.score);
    let top = scores[0];

    if (!top || top.score <= 0) {
      top = {
        type: "COVER",
        score: 0.1,
        reasons: ["No strong classification signals"],
      };
    }

    if (
      top.type === "STATUTORY_BALANCE" &&
      page.normalizedText.includes("sum kortsiktig gjeld") &&
      !page.normalizedText.includes("sum eiendeler")
    ) {
      top = {
        type: "STATUTORY_BALANCE_CONTINUATION",
        score: top.score + 0.5,
        reasons: [...top.reasons, "Continuation balance keywords"],
      };
    }

    if (top.type === "STATUTORY_INCOME" && unitScale.unitScale === 1000) {
      top = {
        type: "SUPPLEMENTARY_INCOME",
        score: top.score,
        reasons: [...top.reasons, "Detected NOK 1000 on income page"],
      };
    }

    if (
      (top.type === "STATUTORY_BALANCE" || top.type === "STATUTORY_BALANCE_CONTINUATION") &&
      unitScale.unitScale === 1000
    ) {
      top = {
        type: "SUPPLEMENTARY_BALANCE",
        score: top.score,
        reasons: [...top.reasons, "Detected NOK 1000 on balance page"],
      };
    }

    classifications.push({
      pageNumber: page.pageNumber,
      type: top.type,
      confidence: Math.max(0.15, Math.min(0.99, top.score / 6)),
      unitScale: unitScale.unitScale,
      declaredYears: extractDeclaredYears(page.text),
      reasons: [...top.reasons, ...(unitScale.reason ? [unitScale.reason] : [])],
    });
  }

  return classifications.sort((left, right) => left.pageNumber - right.pageNumber);
}
