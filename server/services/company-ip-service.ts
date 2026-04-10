import { PatentstyretIpProvider } from "@/integrations/patentstyret/patentstyret-ip-provider";
import { logRecoverableError } from "@/lib/recoverable-error";
import { CompanyIpOverview, CompanyIpTabVisibility, IPRightDetail, IPRightSummary, IPRightType } from "@/lib/types";
import { readIpPortfolioCache, writeIpPortfolioCache } from "@/server/persistence/ip-cache";

const provider = new PatentstyretIpProvider();

function toTimestamp(value: string | null) {
  if (!value) return Number.NEGATIVE_INFINITY;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

export function buildCompanyIpOverview(rights: IPRightSummary[]): CompanyIpOverview {
  const total = rights.length;
  const patents = rights.filter((item) => item.type === "patent").length;
  const trademarks = rights.filter((item) => item.type === "trademark").length;
  const designs = rights.filter((item) => item.type === "design").length;
  const active = rights.filter((item) => item.isActive === true).length;
  const latestActivityDate = rights
    .map((item) => item.lastEventDate)
    .filter((item): item is string => Boolean(item))
    .sort((left, right) => toTimestamp(right) - toTimestamp(left))[0] ?? null;

  return {
    total,
    patents,
    trademarks,
    designs,
    active,
    latestActivityDate,
  };
}

export async function getCompanyIPPortfolio(orgNumber: string): Promise<IPRightSummary[]> {
  if (!/^\d{9}$/.test(orgNumber)) {
    return [];
  }

  const cached = await readIpPortfolioCache(orgNumber);
  if (cached) {
    return cached.rights;
  }

  const rights = await provider.getCompanyPortfolio(orgNumber);
  const filtered = rights.filter((item) => item.type === "patent" || item.type === "trademark" || item.type === "design");

  await writeIpPortfolioCache(orgNumber, filtered);
  return filtered;
}

export async function getCompanyIPOverview(orgNumber: string): Promise<CompanyIpOverview> {
  const rights = await getCompanyIPPortfolio(orgNumber);
  return buildCompanyIpOverview(rights);
}

export async function getIPRightDetail(
  type: IPRightType,
  applicationNumber: string,
  orgNumber?: string,
): Promise<IPRightDetail | null> {
  const portfolio = orgNumber ? await getCompanyIPPortfolio(orgNumber) : [];
  const summary = portfolio.find(
    (item) => item.type === type && (item.applicationNumber === applicationNumber || item.id === applicationNumber),
  );

  return provider.getCaseDetail(type, applicationNumber, summary);
}

export async function getCompanyIpTabVisibility(orgNumber: string | null | undefined): Promise<CompanyIpTabVisibility> {
  if (!orgNumber || !/^\d{9}$/.test(orgNumber)) {
    return {
      available: false,
      reason: "Manglende organisasjonsnummer for sikkert oppslag.",
      reliable: false,
    };
  }

  try {
    const overview = await getCompanyIPOverview(orgNumber);
    if (overview.total === 0) {
      return {
        available: false,
        reason: "Ingen registrerte patenter, varemerker eller design funnet.",
        reliable: true,
      };
    }

    return {
      available: true,
      reason: null,
      reliable: true,
      overview,
    };
  } catch (error) {
    logRecoverableError("company-ip-service.getCompanyIpTabVisibility", error, { orgNumber });
    return {
      available: false,
      reason: "IP-portefølje kunne ikke verifiseres akkurat nå.",
      reliable: false,
    };
  }
}
