import type { ArticleInput, CompanyInput, RelevanceScore } from "@/server/services/news-relevance-local";

const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

const BATCH_SIZE = 20;

type GeminiScoreItem = {
  index: number;
  totalScore: number;
  directScore: number;
  sectorScore: number;
  macroScore: number;
  competitorScore: number;
  tags: string[];
  reasoning: string;
};

function buildPrompt(articles: ArticleInput[], company: CompanyInput): string {
  const articlesText = articles
    .map((a, i) => `[${i}] ${a.title}\n${a.summary ?? ""}`)
    .join("\n\n");

  return `Du er en norsk finansanalytiker. Vurder relevansen av disse nyhetene for selskapet.

SELSKAP:
- Navn: ${company.name}
- Bransje: ${company.industryCode ? `${company.industryCode.title} (kode: ${company.industryCode.code})` : "Ikke oppgitt"}

ARTIKLER:
${articlesText}

For hver artikkel, returner JSON-array:
[{
  "index": 0,
  "totalScore": 0.0,
  "directScore": 0.0,
  "sectorScore": 0.0,
  "macroScore": 0.0,
  "competitorScore": 0.0,
  "tags": ["tag1"],
  "reasoning": "En kort setning"
}]

Scorer er 0.0–1.0. Inkluder kun artikler med totalScore >= 0.35.
Svar KUN med JSON-arrayen, ingen annen tekst.`;
}

function parseGeminiResponse(text: string): GeminiScoreItem[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    return JSON.parse(match[0]) as GeminiScoreItem[];
  } catch {
    return [];
  }
}

export async function scoreArticlesWithGemini(
  articles: ArticleInput[],
  company: CompanyInput,
  apiKey: string,
): Promise<RelevanceScore[]> {
  const results: RelevanceScore[] = [];

  for (let i = 0; i < articles.length; i += BATCH_SIZE) {
    const batch = articles.slice(i, i + BATCH_SIZE);
    const prompt = buildPrompt(batch, company);

    const response = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (response.status === 429) {
      throw new Error("Gemini rate limit reached");
    }

    if (!response.ok) {
      throw new Error(`Gemini API error: HTTP ${response.status}`);
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const scored = parseGeminiResponse(rawText);

    for (const item of scored) {
      const article = batch[item.index];
      if (!article) continue;
      results.push({
        newsArticleId: article.id,
        totalScore: Math.min(Math.max(item.totalScore, 0), 1),
        directScore: Math.min(Math.max(item.directScore, 0), 1),
        sectorScore: Math.min(Math.max(item.sectorScore, 0), 1),
        macroScore: Math.min(Math.max(item.macroScore, 0), 1),
        competitorScore: Math.min(Math.max(item.competitorScore, 0), 1),
        tags: Array.isArray(item.tags) ? item.tags : [],
        reasoning: typeof item.reasoning === "string" ? item.reasoning : null,
        scoredBy: "gemini",
      });
    }
  }

  return results;
}
