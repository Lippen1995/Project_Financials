import { BrregCompanyProvider } from "@/integrations/brreg/brreg-company-provider";
import { ShareholdingResolutionResult, ShareholdingOwnershipAggregate } from "@/server/shareholdings/types";
import { upsertCompanySnapshot } from "@/server/persistence/company-repository";

const companyProvider = new BrregCompanyProvider();

function normalizeName(value: string) {
  return value
    .trim()
    .toUpperCase()
    .normalize("NFKD")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function resolveShareholderEntity(
  shareholder: ShareholdingOwnershipAggregate,
): Promise<ShareholdingResolutionResult> {
  if (shareholder.shareholderType !== "COMPANY") {
    return { type: shareholder.shareholderType };
  }

  if (shareholder.shareholderIdentifier && /^\d{9}$/.test(shareholder.shareholderIdentifier)) {
    const direct = await companyProvider.getCompany(shareholder.shareholderIdentifier);
    if (direct) {
      await upsertCompanySnapshot(direct);
      return {
        type: "COMPANY",
        linkedCompanyOrgNumber: direct.orgNumber,
        linkedCompanyName: direct.name,
        confidence: 1,
      };
    }
  }

  const candidates = await companyProvider.searchCompanies({
    query: shareholder.shareholderName,
    size: 5,
  });
  const normalizedTarget = normalizeName(shareholder.shareholderName);
  const exactMatches = candidates.filter((candidate) => normalizeName(candidate.name) === normalizedTarget);

  if (exactMatches.length === 1) {
    const match = exactMatches[0];
    await upsertCompanySnapshot(match);
    return {
      type: "COMPANY",
      linkedCompanyOrgNumber: match.orgNumber,
      linkedCompanyName: match.name,
      confidence: 0.97,
    };
  }

  return { type: "COMPANY", confidence: exactMatches.length > 1 ? 0.5 : 0.2 };
}
