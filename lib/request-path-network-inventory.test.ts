import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { REQUEST_PATH_NETWORK_INVENTORY } from "@/lib/request-path-network-inventory";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

function sourceFiles(directory: string): string[] {
  return readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const relative = path.posix.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(relative);
    if (!/\.tsx?$/.test(entry.name) || /\.(?:test|spec)\.tsx?$/.test(entry.name)) return [];
    return [relative];
  });
}

const ACTIVE_SOURCE_ROOTS = ["app", "components", "config", "lib", "server"];
const ACTIVE_ROOT_SOURCE_FILES = ["middleware.ts", "instrumentation.ts", "next.config.ts"]
  .filter((file) => existsSync(path.join(root, file)));
const NETWORK_SIGNALS: Array<[string, RegExp]> = [
  ["external fetch", /\bfetch\s*\(\s*["'`]https?:\/\//],
  ["source provider import", /import\s+(?!type\b)[^;]+from\s+["']@\/integrations\//],
  ["OpenAI client", /(?:new\s+OpenAiLlmClient|api\.openai\.com)/],
];

// These modules are population/provider infrastructure, never request readers.
// The scan discovers the rest of the source tree, so a new signal-bearing file
// fails until it is deliberately classified here and in the inventory.
const BACKGROUND_NETWORK_FILES = new Set([
  "server/ai-search/llm/openai-client.ts",
  "server/importers/annual-report-importer.ts",
  "server/insider-transactions/newsweb-insider-sync-service.ts",
  "server/news/news-source-registry.ts",
  "server/news/newsweb-issuer-registry.ts",
  "server/news/source-adapters/brreg-announcement-source-adapter.ts",
  "server/news/source-adapters/html-list-source-adapter.ts",
  "server/news/source-adapters/newsweb-source-adapter.ts",
  "server/news/source-adapters/rss-source-adapter.ts",
  "server/news/source-adapters/search-rss-source-adapter.ts",
  "server/services/petroleum-market-macro-service.ts",
  "server/services/petroleum-market-service.ts",
  "server/services/ssb-classification-sync-service.ts",
  "server/services/structured-financials-service.ts",
  "server/shareholdings/shareholding-importer.ts",
  "server/shareholdings/shareholding-resolution.ts",
]);

const MIXED_NETWORK_FILES = new Set([
  "app/api/ai-search/route.ts",
  "server/services/distress-analysis-service.ts",
  "server/services/news-aggregator-service.ts",
]);

function expectNoMatch(file: string, patterns: RegExp[]) {
  const source = read(file);
  for (const pattern of patterns) expect(source, `${file} matched ${pattern}`).not.toMatch(pattern);
}

function functionBody(file: string, functionName: string) {
  const source = read(file);
  const start = source.indexOf(`function ${functionName}`);
  expect(start, `${functionName} must exist in ${file}`).toBeGreaterThanOrEqual(0);
  const next = source.indexOf("\nexport ", start + 1);
  return source.slice(start, next === -1 ? source.length : next);
}

describe("GL-A01 request-path network inventory", () => {
  it("keeps every registered request and population path explicit", () => {
    expect(REQUEST_PATH_NETWORK_INVENTORY).toHaveLength(5);
    for (const entry of REQUEST_PATH_NETWORK_INVENTORY) {
      expect(entry.requestReadPath.length).toBeGreaterThan(0);
      expect(entry.backgroundPopulationPath.length).toBeGreaterThan(0);
      for (const file of [...entry.requestReadPath, ...entry.backgroundPopulationPath]) {
        expect(() => read(file), file).not.toThrow();
      }
    }
  });

  it("prevents provider read-throughs from the known user-facing services", () => {
    const rules: Array<[string, RegExp[]]> = [
      ["server/services/company-service.ts", [/BrregAnnouncementsProvider/, /OpenAiSearchIntentProvider/]],
      ["server/ownership/group-employee-service.ts", [/BrregCompanyProvider/]],
      ["server/shareholdings/shareholding-service.ts", [/SkatteetatenShareholdingProvider/]],
      ["server/services/company-grid-connection-service.ts", [/StatnettGridConnectionProvider/]],
      ["server/ip/ip-data.ts", [/@\/integrations\//]],
      ["server/services/workspace-collaboration-service.ts", [/BrregAnnouncementsProvider/, /BrregCompanyProvider/]],
      ["server/registry/ssb-classification-repository.ts", [/SsbIndustryCodeProvider/, /\bfetch\s*\(/]],
      ["app/api/search/suggestions/route.ts", [/SsbIndustryCodeProvider/]],
    ];
    for (const [file, patterns] of rules) expectNoMatch(file, patterns);
  });

  it("discovers new source/model network signals across the active source tree", () => {
    const files = [...ACTIVE_SOURCE_ROOTS.flatMap(sourceFiles), ...ACTIVE_ROOT_SOURCE_FILES];
    const violations: string[] = [];

    for (const file of files) {
      const source = read(file);
      const matches = NETWORK_SIGNALS
        .filter(([, pattern]) => pattern.test(source))
        .map(([label]) => label);
      if (matches.length === 0) continue;
      if (BACKGROUND_NETWORK_FILES.has(file) || MIXED_NETWORK_FILES.has(file)) continue;
      violations.push(`${file}: ${matches.join(", ")}`);
    }

    expect(violations, "Nye nettverkskall må flyttes til en eksplisitt bakgrunnsmodul").toEqual([]);
  });

  it("discovers every public app entry and keeps direct source/model calls out", () => {
    const entries = sourceFiles("app").filter((file) =>
      /\/(?:page|route)\.tsx?$/.test(file) && !file.startsWith("app/api/internal/"),
    );
    expect(entries.length).toBeGreaterThan(100);

    const violations: string[] = [];
    for (const file of entries) {
      const requestSource = read(file).replace(
        /\/\* GL_A01_BACKGROUND_ONLY_BEGIN \*\/[\s\S]*?\/\* GL_A01_BACKGROUND_ONLY_END \*\//,
        "",
      );
      for (const [label, pattern] of NETWORK_SIGNALS) {
        if (pattern.test(requestSource)) violations.push(`${file}: ${label}`);
      }
    }

    expect(violations, "Offentlige app-entrypoints kan ikke kontakte kilder/modeller direkte").toEqual([]);
  });

  it("keeps mixed background modules database-only in their exported read functions", () => {
    expect(functionBody("server/services/news-aggregator-service.ts", "getCompanyNewsWithRelevance"))
      .not.toMatch(/fetchNewswebCompanyMessages|fetchGoogleNewsSearchFeed|fetchAndParseRssFeed/);
    expect(functionBody("server/news/dashboard-insights-service.ts", "getFallbackCandidates"))
      .not.toMatch(/refreshObxCompanyIds|\bfetch\s*\(/);
    expect(functionBody("server/services/distress-analysis-service.ts", "ensureDistressCoverage"))
      .not.toMatch(/syncDistress|queueDistress/);
  });

  it("keeps the public AI handler free of model execution", () => {
    const source = read("app/api/ai-search/route.ts");
    const requestOnly = source.replace(
      /\/\* GL_A01_BACKGROUND_ONLY_BEGIN \*\/[\s\S]*?\/\* GL_A01_BACKGROUND_ONLY_END \*\//,
      "",
    );
    expect(requestOnly).not.toMatch(/new OpenAiLlmClient|runAgent\s*\(|\.run\s*\(/);
    expect(requestOnly).toMatch(/prisma\.aiSearchJob\.create/);
  });
});
