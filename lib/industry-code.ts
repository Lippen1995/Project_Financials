import { NormalizedIndustryCode } from "@/lib/types";

type RegisteredIndustryCodeOptions = {
  orgNumber: string;
  industryPayload: unknown;
  fetchedAt: Date;
  normalizedAt: Date;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function buildRegisteredIndustryCode({
  orgNumber,
  industryPayload,
  fetchedAt,
  normalizedAt,
}: RegisteredIndustryCodeOptions): NormalizedIndustryCode | null {
  if (!isRecord(industryPayload)) {
    return null;
  }

  const code = readString(industryPayload.kode);
  if (!code) {
    return null;
  }

  return {
    sourceSystem: "BRREG",
    sourceEntityType: "registeredIndustryCode",
    sourceId: `${orgNumber}:registered-industry:${code}`,
    fetchedAt,
    normalizedAt,
    rawPayload: industryPayload,
    code,
    title: null,
    description: null,
    level: "primary",
    parentCode: null,
  };
}

export function mergeIndustryCodeClassification(
  registeredIndustryCode: NormalizedIndustryCode | null | undefined,
  classification: NormalizedIndustryCode | null | undefined,
): NormalizedIndustryCode | null {
  if (!registeredIndustryCode) {
    return classification ?? null;
  }

  if (!classification) {
    return registeredIndustryCode;
  }

  return {
    ...registeredIndustryCode,
    title: classification.title ?? registeredIndustryCode.title,
    description: classification.description ?? registeredIndustryCode.description,
    level: classification.level ?? registeredIndustryCode.level,
    parentCode: classification.parentCode ?? registeredIndustryCode.parentCode,
    rawPayload: {
      registeredIndustry: registeredIndustryCode.rawPayload,
      classification: classification.rawPayload,
    },
  };
}
