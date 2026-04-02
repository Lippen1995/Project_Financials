import * as cheerio from "cheerio";

import env from "@/lib/env";
import { fetchText } from "@/integrations/http";
import { PetroleumEventsSyncPayload } from "@/server/services/petroleum-market-types";

const HAVTIL_LIST_PAGES = [
  { url: "/tilsyn/tilsynsrapporter/", eventType: "AUDIT_REPORT" },
  { url: "/tilsyn/samtykker/", eventType: "CONSENT" },
  { url: "/tilsyn/samsvarsuttalelser/", eventType: "ACKNOWLEDGEMENT_OF_COMPLIANCE" },
  { url: "/tilsyn/granskingsrapporter/", eventType: "INVESTIGATION_REPORT" },
] as const;

function toAbsoluteUrl(href?: string | null) {
  if (!href) {
    return null;
  }

  return href.startsWith("http") ? href : `${env.havtilBaseUrl}${href}`;
}

function inferCompanyName(title: string) {
  const match = title.match(/^([^–-]+)\s+[–-]\s+/);
  return match?.[1]?.trim() ?? null;
}

async function fetchPaginatedList(url: string, eventType: string) {
  const items: PetroleumEventsSyncPayload["events"] = [];

  for (let page = 1; page <= 12; page += 1) {
    const pageUrl = page === 1 ? `${env.havtilBaseUrl}${url}` : `${env.havtilBaseUrl}${url}?p=${page}`;
    const html = await fetchText(pageUrl, undefined, 30_000);
    const $ = cheerio.load(html);
    const cards = $("a:has(.pcard-content-wrapper)");

    if (cards.length === 0) {
      break;
    }

    cards.each((_, element) => {
      const card = $(element);
      const title = card.find(".pcard-title").text().trim();
      const summary = card.find(".pcard-text").text().trim() || null;
      const datetime = card.find("time").attr("datetime") ?? null;
      const detailUrl = toAbsoluteUrl(card.attr("href"));
      const tags = card
        .find(".custom-category li")
        .toArray()
        .map((item) => $(item).text().trim())
        .filter(Boolean);

      if (!title || !detailUrl) {
        return;
      }

      items.push({
        externalId: detailUrl,
        source: "HAVTIL",
        eventType,
        title,
        summary,
        publishedAt: datetime ? new Date(datetime) : null,
        detailUrl,
        entityType: null,
        entityNpdId: null,
        entityName: null,
        relatedCompanyName: inferCompanyName(title),
        relatedCompanyOrgNumber: null,
        relatedCompanySlug: null,
        tags,
        metrics: null,
        sourceSystem: "HAVTIL",
        sourceEntityType: eventType,
        sourceId: detailUrl,
        fetchedAt: new Date(),
        normalizedAt: new Date(),
        rawPayload: {
          url: detailUrl,
          tags,
        },
      });
    });

    const nextLink = $(".page-item a")
      .toArray()
      .some((element) => ($(element).text().trim() === "»" || $(element).text().trim() === "...") && $(element).attr("href"));

    if (!nextLink) {
      break;
    }
  }

  return items;
}

export async function fetchHavtilPetroleumEvents(): Promise<PetroleumEventsSyncPayload> {
  const groups = await Promise.all(
    HAVTIL_LIST_PAGES.map((page) => fetchPaginatedList(page.url, page.eventType)),
  );

  return {
    events: groups.flat(),
  };
}
