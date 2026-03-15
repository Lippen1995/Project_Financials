import env from "@/lib/env";
import { fetchJson } from "@/integrations/http";
import { NormalizedIndustryCode } from "@/lib/types";

type KlassResponse = {
  codes?: Array<{ code: string; name: string; shortName?: string }>;
};

export class SsbKlassProvider {
  async getIndustryCodes(): Promise<NormalizedIndustryCode[]> {
    const response = await fetchJson<KlassResponse>(`${env.ssbKlassBaseUrl}/klassifikasjoner/6/koder`);
    const now = new Date();

    return (response.codes ?? []).map((item) => ({
      sourceSystem: "SSB_KLASS",
      sourceEntityType: "industryCode",
      sourceId: item.code,
      fetchedAt: now,
      normalizedAt: now,
      rawPayload: item,
      code: item.code,
      title: item.name,
      description: item.shortName ?? item.name,
      level: "code",
    }));
  }
}