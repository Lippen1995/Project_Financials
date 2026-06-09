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
  categories: string[];
};

type GoogleNewsSearchOptions = {
  feedId?: string;
  language?: string;
  geography?: string;
  edition?: string;
};

export const RSS_FEEDS: RssFeedDef[] = [
  // Norske okonomi/naringsliv
  { id: "e24", name: "E24", url: "https://e24.no/rss2" },
  { id: "dn", name: "Dagens Naeringsliv", url: "https://services.dn.no/api/feed/rss/" },
  { id: "nrk-okonomi", name: "NRK Nyheter", url: "https://www.nrk.no/nyheter/siste.rss" },
  { id: "tu", name: "Teknisk Ukeblad", url: "https://www.tu.no/feeds/general.xml" },
  { id: "kampanje", name: "Kampanje", url: "https://kampanje.com/rss" },
  { id: "na24", name: "NA24", url: "https://na24.no/rss" },
  { id: "bbc-business", name: "BBC Business", url: "https://feeds.bbci.co.uk/news/business/rss.xml" },
  { id: "guardian-business", name: "The Guardian Business", url: "https://www.theguardian.com/uk/business/rss" },
  { id: "guardian-world", name: "The Guardian World", url: "https://www.theguardian.com/world/rss" },

  // Myndigheter og offisielle kilder
  { id: "regjeringen", name: "Regjeringen.no", url: "https://www.regjeringen.no/no/rss/Rss/2581966/" },
  { id: "oslobors", name: "Oslo Bors", url: "https://newsweb.oslobors.no/rss" },
  {
    id: "norgesbank",
    name: "Norges Bank",
    url: "https://www.norges-bank.no/en/rss-feeds/Press-releases---Norges-Bank/",
  },
  { id: "finanstilsynet", name: "Finanstilsynet", url: "https://www.finanstilsynet.no/rss/nyheter/" },
  { id: "konkurransetilsynet", name: "Konkurransetilsynet", url: "https://www.konkurransetilsynet.no/rss" },
  { id: "ssb-business-financials", name: "SSB Virksomheter og regnskap", url: "https://www.ssb.no/rss/virksomheter-foretak-og-regnskap" },
  { id: "ssb-energy-industry", name: "SSB Energi og industri", url: "https://www.ssb.no/rss/energi-og-industri" },
  { id: "ssb-tech-innovation", name: "SSB Teknologi og innovasjon", url: "https://www.ssb.no/rss/teknologi-og-innovasjon" },
  { id: "ssb-transport-travel", name: "SSB Transport og reiseliv", url: "https://www.ssb.no/rss/transport-og-reiseliv" },
  { id: "ssb-construction-property", name: "SSB Bygg, bolig og eiendom", url: "https://www.ssb.no/rss/bygg-bolig-og-eiendom" },
  { id: "ssb-bank-finance", name: "SSB Bank og finansmarked", url: "https://www.ssb.no/rss/bank-og-finansmarked" },

  // Industri og bransje
  { id: "norsk-olje-gass", name: "Norsk olje og gass", url: "https://www.norskoljeoggass.no/feed/" },
  {
    id: "sodir-news",
    name: "Sokkeldirektoratet",
    url: "https://www.sodir.no/aktuelt/nyheter/rss/generelle-nyheter/",
  },
  {
    id: "sodir-production",
    name: "Sokkeldirektoratet produksjonstall",
    url: "https://www.sodir.no/aktuelt/nyheter/rss/produksjonstall/",
  },
  {
    id: "sodir-drilling-permits",
    name: "Sokkeldirektoratet boretillatelser",
    url: "https://www.sodir.no/aktuelt/nyheter/rss/boretillatelser/",
  },
  {
    id: "sodir-exploration-results",
    name: "Sokkeldirektoratet leteboring",
    url: "https://www.sodir.no/aktuelt/nyheter/rss/resultat-av-leteboring/",
  },

  // Internasjonale
  { id: "eia-today", name: "EIA Today in Energy", url: "https://www.eia.gov/rss/todayinenergy.xml" },
  { id: "eia-press", name: "EIA Press Releases", url: "https://www.eia.gov/rss/press_rss.xml" },
  {
    id: "eia-petroleum-weekly",
    name: "EIA This Week in Petroleum",
    url: "https://www.eia.gov/petroleum/weekly/includes/week_in_petroleum_rss.xml",
  },
  { id: "nasa-breaking", name: "NASA News Releases", url: "https://www.nasa.gov/news-release/feed/" },
  { id: "fda-press", name: "FDA Press Releases", url: "https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/press-releases/rss.xml" },
  { id: "ecb-press", name: "ECB Press", url: "https://www.ecb.europa.eu/rss/press.html" },
  { id: "federalreserve-press", name: "Federal Reserve Press", url: "https://www.federalreserve.gov/feeds/press_all.xml" },
  { id: "offshore-energy", name: "Offshore Energy", url: "https://www.offshore-energy.biz/feed/" },
  { id: "offshorewind", name: "Offshore Wind", url: "https://www.offshorewind.biz/feed/" },
  { id: "worldoil-news", name: "World Oil Latest News", url: "https://www.worldoil.com/rss?feed=news" },
  { id: "worldoil-permian", name: "World Oil Permian Basin", url: "https://www.worldoil.com/rss?feed=topic:permian+basin" },
  { id: "pulpapernews", name: "PulpaperNews", url: "https://www.pulpapernews.com/rss.xml" },
  { id: "mining-com", name: "MINING.COM", url: "https://www.mining.com/feed/" },
  { id: "mining-technology", name: "Mining Technology", url: "https://www.mining-technology.com/feed/" },
  { id: "marinelink", name: "MarineLink", url: "https://www.marinelink.com/news/rss" },
  { id: "freightwaves", name: "FreightWaves", url: "https://www.freightwaves.com/news/feed" },
  { id: "splash247", name: "Splash247", url: "https://splash247.com/feed/" },
  { id: "undercurrent-news", name: "Undercurrent News", url: "https://www.undercurrentnews.com/feed/" },
  { id: "fishfarmer", name: "Fish Farmer", url: "https://fishfarmer.affino.com/Syndication/DF.cfm?f=8&ft=10&redirected=1" },
  { id: "renewable-energy-world", name: "Renewable Energy World", url: "https://www.renewableenergyworld.com/feed/" },
  { id: "semiengineering", name: "SemiEngineering", url: "https://semiengineering.com/feed/" },
  { id: "siliconangle", name: "SiliconANGLE", url: "https://siliconangle.com/feed/" },
  { id: "fiercebiotech", name: "Fierce Biotech", url: "https://www.fiercebiotech.com/rss/xml" },
  { id: "biopharmadive", name: "BioPharma Dive", url: "https://www.biopharmadive.com/feeds/news/" },
  { id: "constructiondive", name: "Construction Dive", url: "https://www.constructiondive.com/feeds/news/" },
  { id: "recyclingtoday", name: "Recycling Today", url: "https://www.recyclingtoday.com/rss/" },
  { id: "spacenews", name: "SpaceNews", url: "https://spacenews.com/feed/" },
  { id: "defensenews", name: "Defense News", url: "https://www.defensenews.com/arc/outboundfeeds/rss/" },
  { id: "army-technology", name: "Army Technology", url: "https://www.army-technology.com/feed/" },
  { id: "airport-technology", name: "Airport Technology", url: "https://www.airport-technology.com/feed/" },
  { id: "agfunder", name: "AgFunderNews", url: "https://agfundernews.com/feed" },
  { id: "insurancejournal", name: "Insurance Journal", url: "https://www.insurancejournal.com/feed/" },
  { id: "scmp-business", name: "SCMP Business", url: "https://www.scmp.com/rss/4/feed/" },
  { id: "asiafinancial", name: "Asia Financial", url: "https://www.asiafinancial.com/feed" },
  {
    id: "reuters-business",
    name: "Reuters Business",
    url: "https://news.google.com/rss/search?q=reuters+business&hl=en-US&gl=US&ceid=US:en",
  },
];

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  trimValues: true,
  parseTagValue: false,
  processEntities: {
    enabled: true,
    maxTotalExpansions: 10_000,
  },
});

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (Array.isArray(value)) return value;
  return value != null ? [value] : [];
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function parseDate(value: string | undefined | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function extractGuid(item: Record<string, unknown>, fallbackUrl: string): string {
  const guid = item.guid;
  if (typeof guid === "string" && guid.length > 0) return guid;
  if (guid && typeof guid === "object" && "#text" in guid) {
    return String((guid as Record<string, unknown>)["#text"]);
  }
  return fallbackUrl;
}

function resolveFeedUrl(url: string, feedUrl: string): string {
  try {
    return new URL(url, feedUrl).toString();
  } catch {
    return url;
  }
}

function extractUrl(item: Record<string, unknown>, feedUrl: string): string {
  const link = item.link;
  if (typeof link === "string") return resolveFeedUrl(link, feedUrl);
  const enclosure = item.enclosure;
  if (enclosure && typeof enclosure === "object" && "url" in enclosure) {
    return resolveFeedUrl(String((enclosure as Record<string, unknown>).url), feedUrl);
  }
  return "";
}

function extractCategories(item: Record<string, unknown>): string[] {
  return asArray(item.category as unknown)
    .flatMap((category) => {
      if (typeof category === "string") return [category];
      if (category && typeof category === "object") {
        const value = (category as Record<string, unknown>)["#text"] ?? (category as Record<string, unknown>).term;
        return typeof value === "string" ? [value] : [];
      }
      return [];
    })
    .map((category) => category.trim())
    .filter(Boolean);
}

function itemToRssItem(item: Record<string, unknown>, source: string, feedUrl: string): ParsedRssItem | null {
  const title = typeof item.title === "string" ? item.title.trim() : null;
  if (!title) return null;

  const url = extractUrl(item, feedUrl);
  if (!url) return null;

  const guid = extractGuid(item, url);
  const rawDescription = item.description ?? item["content:encoded"] ?? item.summary ?? null;
  const summary = rawDescription ? stripHtml(String(rawDescription)).slice(0, 500) : null;
  const publishedAt = parseDate(
    (typeof item.pubDate === "string" ? item.pubDate : null) ??
      (typeof item.published === "string" ? item.published : null) ??
      (typeof item.updated === "string" ? item.updated : null),
  );
  if (!publishedAt) return null;

  return { guid, title, summary, url, publishedAt, source, categories: extractCategories(item) };
}

function parseFeedXml(feed: RssFeedDef, xml: string): ParsedRssItem[] {
  const parsed = parser.parse(xml) as Record<string, unknown>;

  const channel = (parsed.rss as Record<string, unknown> | undefined)?.channel;
  if (channel && typeof channel === "object") {
    const items = asArray((channel as Record<string, unknown>).item as unknown);
    return items.flatMap((item) => {
      const rssItem = itemToRssItem(item as Record<string, unknown>, feed.id, feed.url);
      return rssItem ? [rssItem] : [];
    });
  }

  const atomFeed = parsed.feed as Record<string, unknown> | undefined;
  if (atomFeed) {
    const entries = asArray(atomFeed.entry as unknown);
    return entries.flatMap((entry) => {
      const atomEntry = entry as Record<string, unknown>;
      const linkNode = asArray(atomEntry.link as unknown)[0];
      const href =
        typeof linkNode === "string"
          ? linkNode
          : (linkNode as Record<string, string> | undefined)?.href ?? "";

      const syntheticItem: Record<string, unknown> = {
        title: atomEntry.title,
        link: href,
        guid: atomEntry.id ?? href,
        description: atomEntry.summary ?? atomEntry.content,
        pubDate: atomEntry.published ?? atomEntry.updated,
      };

      const rssItem = itemToRssItem(syntheticItem, feed.id, feed.url);
      return rssItem ? [rssItem] : [];
    });
  }

  const customRoot = parsed.root as Record<string, unknown> | undefined;
  const mainArticles = customRoot?.MainArticles as Record<string, unknown> | undefined;
  if (mainArticles && typeof mainArticles === "object") {
    const items = asArray(mainArticles.Item as unknown);
    return items.flatMap((item) => {
      const rssItem = itemToRssItem(item as Record<string, unknown>, feed.id, feed.url);
      return rssItem ? [rssItem] : [];
    });
  }

  return [];
}

function buildGoogleNewsSearchUrl(
  query: string,
  {
    language = "no",
    geography = "NO",
    edition = "NO:no",
  }: Omit<GoogleNewsSearchOptions, "feedId"> = {},
) {
  const params = new URLSearchParams({
    q: query,
    hl: language,
    gl: geography,
    ceid: edition,
  });

  return `https://news.google.com/rss/search?${params.toString()}`;
}

export async function fetchAndParseRssFeed(feed: RssFeedDef): Promise<ParsedRssItem[]> {
  let response: Response;
  try {
    response = await fetch(feed.url, {
      headers: {
        Accept: "application/rss+xml, application/xml, text/xml, */*;q=0.1",
        "User-Agent": "FjordInsightNewsBot/1.0 (+https://fjordinsight.local)",
      },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    throw new Error(`RSS fetch failed for ${feed.id}: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!response.ok) {
    throw new Error(`RSS fetch failed for ${feed.id}: HTTP ${response.status}`);
  }

  const xml = (await response.text()).replace(/^\uFEFF/, "").trim();

  try {
    return parseFeedXml(feed, xml);
  } catch (error) {
    const preview = xml.slice(0, 160).replace(/\s+/g, " ");
    throw new Error(
      `RSS parse failed for ${feed.id}: ${error instanceof Error ? error.message : String(error)}. Preview: ${preview}`,
    );
  }
}

export async function fetchGoogleNewsSearchFeed(
  query: string,
  options: GoogleNewsSearchOptions = {},
): Promise<ParsedRssItem[]> {
  const feed: RssFeedDef = {
    id: options.feedId ?? "google-news-search",
    name: `Google News Search: ${query}`,
    url: buildGoogleNewsSearchUrl(query, options),
  };

  return fetchAndParseRssFeed(feed);
}
