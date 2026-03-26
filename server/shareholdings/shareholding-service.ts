import { ShareholdingGraphSnapshot } from "@/lib/types";
import { SkatteetatenShareholdingProvider } from "@/integrations/skatteetaten/aksjonaer-i-virksomhet-provider";
import { BrregCompanyProvider } from "@/integrations/brreg/brreg-company-provider";
import { getShareholdingAvailableYears, getShareholdingSnapshot } from "@/server/shareholdings/shareholding-repository";

const skatteetatenProvider = new SkatteetatenShareholdingProvider();
const brregCompanyProvider = new BrregCompanyProvider();

function getLatestExpectedYear(currentDate = new Date()) {
  const year = currentDate.getUTCFullYear();
  const expectedRelease = new Date(Date.UTC(year, 4, 15));
  return currentDate < expectedRelease ? year - 2 : year - 1;
}

export async function getCompanyShareholdingOverview(orgNumber: string, requestedYear?: number) {
  const company = await brregCompanyProvider.getCompany(orgNumber);
  const availableYears = await getShareholdingAvailableYears(orgNumber);
  const latestExpectedYear = getLatestExpectedYear();
  const selectedYear = requestedYear ?? availableYears[0] ?? latestExpectedYear;

  if (skatteetatenProvider.canFetch()) {
    try {
      const liveSnapshot = await skatteetatenProvider.getShareholdingSnapshot(orgNumber, requestedYear);
      if (liveSnapshot) {
        liveSnapshot.companyName = company?.name ?? liveSnapshot.companyName;
        return {
          snapshot: liveSnapshot,
          availableYears: Array.from(new Set([liveSnapshot.taxYear, ...availableYears])).sort((a, b) => b - a),
          latestExpectedYear,
        };
      }
    } catch {
      // Fall back to persisted snapshots if the live API is unavailable.
    }
  }

  const snapshot = await getShareholdingSnapshot(orgNumber, selectedYear);

  if (!snapshot) {
    const unavailable: ShareholdingGraphSnapshot = {
      snapshotId: `unavailable:${orgNumber}:${selectedYear}`,
      companyId: "",
      companyOrgNumber: orgNumber,
      companyName: company?.name ?? "",
      taxYear: selectedYear,
      totalShares: null,
      shareholderCount: 0,
      source: "SKATTEETATEN_CSV",
      sourceImportedAt: new Date(),
      latestAvailableYear: latestExpectedYear,
      dataQualityNote: null,
      availabilityMessage:
        !skatteetatenProvider.canFetch()
          ? "Aksjonaerdata er ikke tilgjengelig fordi Skatteetatens API ikke er konfigurert, og det finnes heller ikke importert snapshot for valgt aar."
          : selectedYear > latestExpectedYear
          ? `Aksjonaerdata for ${selectedYear} er normalt ikke tilgjengelig ennå. Siste forventede tilgjengelige aar er ${latestExpectedYear}.`
          : "Aksjonaerdata ikke tilgjengelig for valgt aar.",
      nodes: [],
      edges: [],
      ownerships: [],
      shareholders: [],
    };

    return {
      snapshot: unavailable,
      availableYears,
      latestExpectedYear,
    };
  }

  snapshot.latestAvailableYear = latestExpectedYear;
  if (!snapshot.availabilityMessage && selectedYear > latestExpectedYear) {
    snapshot.availabilityMessage = `Aksjonaerdata for ${selectedYear} er normalt ikke tilgjengelig ennå.`;
  }

  return {
    snapshot,
    availableYears,
    latestExpectedYear,
  };
}
