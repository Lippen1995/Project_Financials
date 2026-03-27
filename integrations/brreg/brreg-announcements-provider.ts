import env from "@/lib/env";
import { DataAvailability, NormalizedAnnouncement, NormalizedAnnouncementDetail } from "@/lib/types";
import { AnnouncementsProvider } from "@/integrations/provider-interface";

const BRREG_REVALIDATE_SECONDS = 3600;
const DATE_PATTERN = /^(\d{2})\.(\d{2})\.(\d{4})$/;
const HTML_ENTITY_MAP: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
  Aring: "Å",
  aring: "å",
  AElig: "Æ",
  aelig: "æ",
  Oslash: "Ø",
  oslash: "ø",
};
const ALLOWED_HTML_TAGS = new Set(["b", "br", "em", "h3", "i", "p", "span", "strong", "table", "tbody", "td", "tr"]);

function decodeHtmlEntities(value: string) {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    const normalized = entity.toLowerCase();
    if (normalized.startsWith("#x")) {
      const codePoint = Number.parseInt(normalized.slice(2), 16);
      return Number.isNaN(codePoint) ? match : String.fromCodePoint(codePoint);
    }

    if (normalized.startsWith("#")) {
      const codePoint = Number.parseInt(normalized.slice(1), 10);
      return Number.isNaN(codePoint) ? match : String.fromCodePoint(codePoint);
    }

    return HTML_ENTITY_MAP[entity] ?? HTML_ENTITY_MAP[normalized] ?? match;
  });
}

function stripTags(value: string) {
  return decodeHtmlEntities(value)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseNorwegianDate(value: string) {
  const trimmed = value.trim();
  const match = trimmed.match(DATE_PATTERN);
  if (!match) {
    return null;
  }

  const [, day, month, year] = match;
  return new Date(`${year}-${month}-${day}T00:00:00+01:00`);
}

function buildAnnouncementUrl(path: string) {
  return new URL(path, `${env.brregAnnouncementsBaseUrl}/`).toString();
}

async function fetchBrregHtml(url: string, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "text/html, text/plain;q=0.9, */*;q=0.8",
      },
      next: { revalidate: BRREG_REVALIDATE_SECONDS },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    return new TextDecoder("windows-1252").decode(buffer);
  } finally {
    clearTimeout(timeout);
  }
}

function sanitizeAnnouncementHtml(fragment: string) {
  return fragment
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    .replace(/<\/?(html|body|meta|title)[^>]*>/gi, "")
    .replace(/<img[^>]*>/gi, "")
    .replace(/<\s*(\/?)\s*([a-z0-9]+)(?:\s[^>]*)?>/gi, (_match, closing: string, tagName: string) => {
      const normalized = tagName.toLowerCase();
      return ALLOWED_HTML_TAGS.has(normalized) ? `<${closing}${normalized}>` : "";
    })
    .replace(/(?:<br>\s*){3,}/gi, "<br><br>")
    .trim();
}

function extractAnnouncementRows(html: string) {
  const pattern =
    /<tr[^>]*>\s*<td[^>]*>[\s\S]*?<\/td>\s*<td[^>]*nowrap[^>]*>\s*<p>([\s\S]*?)<\/p>\s*<\/td>\s*<td[^>]*>[\s\S]*?<\/td>\s*<td[^>]*nowrap[^>]*>\s*<p>\s*<a href="(hent_en\.jsp\?[^"]+)">([\s\S]*?)<\/a>\s*<\/p>/gi;
  const rows: Array<{ dateText: string; detailPath: string; title: string }> = [];
  let match = pattern.exec(html);

  while (match) {
    rows.push({
      dateText: stripTags(match[1]),
      detailPath: decodeHtmlEntities(match[2]),
      title: stripTags(match[3]),
    });
    match = pattern.exec(html);
  }

  return rows;
}

function parseAnnouncementList(
  orgNumber: string,
  html: string,
): {
  announcements: NormalizedAnnouncement[];
  availability: DataAvailability;
  allAnnouncementsUrl: string | null;
} {
  if (/Dette er ikke et gyldig organisasjonsnummer/i.test(html)) {
    return {
      announcements: [],
      availability: {
        available: false,
        sourceSystem: "BRREG",
        message: "Kunngjøringer kunne ikke hentes fordi organisasjonsnummeret ikke ble akseptert av Brreg.",
      } satisfies DataAvailability,
      allAnnouncementsUrl: null,
    };
  }

  const allAnnouncementsMatch = html.match(/<a href="(hent_alle\.jsp\?[^"]+)">Vis alle kunngj/);
  const allAnnouncementsUrl = allAnnouncementsMatch ? buildAnnouncementUrl(decodeHtmlEntities(allAnnouncementsMatch[1])) : null;
  const rows = extractAnnouncementRows(html);

  if (rows.length === 0) {
    const hasEmptyState = /Det finnes ingen kunngj/i.test(html);
    return {
      announcements: [],
      availability: {
        available: hasEmptyState,
        sourceSystem: "BRREG",
        message: hasEmptyState
          ? "Brreg har ingen registrerte kunngjøringer for denne virksomheten."
          : "Kunngjøringer kunne ikke tolkes fra Brreg akkurat nå.",
      } satisfies DataAvailability,
      allAnnouncementsUrl,
    };
  }

  const now = new Date();
  const announcements = rows
    .map<NormalizedAnnouncement | null>((row) => {
      const detailUrl = buildAnnouncementUrl(row.detailPath);
      const announcementUrl = new URL(detailUrl);
      const id = announcementUrl.searchParams.get("kid");
      if (!id) {
        return null;
      }

      const publishedAt = row.dateText ? parseNorwegianDate(row.dateText) : null;

      return {
        sourceSystem: "BRREG",
        sourceEntityType: "announcement",
        sourceId: id,
        fetchedAt: now,
        normalizedAt: now,
        rawPayload: {
          title: row.title,
          detailUrl,
          allAnnouncementsUrl,
        },
        id,
        orgNumber,
        title: row.title,
        publishedAt,
        year: publishedAt ? publishedAt.getFullYear() : null,
        detailUrl,
      } satisfies NormalizedAnnouncement;
    })
    .filter((announcement): announcement is NormalizedAnnouncement => announcement !== null);

  return {
    announcements,
    availability: {
      available: true,
      sourceSystem: "BRREG",
      message:
        announcements.length > 0
          ? `Kunngjøringer er hentet fra Brønnøysundregistrene (${announcements.length} registrerte hendelser).`
          : "Brreg har ingen registrerte kunngjøringer for denne virksomheten.",
    } satisfies DataAvailability,
    allAnnouncementsUrl,
  };
}

function parseAnnouncementDetail(
  orgNumber: string,
  announcementId: string,
  html: string,
  publishedAt?: Date | null,
) {
  const detailMatch = html.match(/<td colspan="3">([\s\S]*?<h3>[\s\S]*?)<\/td>\s*<\/tr>\s*<tr class="hide-on-print">/i);
  if (!detailMatch) {
    return null;
  }

  const rawFragment = detailMatch[1];
  const titleMatch = rawFragment.match(/<h3>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>[\s\S]*?<\/h3>/i);
  const title = titleMatch ? stripTags(titleMatch[1]) : "Kunngjøring";
  const sourceLabelMatch = rawFragment.match(/(?:Foretaksregisteret|Regnskapsregisteret)\s+\d{2}\.\d{2}\.\d{4}/i);
  const now = new Date();

  return {
    sourceSystem: "BRREG",
    sourceEntityType: "announcementDetail",
    sourceId: announcementId,
    fetchedAt: now,
    normalizedAt: now,
    rawPayload: {
      html: rawFragment,
    },
    id: announcementId,
    orgNumber,
    title,
    publishedAt: publishedAt ?? null,
    sourceLabel: sourceLabelMatch ? stripTags(sourceLabelMatch[0]) : null,
    detailUrl: buildAnnouncementUrl(`hent_en.jsp?kid=${announcementId}&sokeverdi=${orgNumber}&spraak=nb`),
    contentHtml: sanitizeAnnouncementHtml(rawFragment),
  } satisfies NormalizedAnnouncementDetail;
}

export class BrregAnnouncementsProvider implements AnnouncementsProvider {
  async getAnnouncements(orgNumber: string) {
    const html = await fetchBrregHtml(
      `${env.brregAnnouncementsBaseUrl}/hent_nr.jsp?orgnr=${encodeURIComponent(orgNumber)}`,
    );

    return parseAnnouncementList(orgNumber, html);
  }

  async getAnnouncementDetail(orgNumber: string, announcementId: string, publishedAt?: Date | null) {
    const html = await fetchBrregHtml(
      `${env.brregAnnouncementsBaseUrl}/hent_en.jsp?kid=${encodeURIComponent(announcementId)}&sokeverdi=${encodeURIComponent(orgNumber)}&spraak=nb`,
    );

    return parseAnnouncementDetail(orgNumber, announcementId, html, publishedAt);
  }
}
