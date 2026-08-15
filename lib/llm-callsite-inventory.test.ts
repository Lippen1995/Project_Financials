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
  { path: "app/api/ai-search/route.ts", providerSignals: ["shared-llm-client"] },
  {
    path: "integrations/openai/openai-dashboard-search-scope-provider.ts",
    providerSignals: ["shared-llm-client"],
  },
  {
    path: "integrations/openai/openai-search-intent-provider.ts",
    providerSignals: ["shared-llm-client"],
  },
  {
    path: "server/ai-search/agent/agent-loop.ts",
    providerSignals: ["shared-llm-client"],
  },
  { path: "server/ai-search/llm/openai-client.ts", providerSignals: ["openai"] },
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
      REGISTERED_CALLSITES,
    );

    expect(audit.violations).toEqual([
      { path: "app/api/ai-search/route.ts", providerSignals: ["openai"] },
    ]);
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

  it("keeps every active provider call behind the registered adapter", () => {
    const repositoryRoot = process.cwd();
    const files = collectSourceFiles(repositoryRoot, ".");
    const audit = auditLlmCallsites(files, REGISTERED_CALLSITES);

    expect(audit.violations).toEqual([]);
    expect(audit.unusedRegistrations).toEqual([]);
    expect(audit.detected).toEqual([
      {
        path: "app/api/ai-search/route.ts",
        providerSignals: ["shared-llm-client"],
      },
      {
        path: "integrations/openai/openai-dashboard-search-scope-provider.ts",
        providerSignals: ["shared-llm-client"],
      },
      {
        path: "integrations/openai/openai-search-intent-provider.ts",
        providerSignals: ["shared-llm-client"],
      },
      {
        path: "scripts/demo-target-agent.ts",
        providerSignals: ["shared-llm-client"],
      },
      {
        path: "server/ai-search/agent/agent-loop.ts",
        providerSignals: ["shared-llm-client"],
      },
      {
        path: "server/ai-search/llm/openai-client.ts",
        providerSignals: ["openai"],
      },
    ]);
  });
});
