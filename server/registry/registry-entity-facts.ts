import { prisma } from "@/lib/prisma";
import type { NormalizedPreviousName } from "@/lib/types";

/**
 * The "nøkkelopplysninger" block Brreg publishes per enhet: articles of association, capital
 * and the registered name history. It lives in the RegistryEntity mirror rather than on
 * Company, so the profile reads it straight from the register snapshot instead of a cached
 * copy that would drift from the register between imports.
 */
export type RegistryCompanyFacts = {
  foundedAt: Date | null;
  statutesDate: Date | null;
  statutoryPurpose: string | null;
  activityDescription: string | null;
  languageForm: string | null;
  vatRegistered: boolean | null;
  registeredInBusinessRegister: boolean | null;
  businessRegisterRegisteredAt: Date | null;
  lastSubmittedAnnualReportYear: number | null;
  institutionalSectorCode: string | null;
  institutionalSectorDescription: string | null;
  capitalType: string | null;
  shareCapital: number | null;
  shareCapitalCurrency: string | null;
  shareCount: number | null;
  shareCapitalRegisteredAt: Date | null;
  previousNames: NormalizedPreviousName[];
};

function toDate(value: unknown): Date | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Brreg's historiskeNavn survives as jsonb, so every field has to be re-checked on read. */
export function parsePreviousNames(value: unknown): NormalizedPreviousName[] {
  if (!Array.isArray(value)) return [];

  const names = value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const record = entry as Record<string, unknown>;
      const name = typeof record.name === "string" ? record.name.trim() : "";
      if (name === "") return null;
      return {
        name,
        fromDate: toDate(record.fromDate),
        toDate: toDate(record.toDate),
      } satisfies NormalizedPreviousName;
    })
    .filter((entry): entry is NormalizedPreviousName => entry !== null);

  // Brreg ships them oldest first; sort defensively so the lineage renders in order either way.
  return names.sort((left, right) => {
    const leftTime = left.fromDate?.getTime() ?? Number.NEGATIVE_INFINITY;
    const rightTime = right.fromDate?.getTime() ?? Number.NEGATIVE_INFINITY;
    return leftTime - rightTime;
  });
}

export async function getRegistryCompanyFacts(orgNumber: string): Promise<RegistryCompanyFacts | null> {
  const entity = await prisma.registryEntity.findUnique({
    where: { orgNumber },
    select: {
      foundedAt: true,
      statutesDate: true,
      statutoryPurpose: true,
      activityDescription: true,
      languageForm: true,
      vatRegistered: true,
      registeredInBusinessRegister: true,
      businessRegisterRegisteredAt: true,
      lastSubmittedAnnualReportYear: true,
      institutionalSectorCode: true,
      institutionalSectorDescription: true,
      capitalType: true,
      shareCapital: true,
      shareCapitalCurrency: true,
      shareCount: true,
      shareCapitalRegisteredAt: true,
      previousNames: true,
    },
  });

  if (!entity) {
    return null;
  }

  return {
    foundedAt: entity.foundedAt,
    statutesDate: entity.statutesDate,
    statutoryPurpose: entity.statutoryPurpose,
    activityDescription: entity.activityDescription,
    languageForm: entity.languageForm,
    vatRegistered: entity.vatRegistered,
    registeredInBusinessRegister: entity.registeredInBusinessRegister,
    businessRegisterRegisteredAt: entity.businessRegisterRegisteredAt,
    lastSubmittedAnnualReportYear: entity.lastSubmittedAnnualReportYear,
    institutionalSectorCode: entity.institutionalSectorCode,
    institutionalSectorDescription: entity.institutionalSectorDescription,
    capitalType: entity.capitalType,
    shareCapital: entity.shareCapital === null ? null : Number(entity.shareCapital),
    shareCapitalCurrency: entity.shareCapitalCurrency,
    shareCount: entity.shareCount === null ? null : Number(entity.shareCount),
    shareCapitalRegisteredAt: entity.shareCapitalRegisteredAt,
    previousNames: parsePreviousNames(entity.previousNames),
  };
}
