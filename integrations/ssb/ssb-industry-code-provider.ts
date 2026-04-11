import env from "@/lib/env";
import { fetchJson } from "@/integrations/http";
import { IndustryCodeProvider } from "@/integrations/provider-interface";
import { logRecoverableError } from "@/lib/recoverable-error";
import { NormalizedIndustryCode } from "@/lib/types";

type SsbCodesResponse = {
  codes?: Array<{
    code: string;
    name?: string;
    shortName?: string;
    parentCode?: string;
    level?: string;
    notes?: string;
  }>;
};

type GeographicResolution = {
  type: "MUNICIPALITY" | "COUNTY" | "POSTAL_CITY" | "UNKNOWN";
  label: string;
  municipalityCodes: string[];
};

type ScoredIndustryCode = NormalizedIndustryCode & { score: number };

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export class SsbIndustryCodeProvider implements IndustryCodeProvider {
  private industryCodeCache: SsbCodesResponse["codes"] | null = null;
  private countyCodeCache: SsbCodesResponse["codes"] | null = null;
  private municipalityCodeCache: SsbCodesResponse["codes"] | null = null;

  private async getCodes(classificationId: string, includeNotes = false) {
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const params = new URLSearchParams({
      date,
      includeFuture: "false",
    });

    if (includeNotes) {
      params.set("includeNotes", "true");
    }

    const response = await fetchJson<SsbCodesResponse>(
      `${env.ssbKlassBaseUrl}/classifications/${classificationId}/codesAt?${params.toString()}`,
      includeNotes ? { cache: "no-store" } : undefined,
    );

    return response.codes ?? [];
  }

  async getIndustryCode(code: string): Promise<NormalizedIndustryCode | null> {
    try {
      const now = new Date();
      const date = now.toISOString().slice(0, 10);
      const params = new URLSearchParams({
        date,
        selectCodes: code,
        includeFuture: "false",
      });

      const response = await fetchJson<SsbCodesResponse>(
        `${env.ssbKlassBaseUrl}/classifications/${env.ssbIndustryClassificationId}/codesAt?${params.toString()}`,
      );

      const match = response.codes?.find((item) => item.code === code);
      if (!match) {
        return null;
      }

      return {
        sourceSystem: "SSB_KLASS",
        sourceEntityType: "industryCode",
        sourceId: match.code,
        fetchedAt: now,
        normalizedAt: now,
        rawPayload: match,
        code: match.code,
        title: match.name ?? null,
        description: match.shortName ?? match.name ?? null,
        level: match.level ?? null,
        parentCode: match.parentCode ?? null,
      };
    } catch (error) {
      logRecoverableError("ssb-industry-code.getIndustryCode", error, {
        code,
      });
      return null;
    }
  }

  async searchIndustryCodes(terms: string[], limit = 5): Promise<ScoredIndustryCode[]> {
    if (terms.length === 0) {
      return [];
    }

    if (!this.industryCodeCache) {
      this.industryCodeCache = await this.getCodes(env.ssbIndustryClassificationId, true);
    }

    const normalizedTerms = Array.from(new Set(terms.map(normalizeText).filter(Boolean)));
    const now = new Date();

    const matches: ScoredIndustryCode[] = [];

    for (const item of this.industryCodeCache) {
        const haystack = normalizeText(`${item.code} ${item.name ?? ""} ${item.shortName ?? ""}`);

        const score = normalizedTerms.reduce((sum, term) => {
          if (!term) {
            return sum;
          }

          if (haystack.includes(term)) {
            return sum + Math.max(18, term.length * 2);
          }

          const termTokens = term.split(" ");
          const allTokensMatch = termTokens.length > 1 && termTokens.every((token) => token && haystack.includes(token));
          const tokenScore = termTokens.reduce((tokenSum, token) => {
            return token && haystack.includes(token) ? tokenSum + 6 : tokenSum;
          }, 0);

          return sum + tokenScore + (allTokensMatch ? 18 : 0);
        }, 0);

        if (score > 0) {
          matches.push({
            sourceSystem: "SSB_KLASS",
            sourceEntityType: "industryCode",
            sourceId: item.code,
            fetchedAt: now,
            normalizedAt: now,
            rawPayload: item,
            code: item.code,
            title: item.name ?? null,
            description: item.shortName ?? item.name ?? null,
            level: item.level ?? null,
            parentCode: item.parentCode ?? null,
            score,
          });
        }
    }

    return matches
      .sort((left, right) => right.score - left.score || left.code.localeCompare(right.code))
      .slice(0, limit);
  }

  async resolveGeography(term: string, typeHint?: GeographicResolution["type"] | null): Promise<GeographicResolution | null> {
    const normalizedTerm = normalizeText(term);
    if (!normalizedTerm) {
      return null;
    }

    if (!this.countyCodeCache) {
      this.countyCodeCache = await this.getCodes("104");
    }

    if (!this.municipalityCodeCache) {
      this.municipalityCodeCache = await this.getCodes("131");
    }

    if (typeHint === "COUNTY" || !typeHint) {
      const county = this.countyCodeCache.find((item) => normalizeText(item.name ?? "") === normalizedTerm);
      if (county) {
        const municipalityCodes = this.municipalityCodeCache
          .filter((item) => item.code.startsWith(county.code))
          .map((item) => item.code);

        return {
          type: "COUNTY",
          label: county.name ?? term,
          municipalityCodes,
        };
      }
    }

    const municipality = this.municipalityCodeCache.find(
      (item) => normalizeText(item.name ?? "") === normalizedTerm,
    );

    if (municipality) {
      return {
        type: "MUNICIPALITY",
        label: municipality.name ?? term,
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
