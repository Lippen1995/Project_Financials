import { XMLParser } from "fast-xml-parser";

export type RssFeedDef = {
  id: string;
  name: string;
  url: string;
};

export type ParsedRssItem = {
  guid: string;
  title: string;
  summary: string | null;
  url: string;
  publishedAt: Date;
  source: string;
};

export const RSS_FEEDS: RssFeedDef[] = [
  // Norske økonomi/næringsliv
  { id: "e24", name: "E24", url: "https://e24.no/rss2" },
  { id: "dn", name: "Dagens Næringsliv", url: "https://www.dn.no/rss" },
  { id: "nrk-okonomi", name: "NRK Nyheter", url: "https://www.nrk.no/nyheter/siste.rss" },
  { id: "tu", name: "Teknisk Ukeblad", url: "https://www.tu.no/feeds/general.xml" },
  { id: "finansavisen", name: "Finansavisen", url: "https://finansavisen.no/rss" },
  { id: "hegnar", name: "Hegnar Online", url: "https://www.hegnar.no/nyheter/rss" },
  { id: "shifter", name: "Shifter", url: "https://shifter.no/feed/" },
  { id: "kampanje", name: "Kampanje", url: "https://kampanje.com/feed/" },
  { id: "na24", name: "NA24", url: "https://na24.no/rss" },

  // Myndigheter og offisielle kilder
  { id: "regjeringen", name: "Regjeringen.no", url: "https://www.regjeringen.no/no/rss/Rss/2581966/" },
  { id: "oslobors", name: "Oslo Børs", url: "https://newsweb.oslobors.no/rss" },
  { id: "norgesbank", name: "Norges Bank", url: "https://www.norges-bank.no/rss/nyheter/" },
  { id: "finanstilsynet", name: "Finanstilsynet", url: "https://www.finanstilsynet.no/rss/" },
  { id: "konkurransetilsynet", name: "Konkurransetilsynet", url: "https://www.konkurransetilsynet.no/rss" },

  // Industri og bransje
  { id: "norsk-olje-gass", name: "Norsk olje og gass", url: "https://www.norskoljeoggass.no/feed/" },
  { id: "bygg", name: "Bygg.no", url: "https://www.bygg.no/rss" },
  { id: "intrafish-no", name: "Intrafish", url: "https://www.intrafish.no/rss" },
  { id: "sysla", name: "Sysla", url: "https://www.sysla.no/feed/" },
  { id: "upstream", name: "Upstream Online", url: "https://www.upstreamonline.com/rss" },

  // Internasjonale
  { id: "reuters-business", name: "Reuters Business", url: "https://news.google.com/rss/search?q=reuters+business&hl=en-US&gl=US&ceid=US:en" },
];

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  trimValues: true,
  parseTagValue: false,
});

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (Array.isArray(v)) return v;
  return v != null ? [v] : [];
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function parseDate(value: string | undefined | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function extractGuid(item: Record<string, unknown>, fallbackUrl: string): string {
  const g = item["guid"];
  if (typeof g === "string" && g.length > 0) return g;
  if (g && typeof g === "object" && "#text" in g) return String((g as Record<string, unknown>)["#text"]);
  return fallbackUrl;
}

function extractUrl(item: Record<string, unknown>): string {
  const link = item["link"];
  if (typeof link === "string") return link;
  const enclosure = item["enclosure"];
  if (enclosure && typeof enclosure === "object" && "url" in enclosure) {
    return String((enclosure as Record<string, unknown>)["url"]);
  }
  return "";
}

function itemToRssItem(item: Record<string, unknown>, source: string): ParsedRssItem | null {
  const title = typeof item["title"] === "string" ? item["title"].trim() : null;
  if (!title) return null;

  const url = extractUrl(item);
  if (!url) return null;

  const guid = extractGuid(item, url);
  const rawDescription = item["description"] ?? item["content:encoded"] ?? item["summary"] ?? null;
  const summary = rawDescription ? stripHtml(String(rawDescription)).slice(0, 500) : null;
  const pubDate = parseDate(
    (typeof item["pubDate"] === "string" ? item["pubDate"] : null) ??
    (typeof item["published"] === "string" ? item["published"] : null) ??
    (typeof item["updated"] === "string" ? item["updated"] : null),
  );
  if (!pubDate) return null;

  return { guid, title, summary, url, publishedAt: pubDate, source };
}

export async function fetchAndParseRssFeed(feed: RssFeedDef): Promise<ParsedRssItem[]> {
  const response = await fetch(feed.url, {
    headers: { Accept: "application/rss+xml, application/xml, text/xml, */*;q=0.1" },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`RSS fetch failed for ${feed.id}: HTTP ${response.status}`);
  }

  const xml = await response.text();
  const parsed = parser.parse(xml) as Record<string, unknown>;

  // RSS 2.0
  const channel = (parsed["rss"] as Record<string, unknown> | undefined)?.["channel"];
  if (channel && typeof channel === "object") {
    const items = asArray((channel as Record<string, unknown>)["item"] as unknown);
    return items.flatMap((item) => {
      const r = itemToRssItem(item as Record<string, unknown>, feed.id);
      return r ? [r] : [];
    });
  }

  // Atom
  const feed2 = parsed["feed"] as Record<string, unknown> | undefined;
  if (feed2) {
    const entries = asArray(feed2["entry"] as unknown);
    return entries.flatMap((entry) => {
      const e = entry as Record<string, unknown>;
      const linkNode = asArray(e["link"] as unknown)[0];
      const href =
        typeof linkNode === "string"
          ? linkNode
          : (linkNode as Record<string, string> | undefined)?.["href"] ?? "";
      const synthetic: Record<string, unknown> = {
        title: e["title"],
        link: href,
        guid: e["id"] ?? href,
        description: e["summary"] ?? e["content"],
        pubDate: e["published"] ?? e["updated"],
      };
      const r = itemToRssItem(synthetic, feed.id);
      return r ? [r] : [];
    });
  }

  return [];
}
