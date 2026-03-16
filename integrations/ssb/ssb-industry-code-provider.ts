import env from "@/lib/env";
import { fetchJson } from "@/integrations/http";
import { IndustryCodeProvider } from "@/integrations/provider-interface";
import { NormalizedIndustryCode } from "@/lib/types";

type SsbCodesResponse = {
  codes?: Array<{
    code: string;
    name?: string;
    shortName?: string;
    parentCode?: string;
    level?: string;
  }>;
};

export class SsbIndustryCodeProvider implements IndustryCodeProvider {
  async getIndustryCode(code: string): Promise<NormalizedIndustryCode | null> {
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
  }
}
