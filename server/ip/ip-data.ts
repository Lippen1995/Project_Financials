import { cache } from "react";

import { NveElcertProvider } from "@/integrations/nve/nve-elcert-provider";
import { PatentstyretIpProvider } from "@/integrations/patentstyret/patentstyret-ip-provider";
import { logRecoverableError } from "@/lib/recoverable-error";
import {
  CompanyIpOverview,
  IPRightDetail,
  IPRightSummary,
  IPRightType,
  IpCaseDetailView,
  IpRightListItem,
} from "@/lib/types";
import { getSubsidiaryOrgNumbers } from "@/server/ownership/group-structure-service";
import {
  readElCertificatePortfolioCache,
  readIpPortfolioCache,
  writeElCertificatePortfolioCache,
  writeIpPortfolioCache,
} from "@/server/persistence/ip-cache";

const provider = new PatentstyretIpProvider();
const nveElcertProvider = new NveElcertProvider();

// Bound how much of a large group we aggregate, and how many external portfolio
// calls we run at once, to stay polite to upstream APIs on cold loads.
const MAX_SUBSIDIARIES = 80;
const PORTFOLIO_FETCH_CONCURRENCY = 6;

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function isOrgNumber(value: string | null | undefined): value is string {
  return typeof value === "string" && /^\d{9}$/.test(value);
}

function toTimestamp(value: string | null) {
  if (!value) return Number.NEGATIVE_INFINITY;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

/**
 * Read-through portfolio loader. Deduplicated per request via React `cache()`
 * and persisted across requests (and readable by non-request contexts such as
 * the news-relevance batch) via the disk portfolio cache.
 */
export const getIpPortfolio = cache(async (orgNumber: string): Promise<IPRightSummary[]> => {
  if (!isOrgNumber(orgNumber)) {
    return [];
  }

  const cached = await readIpPortfolioCache(orgNumber);
  if (cached) {
    return cached.rights;
  }

  try {
    const rights = await provider.getCompanyPortfolio(orgNumber);
    await writeIpPortfolioCache(orgNumber, rights);
    return rights;
  } catch (error) {
    logRecoverableError("ip-data.getIpPortfolio", error, { orgNumber });
    return [];
  }
});

export const getElCertificatePortfolio = cache(async (orgNumber: string): Promise<IPRightSummary[]> => {
  if (!isOrgNumber(orgNumber)) {
    return [];
  }

  const cached = await readElCertificatePortfolioCache(orgNumber);
  if (cached) {
    return cached.rights;
  }

  try {
    const rights = await nveElcertProvider.getCompanyCertificates(orgNumber);
    await writeElCertificatePortfolioCache(orgNumber, rights);
    return rights;
  } catch (error) {
    logRecoverableError("ip-data.getElCertificatePortfolio", error, { orgNumber });
    return [];
  }
});

export const getCompanyIntangiblePortfolio = cache(async (orgNumber: string): Promise<IPRightSummary[]> => {
  const [ipRights, elCertificates] = await Promise.all([
    getIpPortfolio(orgNumber),
    getElCertificatePortfolio(orgNumber),
  ]);

  return [...ipRights, ...elCertificates];
});

/**
 * Portfolio of the company and every subsidiary it controls (directly or
 * indirectly), deduplicated by case id. This is what the tab and gating use, so
 * intangible rights held under operating subsidiaries surface on the parent/holding company.
 */
export const getGroupIpPortfolio = cache(async (orgNumber: string): Promise<IPRightSummary[]> => {
  if (!isOrgNumber(orgNumber)) {
    return [];
  }

  let subsidiaries: string[] = [];
  try {
    subsidiaries = await getSubsidiaryOrgNumbers({ orgNumber, maxNodes: MAX_SUBSIDIARIES });
  } catch (error) {
    logRecoverableError("ip-data.getGroupIpPortfolio.subsidiaries", error, { orgNumber });
  }

  const orgNumbers = [orgNumber, ...subsidiaries.filter((org) => isOrgNumber(org) && org !== orgNumber)];
  const portfolios = await mapWithConcurrency(orgNumbers, PORTFOLIO_FETCH_CONCURRENCY, getCompanyIntangiblePortfolio);

  const seen = new Set<string>();
  const merged: IPRightSummary[] = [];
  for (const portfolio of portfolios) {
    for (const right of portfolio) {
      if (seen.has(right.id)) continue;
      seen.add(right.id);
      merged.push(right);
    }
  }
  return merged;
});

export const getGroupIpOverview = cache(
  async (orgNumber: string): Promise<CompanyIpOverview> => buildIpOverview(await getGroupIpPortfolio(orgNumber)),
);

export const getGroupIpListItems = cache(
  async (orgNumber: string): Promise<IpRightListItem[]> => (await getGroupIpPortfolio(orgNumber)).map(toListItem),
);

export function buildIpOverview(rights: IPRightSummary[]): CompanyIpOverview {
  const latestActivityDate = rights
    .map((right) => right.lastEventDate)
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => toTimestamp(right) - toTimestamp(left))[0] ?? null;

  return {
    total: rights.length,
    patents: rights.filter((right) => right.type === "patent").length,
    trademarks: rights.filter((right) => right.type === "trademark").length,
    designs: rights.filter((right) => right.type === "design").length,
    elCertificates: rights.filter((right) => right.type === "elCertificate").length,
    active: rights.filter((right) => right.isActive === true).length,
    latestActivityDate,
  };
}

export function toListItem(right: IPRightSummary): IpRightListItem {
  return {
    id: right.id,
    type: right.type,
    title: right.title,
    status: right.status,
    applicationNumber: right.applicationNumber,
    applicationDate: right.applicationDate,
    registrationOrGrantDate: right.registrationOrGrantDate,
    expiryDate: right.expiryDate,
    lastEventDate: right.lastEventDate,
    caseUrl: right.caseUrl,
    ownerName: right.owners[0]?.name ?? null,
    isActive: right.isActive,
    supportingFacts: right.supportingFacts ?? [],
  };
}

function toDetailView(detail: IPRightDetail): IpCaseDetailView {
  return {
    id: detail.id,
    type: detail.type,
    title: detail.title,
    status: detail.status,
    applicationNumber: detail.applicationNumber,
    applicationDate: detail.applicationDate,
    registrationOrGrantDate: detail.registrationOrGrantDate,
    expiryDate: detail.expiryDate,
    caseUrl: detail.caseUrl,
    owners: detail.owners,
    classifications: detail.classifications,
    inventors: detail.inventors,
    representatives: detail.representatives,
    events: detail.events,
  };
}

export async function getIpCaseDetail(
  type: IPRightType,
  applicationNumber: string,
  orgNumber?: string,
): Promise<IpCaseDetailView | null> {
  if (type === "elCertificate") {
    return null;
  }

  const portfolio = isOrgNumber(orgNumber) ? await getGroupIpPortfolio(orgNumber) : [];
  const summary = portfolio.find(
    (right) => right.type === type && (right.applicationNumber === applicationNumber || right.id === applicationNumber),
  );

  try {
    const detail = await provider.getCaseDetail(type, applicationNumber, summary);
    return detail ? toDetailView(detail) : null;
  } catch (error) {
    logRecoverableError("ip-data.getIpCaseDetail", error, { type, applicationNumber, orgNumber });
    return null;
  }
}
