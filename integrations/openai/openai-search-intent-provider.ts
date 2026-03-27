import env from "@/lib/env";
import { SearchInterpretation, SearchInterpretationLocationType } from "@/lib/types";

type OpenAiChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
};

type SearchIntentPayload = {
  rewrittenQuery?: string;
  companyTerms?: string[];
  industryTerms?: string[];
  geographicTerm?: string | null;
  geographicType?: SearchInterpretationLocationType | null;
  intentSummary?: string | null;
};

const DEFAULT_INTERPRETATION: Omit<SearchInterpretation, "originalQuery"> = {
  rewrittenQuery: "",
  aiAssisted: false,
  fallbackReason: null,
  companyTerms: [],
  industryTerms: [],
  geographicTerm: null,
  geographicType: null,
  intentSummary: null,
  matchedIndustryCodes: [],
};

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a");
}

function normalizeList(values: unknown) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean)
    .slice(0, 8);
}

function buildFallbackInterpretation(query: string, reason?: string): SearchInterpretation {
  const trimmed = query.trim();
  const lower = normalizeText(trimmed);
  const locationMatch = lower.match(/\b(?:i|innenfor|rundt)\s+([a-zA-ZæøåÆØÅ\-\s]+)$/);
  const geographicTerm = locationMatch?.[1]?.trim() ?? null;
  const withoutLocation = geographicTerm
    ? trimmed.slice(0, Math.max(0, locationMatch?.index ?? trimmed.length)).trim()
    : trimmed;
  const simplified = withoutLocation
    .replace(/^selskaper?\s+som\s+/i, "")
    .replace(/^(finn|vis|let etter)\s+/i, "")
    .trim();
  const normalizedBase = simplified || withoutLocation || trimmed;
  const extraTerms = new Set<string>();

  if (/barneklaer|barnekl[æa]r/i.test(normalizedBase)) {
    extraTerms.add("barneklaer");
    extraTerms.add("klaer");
  }

  if (/klaer|kl[æa]r/i.test(normalizedBase)) {
    extraTerms.add("klaer");
  }

  if (/selger|butikk|netthandel|forhandler/i.test(normalizedBase) && /klaer|kl[æa]r/i.test(normalizedBase)) {
    extraTerms.add("detaljhandel klaer");
    extraTerms.add("butikk klaer");
  }

  return {
    originalQuery: query,
    rewrittenQuery: normalizedBase,
    aiAssisted: false,
    fallbackReason: reason ?? "AI-tolkning er ikke konfigurert.",
    companyTerms: [],
    industryTerms: Array.from(
      new Set([normalizedBase, ...extraTerms].filter(Boolean)),
    ),
    geographicTerm,
    geographicType: null,
    intentSummary: null,
    matchedIndustryCodes: [],
  };
}

export class OpenAiSearchIntentProvider {
  async interpretQuery(query: string): Promise<SearchInterpretation> {
    const trimmed = query.trim();
    if (!trimmed) {
      return {
        ...DEFAULT_INTERPRETATION,
        originalQuery: query,
      };
    }

    if (!env.openAiApiKey) {
      return buildFallbackInterpretation(trimmed, "OPENAI_API_KEY mangler.");
    }

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.openAiApiKey}`,
        },
        body: JSON.stringify({
          model: env.openAiSearchModel,
          temperature: 0,
          response_format: {
            type: "json_object",
          },
          messages: [
            {
              role: "system",
              content:
                "You convert Norwegian company search queries into structured intent. " +
                "Return strict JSON only with keys rewrittenQuery, companyTerms, industryTerms, geographicTerm, geographicType, intentSummary. " +
                "Use geographicType values MUNICIPALITY, COUNTY, POSTAL_CITY, or UNKNOWN. " +
                "Do not invent company names, codes, or facts.",
            },
            {
              role: "user",
              content:
                `Analyze this Norwegian business search query: "${trimmed}". ` +
                "Extract likely industry/activity terms, keep explicit company-name hints separate, and summarize the intent in Norwegian.",
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI request failed with status ${response.status}`);
      }

      const payload = (await response.json()) as OpenAiChatCompletionResponse;
      const content = payload.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error("OpenAI returned empty content.");
      }

      const parsed = JSON.parse(content) as SearchIntentPayload;

      return {
        originalQuery: trimmed,
        rewrittenQuery: parsed.rewrittenQuery?.trim() || trimmed,
        aiAssisted: true,
        fallbackReason: null,
        companyTerms: normalizeList(parsed.companyTerms),
        industryTerms: normalizeList(parsed.industryTerms),
        geographicTerm: typeof parsed.geographicTerm === "string" ? parsed.geographicTerm.trim() : null,
        geographicType: parsed.geographicType ?? null,
        intentSummary: typeof parsed.intentSummary === "string" ? parsed.intentSummary.trim() : null,
        matchedIndustryCodes: [],
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "AI-tolkning feilet.";
      return buildFallbackInterpretation(trimmed, reason);
    }
  }
}
