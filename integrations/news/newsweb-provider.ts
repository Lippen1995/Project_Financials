type NewswebUrls = {
  api_large?: string;
};

type NewswebApiResponse<T> = {
  data?: T;
};

export type NewswebIssuer = {
  issuerId: number;
  issuerSign: string;
  symbol?: string;
  name: string;
  isActive?: number;
};

type NewswebCategory = {
  category_no?: string;
  category_en?: string;
};

type NewswebListMessage = {
  id?: number;
  messageId: number;
  title: string;
  category?: NewswebCategory[];
  markets?: string[];
  issuerId: number;
  issuerSign?: string;
  issuerName?: string;
  publishedTime: string;
  clientAnnouncementId?: string;
};

type NewswebMessageDetail = {
  message?: {
    body?: string;
  };
};

export type NewswebArticle = {
  guid: string;
  title: string;
  summary: string | null;
  url: string;
  publishedAt: Date;
  source: "newsweb";
  category: string | null;
  issuerId: number;
  issuerSign: string | null;
  issuerName: string | null;
};

const NEWSWEB_ORIGIN = "https://newsweb.oslobors.no";
const NEWSWEB_DEFAULT_API_BASE = "https://api3.oslo.oslobors.no";
const NEWSWEB_SOURCE_SYSTEM = "newsweb";
const ISSUER_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const API_BASE_CACHE_TTL_MS = 60 * 60 * 1000;
const ISSUER_MESSAGES_CACHE_TTL_MS = 2 * 60 * 1000;
const LATEST_MESSAGES_CACHE_TTL_MS = 60 * 1000;

let cachedApiBase: { value: string; fetchedAt: number } | null = null;
let cachedIssuers: { value: NewswebIssuer[]; fetchedAt: number } | null = null;
const issuerMessagesCache = new Map<string, { value: NewswebArticle[]; fetchedAt: number }>();
let latestMessagesCache: { value: NewswebArticle[]; fetchedAt: number } | null = null;

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function truncateSummary(value: string) {
  const normalized = stripHtml(value);
  return normalized.length > 500 ? `${normalized.slice(0, 497)}...` : normalized;
}

function normalizeName(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/\b(asa|as|ab|plc|ltd|limited|holding|holdings|group|gruppen|konsern)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeFullName(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function categoryLabel(categories: NewswebCategory[] | undefined) {
  const category = categories?.[0];
  return category?.category_no ?? category?.category_en ?? null;
}

async function fetchNewswebApiBase() {
  if (cachedApiBase && Date.now() - cachedApiBase.fetchedAt < API_BASE_CACHE_TTL_MS) {
    return cachedApiBase.value;
  }

  try {
    const response = await fetch(`${NEWSWEB_ORIGIN}/urls.json`, {
      headers: {
        Accept: "application/json",
        "User-Agent": "FjordInsightNewsBot/1.0 (+https://fjordinsight.local)",
      },
      signal: AbortSignal.timeout(8_000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const urls = (await response.json()) as NewswebUrls;
    const apiBase = urls.api_large?.replace(/\/+$/g, "") || NEWSWEB_DEFAULT_API_BASE;
    cachedApiBase = { value: apiBase, fetchedAt: Date.now() };
    return apiBase;
  } catch {
    cachedApiBase = { value: NEWSWEB_DEFAULT_API_BASE, fetchedAt: Date.now() };
    return NEWSWEB_DEFAULT_API_BASE;
  }
}

async function postNewsweb<T>(path: string) {
  const apiBase = await fetchNewswebApiBase();
  const response = await fetch(`${apiBase}${path}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "FjordInsightNewsBot/1.0 (+https://fjordinsight.local)",
    },
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) {
    throw new Error(`NewsWeb fetch failed for ${path}: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as NewswebApiResponse<T>;
  if (!payload.data) {
    throw new Error(`NewsWeb response missing data for ${path}`);
  }

  return payload.data;
}

export async function fetchNewswebIssuers() {
  if (cachedIssuers && Date.now() - cachedIssuers.fetchedAt < ISSUER_CACHE_TTL_MS) {
    return cachedIssuers.value;
  }

  const data = await postNewsweb<{ issuers?: NewswebIssuer[] }>("/v1/newsreader/issuers");
  const issuers = data.issuers ?? [];
  cachedIssuers = { value: issuers, fetchedAt: Date.now() };
  return issuers;
}

export function findBestNewswebIssuerMatch(companyName: string, issuers: NewswebIssuer[]) {
  const normalizedCompany = normalizeName(companyName);
  const normalizedFullCompany = normalizeFullName(companyName);
  if (!normalizedCompany || normalizedCompany.length < 3) {
    return null;
  }

  const exactMatches = issuers.filter((issuer) => {
    const issuerName = issuer.name ?? "";
    return (
      normalizeFullName(issuerName) === normalizedFullCompany ||
      normalizeName(issuerName) === normalizedCompany
    );
  });

  if (exactMatches.length === 0) {
    return null;
  }

  return exactMatches.sort((left, right) => {
    const activeDelta = (right.isActive ?? 0) - (left.isActive ?? 0);
    if (activeDelta !== 0) return activeDelta;

    const leftFullExact = normalizeFullName(left.name) === normalizedFullCompany ? 1 : 0;
    const rightFullExact = normalizeFullName(right.name) === normalizedFullCompany ? 1 : 0;
    if (rightFullExact !== leftFullExact) return rightFullExact - leftFullExact;

    return left.name.length - right.name.length;
  })[0] ?? null;
}

async function fetchNewswebMessageSummary(messageId: number) {
  try {
    const data = await postNewsweb<NewswebMessageDetail>(`/v1/newsreader/message?messageId=${messageId}`);
    const body = data.message?.body;
    return body ? truncateSummary(body) : null;
  } catch {
    return null;
  }
}

async function mapNewswebMessages(
  messages: NewswebListMessage[],
  includeBody: boolean,
) {
  const summaries = includeBody
    ? await Promise.all(messages.map((message) => fetchNewswebMessageSummary(message.messageId)))
    : messages.map(() => null);

  return messages.flatMap((message, index): NewswebArticle[] => {
    const publishedAt = new Date(message.publishedTime);
    if (Number.isNaN(publishedAt.getTime())) {
      return [];
    }

    const category = categoryLabel(message.category);
    const summary = summaries[index] ?? category;

    return [
      {
        guid: `${NEWSWEB_SOURCE_SYSTEM}:${message.messageId}`,
        title: message.title,
        summary,
        url: `${NEWSWEB_ORIGIN}/message/${message.messageId}`,
        publishedAt,
        source: NEWSWEB_SOURCE_SYSTEM,
        category,
        issuerId: message.issuerId,
        issuerSign: message.issuerSign ?? null,
        issuerName: message.issuerName ?? null,
      },
    ];
  });
}

export async function fetchNewswebLatestMessages(
  options: { limit?: number; includeBody?: boolean } = {},
) {
  const limit = options.limit ?? 50;
  if (
    !options.includeBody &&
    latestMessagesCache &&
    Date.now() - latestMessagesCache.fetchedAt < LATEST_MESSAGES_CACHE_TTL_MS
  ) {
    return latestMessagesCache.value.slice(0, limit);
  }

  const params = new URLSearchParams({
    category: "",
    issuer: "",
    fromDate: "",
    toDate: "",
    market: "",
    messageTitle: "",
  });
  const data = await postNewsweb<{ messages?: NewswebListMessage[] }>(
    `/v1/newsreader/list?${params.toString()}`,
  );
  const articles = await mapNewswebMessages(
    (data.messages ?? []).slice(0, limit),
    options.includeBody ?? false,
  );

  if (!options.includeBody) {
    latestMessagesCache = { value: articles, fetchedAt: Date.now() };
  }
  return articles;
}

export async function fetchNewswebIssuerMessages(
  issuerId: number,
  options: { limit?: number; includeBody?: boolean; fromDate?: string; toDate?: string } = {},
) {
  const cacheKey = [
    issuerId,
    options.limit ?? 30,
    options.includeBody ? "body" : "list",
    options.fromDate ?? "",
    options.toDate ?? "",
  ].join(":");
  const cached = issuerMessagesCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < ISSUER_MESSAGES_CACHE_TTL_MS) {
    return cached.value;
  }

  const params = new URLSearchParams({
    category: "",
    issuer: String(issuerId),
    fromDate: options.fromDate ?? "",
    toDate: options.toDate ?? "",
    market: "",
    messageTitle: "",
  });

  const data = await postNewsweb<{ messages?: NewswebListMessage[] }>(`/v1/newsreader/list?${params.toString()}`);
  const messages = (data.messages ?? []).slice(0, options.limit ?? 30);

  const articles = await mapNewswebMessages(messages, options.includeBody ?? false);

  issuerMessagesCache.set(cacheKey, { value: articles, fetchedAt: Date.now() });
  return articles;
}

export async function fetchNewswebCompanyMessages(
  companyName: string,
  options: { limit?: number; includeBody?: boolean; fromDate?: string; toDate?: string } = {},
) {
  const issuers = await fetchNewswebIssuers();
  const issuer = findBestNewswebIssuerMatch(companyName, issuers);
  if (!issuer) {
    return [];
  }

  return fetchNewswebIssuerMessages(issuer.issuerId, options);
}
