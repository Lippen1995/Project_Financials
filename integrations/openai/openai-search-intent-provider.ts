import env from "@/lib/env";
import { calculateAiUsageTokens, type AiTokenUsage } from "@/lib/ai-search-usage";
import { SearchInterpretation, SearchInterpretationLocationType } from "@/lib/types";
import { OpenAiLlmClient } from "@/server/ai-search/llm/openai-client";
import {
  LlmProviderAccountingError,
  LlmProviderResponseError,
  type LlmClient,
  type LlmRunResult,
} from "@/server/ai-search/llm/types";
import {
  buildSecureNjordSystemPrompt,
  inspectNjordUserQuery,
} from "@/server/ai-search/runtime-policy";

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

function toObservedAiUsage(
  usage: LlmRunResult["usage"],
  fallbackModel: string,
): AiTokenUsage | null {
  if (!usage?.sourceId) return null;
  const inputTokens = Math.max(0, usage.inputTokens);
  const cachedInputTokens = Math.max(0, usage.cachedInputTokens ?? 0);
  const outputTokens = Math.max(0, usage.outputTokens);
  const fetchedAt = new Date();
  return {
    model: usage.model ?? fallbackModel,
    sourceSystem: "OPENAI",
    sourceEntityType: "chat.completion",
    sourceId: usage.sourceId,
    fetchedAt,
    normalizedAt: new Date(),
    inputTokens,
    cachedInputTokens,
    outputTokens,
    usageTokens: calculateAiUsageTokens({ inputTokens, cachedInputTokens, outputTokens }),
  };
}

function buildFallbackInterpretation(
  query: string,
  reason?: string,
  aiUsage?: AiTokenUsage | null,
): SearchInterpretation {
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
    aiUsage,
    matchedIndustryCodes: [],
  };
}

export class OpenAiSearchIntentProvider {
  private readonly llm: LlmClient;

  constructor(options: { llm?: LlmClient } = {}) {
    this.llm = options.llm ?? new OpenAiLlmClient({
      apiKey: env.openAiApiKey,
      model: env.openAiSearchModel,
    });
  }

  async interpretQuery(
    query: string,
    options: {
      maxCompletionTokens?: number;
      onAiUsageFailure?: (errorCode: "PROVIDER_ACCOUNTING_MISSING") => Promise<void>;
    } = {},
  ): Promise<SearchInterpretation> {
    const trimmed = query.trim();
    if (!trimmed) {
      return {
        ...DEFAULT_INTERPRETATION,
        originalQuery: query,
      };
    }

    if (
      options.maxCompletionTokens == null ||
      !Number.isSafeInteger(options.maxCompletionTokens) ||
      options.maxCompletionTokens < 1 ||
      typeof options.onAiUsageFailure !== "function"
    ) {
      return buildFallbackInterpretation(trimmed, "Eksplisitt tokenbudsjett mangler.");
    }

    if (!env.aiSearchBillingEnabled) {
      return buildFallbackInterpretation(trimmed, "Betalt AI-søk er deaktivert.");
    }
    if (!env.openAiApiKey) {
      return buildFallbackInterpretation(trimmed, "OPENAI_API_KEY mangler.");
    }
    if (!inspectNjordUserQuery(trimmed).allowed) {
      return buildFallbackInterpretation(
        trimmed,
        "AI-tolkning ble avvist av sikkerhetskontrollen.",
      );
    }

    let observedAiUsage: AiTokenUsage | null = null;
    try {
      const result = await this.llm.run({
        tools: [],
        temperature: 0,
        maxOutputTokens: Math.max(
          1,
          Math.min(500, Math.trunc(options.maxCompletionTokens)),
        ),
        responseFormat: "json_object",
        messages: [
          {
            role: "system",
            content: buildSecureNjordSystemPrompt(
              "You convert Norwegian company search queries into structured intent. " +
                "Return strict JSON only with keys rewrittenQuery, companyTerms, industryTerms, geographicTerm, geographicType, intentSummary. " +
                "Use geographicType values MUNICIPALITY, COUNTY, POSTAL_CITY, or UNKNOWN. " +
                "Do not invent company names, codes, or facts.",
            ),
          },
          {
            role: "user",
            content:
              `Analyze this Norwegian business search query: "${trimmed}". ` +
              "Extract likely industry/activity terms, keep explicit company-name hints separate, and summarize the intent in Norwegian.",
          },
        ],
      });
      observedAiUsage = toObservedAiUsage(result.usage, this.llm.model);
      if (!observedAiUsage) {
        await options.onAiUsageFailure("PROVIDER_ACCOUNTING_MISSING");
        return buildFallbackInterpretation(
          trimmed,
          "Modellsvaret manglet påkrevd forbruksmetadata.",
        );
      }
      const content = result.content;
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
        aiUsage: observedAiUsage,
        matchedIndustryCodes: [],
      };
    } catch (error) {
      if (error instanceof LlmProviderAccountingError) {
        await options.onAiUsageFailure("PROVIDER_ACCOUNTING_MISSING");
        return buildFallbackInterpretation(trimmed, error.message);
      }
      if (error instanceof LlmProviderResponseError) {
        observedAiUsage = toObservedAiUsage(error.usage, this.llm.model);
      }
      const reason = error instanceof Error ? error.message : "AI-tolkning feilet.";
      return buildFallbackInterpretation(trimmed, reason, observedAiUsage);
    }
  }
}
