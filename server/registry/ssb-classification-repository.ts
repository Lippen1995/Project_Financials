import { prisma } from "@/lib/prisma";
import env from "@/lib/env";
import type { NormalizedIndustryCode } from "@/lib/types";

type ClassificationCodeRow = {
  classificationId: string;
  code: string;
  name: string;
  shortName: string | null;
  parentCode: string | null;
  level: string | null;
  notes: string | null;
  sourceSystem: string;
  sourceEntityType: string;
  sourceId: string;
  fetchedAt: Date;
  normalizedAt: Date;
  rawPayload: unknown;
};

type ScoredIndustryCode = NormalizedIndustryCode & { score: number };
type GeographicResolution = {
  type: "MUNICIPALITY" | "COUNTY" | "POSTAL_CITY" | "UNKNOWN";
  label: string;
  municipalityCodes: string[];
};

function normalizeText(value: string) {
  return value
    .toLocaleLowerCase("nb-NO")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toIndustryCode(row: ClassificationCodeRow): NormalizedIndustryCode {
  return {
    sourceSystem: row.sourceSystem,
    sourceEntityType: row.sourceEntityType,
    sourceId: row.sourceId,
    fetchedAt: row.fetchedAt,
    normalizedAt: row.normalizedAt,
    rawPayload: row.rawPayload,
    code: row.code,
    title: row.name,
    description: row.shortName ?? row.name,
    level: row.level,
    parentCode: row.parentCode,
  };
}

/** Request-path reader for the locally synchronized SSB Klass dataset. */
export class SsbClassificationRepository {
  constructor(
    private readonly industryClassificationId = env.ssbIndustryClassificationId,
  ) {}

  async getIndustryCode(code: string): Promise<NormalizedIndustryCode | null> {
    const row = await prisma.ssbClassificationCode.findUnique({
      where: {
        classificationId_code: {
          classificationId: this.industryClassificationId,
          code,
        },
      },
    });

    return row ? toIndustryCode(row) : null;
  }

  async searchIndustryCodes(
    terms: string[],
    limit = 5,
  ): Promise<ScoredIndustryCode[]> {
    const normalizedTerms = Array.from(
      new Set(terms.map(normalizeText).filter(Boolean)),
    );
    if (normalizedTerms.length === 0 || limit < 1) return [];

    const rows = await prisma.ssbClassificationCode.findMany({
      where: { classificationId: this.industryClassificationId },
      orderBy: { code: "asc" },
    });

    return rows
      .map((row) => {
        const haystack = normalizeText(
          [row.code, row.name, row.shortName, row.notes].filter(Boolean).join(" "),
        );
        const score = normalizedTerms.reduce((sum, term) => {
          if (haystack.includes(term)) return sum + Math.max(18, term.length * 2);
          const tokens = term.split(" ").filter(Boolean);
          const tokenScore = tokens.reduce(
            (current, token) => current + (haystack.includes(token) ? 6 : 0),
            0,
          );
          return sum + tokenScore +
            (tokens.length > 1 && tokens.every((token) => haystack.includes(token)) ? 18 : 0);
        }, 0);
        return score > 0 ? { ...toIndustryCode(row), score } : null;
      })
      .filter((row): row is ScoredIndustryCode => row !== null)
      .sort((left, right) => right.score - left.score || left.code.localeCompare(right.code))
      .slice(0, limit);
  }

  async resolveGeography(
    term: string,
    typeHint?: GeographicResolution["type"] | null,
  ): Promise<GeographicResolution | null> {
    const normalizedTerm = normalizeText(term);
    if (!normalizedTerm) return null;

    const rows = await prisma.ssbClassificationCode.findMany({
      where: { classificationId: { in: ["104", "131"] } },
      orderBy: [{ classificationId: "asc" }, { code: "asc" }],
    });
    const counties = rows.filter((row) => row.classificationId === "104");
    const municipalities = rows.filter((row) => row.classificationId === "131");

    if (typeHint === "COUNTY" || !typeHint) {
      const county = counties.find((row) => normalizeText(row.name) === normalizedTerm);
      if (county) {
        return {
          type: "COUNTY",
          label: county.name,
          municipalityCodes: municipalities
            .filter((row) => row.parentCode === county.code || row.code.startsWith(county.code))
            .map((row) => row.code),
        };
      }
    }

    const municipality = municipalities.find(
      (row) => normalizeText(row.name) === normalizedTerm,
    );
    if (municipality) {
      return {
        type: "MUNICIPALITY",
        label: municipality.name,
        municipalityCodes: [municipality.code],
      };
    }

    return {
      type: typeHint ?? "UNKNOWN",
      label: term,
      municipalityCodes: [],
    };
  }
}
