import env from "@/lib/env";
import { scoreArticlesWithGemini } from "@/integrations/google/gemini-news-relevance-provider";
import { scoreArticlesLocally } from "@/server/services/news-relevance-local";
import type { ArticleInput, CompanyInput, RelevanceScore } from "@/server/services/news-relevance-local";

export type { ArticleInput, CompanyInput, RelevanceScore };

export async function scoreArticlesForCompany(
  articles: ArticleInput[],
  company: CompanyInput,
): Promise<RelevanceScore[]> {
  if (articles.length === 0) return [];

  if (env.googleGeminiApiKey) {
    try {
      return await scoreArticlesWithGemini(articles, company, env.googleGeminiApiKey);
    } catch (error) {
      console.warn(
        `[news-relevance] Gemini failed for company ${company.id}, falling back to local scoring:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  return scoreArticlesLocally(articles, company);
}
