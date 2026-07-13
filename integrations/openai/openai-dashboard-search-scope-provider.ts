import env from "@/lib/env";
import type { ResolvedDashboardSearchScope } from "@/lib/dashboard-search";

type AiScopeResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
};

const scopes: ResolvedDashboardSearchScope[] = [
  "companies",
  "industries",
  "persons",
  "roles",
  "bankruptcies",
];

export class OpenAiDashboardSearchScopeProvider {
  async classify(query: string): Promise<ResolvedDashboardSearchScope | null> {
    if (!env.openAiApiKey) return null;

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
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "Classify a Norwegian business-search query into exactly one available search scope. " +
                "Return strict JSON with the key scope and one of: companies, industries, persons, roles, bankruptcies. " +
                "Choose persons for a named individual, roles for queries primarily about a position, industries for an industry/activity, bankruptcies for bankruptcy-focused queries, otherwise companies. Do not invent facts.",
            },
            { role: "user", content: query },
          ],
        }),
      });
      if (!response.ok) return null;

      const payload = (await response.json()) as AiScopeResponse;
      const content = payload.choices?.[0]?.message?.content;
      if (!content) return null;
      const parsed = JSON.parse(content) as { scope?: string };
      return scopes.includes(parsed.scope as ResolvedDashboardSearchScope)
        ? (parsed.scope as ResolvedDashboardSearchScope)
        : null;
    } catch {
      return null;
    }
  }
}
