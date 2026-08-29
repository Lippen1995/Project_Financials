import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  auditLlmCallsites,
  type LlmCallsiteFile,
} from "@/lib/llm-callsite-inventory";

const EXCLUDED_DIRECTORIES = new Set([
  ".git",
  ".next",
  "backups",
  "coverage",
  "node_modules",
  "output",
  "quarantine",
  "test",
]);
const REGISTERED_CALLSITES = [
  {
    path: "server/ai-search/classification/dashboard-search-scope-provider.ts",
    providerSignals: ["shared-llm-client"],
  },
  {
    path: "server/ai-search/classification/search-intent-provider.ts",
    providerSignals: ["shared-llm-client"],
  },
  {
    path: "server/ai-search/agent/agent-loop.ts",
    providerSignals: ["shared-llm-client"],
  },
  { path: "server/ai-search/llm/openai-client.ts", providerSignals: ["openai"] },
  {
    path: "server/ai-search/llm/runtime-client.ts",
    providerSignals: ["provider-adapter-wiring", "shared-llm-client"],
  },
  { path: "scripts/demo-target-agent.ts", providerSignals: ["shared-llm-client"] },
] as const;

function collectSourceFiles(repositoryRoot: string, relativeDirectory: string): LlmCallsiteFile[] {
  const absoluteDirectory = path.join(repositoryRoot, relativeDirectory);

  return readdirSync(absoluteDirectory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      return entry.name.startsWith(".") || EXCLUDED_DIRECTORIES.has(entry.name)
        ? []
        : collectSourceFiles(repositoryRoot, relativePath);
    }
    if (
      !entry.name.match(/\.(?:cjs|js|jsx|mjs|py|ts|tsx)$/) ||
      entry.name.match(/\.(?:test|spec)\.(?:js|jsx|ts|tsx)$/)
    ) {
      return [];
    }
    return [{
      path: relativePath.replaceAll("\\", "/"),
      source: readFileSync(path.join(repositoryRoot, relativePath), "utf8"),
    }];
  });
}

describe("auditLlmCallsites", () => {
  it("rejects provider access outside the shared LLM adapter", () => {
    const audit = auditLlmCallsites(
      [
        {
          path: "app/api/ai-search/route.ts",
          source: 'await fetch("https://api.openai.com/v1/chat/completions")',
        },
      ],
      [{ path: "app/api/ai-search/route.ts", providerSignals: ["shared-llm-client"] }],
    );

    expect(audit.violations).toEqual([
      { path: "app/api/ai-search/route.ts", providerSignals: ["openai"] },
    ]);
  });

  it("rejects concrete provider-adapter wiring from a registered product caller", () => {
    const audit = auditLlmCallsites(
      [{
        path: "app/api/ai-search/route.ts",
        source: `
          import { OpenAiLlmClient } from "@/server/ai-search/llm/openai-client";
          const llm = new OpenAiLlmClient({ apiKey: "key", model: "model" });
        `,
      }],
      [{ path: "app/api/ai-search/route.ts", providerSignals: ["shared-llm-client"] }],
    );

    expect(audit.violations).toEqual([{
      path: "app/api/ai-search/route.ts",
      providerSignals: ["provider-adapter-wiring"],
    }]);
  });

  it("detects direct provider SDK use in non-TypeScript runtime code", () => {
    const audit = auditLlmCallsites(
      [{ path: "docker/worker.py", source: "from openai import OpenAI" }],
      REGISTERED_CALLSITES,
    );

    expect(audit.violations).toEqual([
      { path: "docker/worker.py", providerSignals: ["openai"] },
    ]);
  });

  it("detects a shared LLM invocation regardless of the dependency variable name", () => {
    const audit = auditLlmCallsites(
      [{
        path: "server/new-model-flow.ts",
        source: `
          import type { LlmClient } from "@/server/ai-search/llm/types";
          export async function run(modelClient: LlmClient) {
            return modelClient.run({ messages: [], tools: [], maxOutputTokens: 32 });
          }
        `,
      }],
      REGISTERED_CALLSITES,
    );

    expect(audit.violations).toEqual([
      { path: "server/new-model-flow.ts", providerSignals: ["shared-llm-client"] },
    ]);
  });

  it("detects metered and runtime-factory-derived LLM invocations", () => {
    const audit = auditLlmCallsites(
      [
        {
          path: "server/metered-flow.ts",
          source: `
            import type { MeteredLlmClient } from "@/server/ai-search/llm/types";
            export async function run(client: MeteredLlmClient) {
              return client.run({ messages: [], tools: [], maxOutputTokens: 32 });
            }
          `,
        },
        {
          path: "server/factory-flow.ts",
          source: `
            import { createNjordLlmClient } from "@/server/ai-search/llm/runtime-client";
            const client = createNjordLlmClient(config, budget);
            await client.run({ messages: [], tools: [], maxOutputTokens: 32 });
          `,
        },
      ],
      REGISTERED_CALLSITES,
    );

    expect(audit.violations).toEqual([
      { path: "server/factory-flow.ts", providerSignals: ["shared-llm-client"] },
      { path: "server/metered-flow.ts", providerSignals: ["shared-llm-client"] },
    ]);
  });

  it("keeps every active provider call behind the registered adapter", () => {
    const repositoryRoot = process.cwd();
    const files = collectSourceFiles(repositoryRoot, ".");
    const audit = auditLlmCallsites(files, REGISTERED_CALLSITES);

    expect(audit.violations).toEqual([]);
    expect(audit.unusedRegistrations).toEqual([]);
    expect(audit.detected).toEqual([
      {
        path: "scripts/demo-target-agent.ts",
        providerSignals: ["shared-llm-client"],
      },
      {
        path: "server/ai-search/agent/agent-loop.ts",
        providerSignals: ["shared-llm-client"],
      },
      {
        path: "server/ai-search/classification/dashboard-search-scope-provider.ts",
        providerSignals: ["shared-llm-client"],
      },
      {
        path: "server/ai-search/classification/search-intent-provider.ts",
        providerSignals: ["shared-llm-client"],
      },
      {
        path: "server/ai-search/llm/openai-client.ts",
        providerSignals: ["openai"],
      },
      {
        path: "server/ai-search/llm/runtime-client.ts",
        providerSignals: ["provider-adapter-wiring", "shared-llm-client"],
      },
    ]);
  });
});
