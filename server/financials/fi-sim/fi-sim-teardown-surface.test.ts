import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The blast radius of GL-511, held to a list.
 *
 * The teardown is only cheap while the simulation layer stays a job-side concern. The moment a
 * page or a service imports from `server/financials/fi-sim/`, removing the layer stops being
 * "delete a directory" and becomes an unpicking exercise, and it will be discovered during the
 * teardown rather than here.
 *
 * These lists are the checklist's inventory. Adding to them is allowed; doing it accidentally is
 * not, which is the whole point.
 */

const ROOTS = ["app", "components", "lib", "server", "scripts"] as const;

function sourceFiles(): string[] {
  const found: string[] = [];
  const walk = (relative: string) => {
    for (const entry of readdirSync(path.join(process.cwd(), relative), { withFileTypes: true })) {
      const next = path.join(relative, entry.name);
      if (entry.isDirectory()) {
        walk(next);
        continue;
      }
      if (!/\.tsx?$/.test(entry.name) || /\.(test|spec)\.tsx?$/.test(entry.name)) continue;
      found.push(next.replaceAll("\\", "/"));
    }
  };
  for (const root of ROOTS) walk(root);
  return found.sort();
}

function importersOf(marker: string) {
  return sourceFiles()
    .filter((file) => !file.startsWith("server/financials/fi-sim/"))
    .filter((file) => readFileSync(path.join(process.cwd(), file), "utf8").includes(marker))
    .sort();
}

describe("GL-511 teardown surface", () => {
  it("keeps the FI-SIM layer reachable only from its own jobs", () => {
    // Nothing the product serves a request from may reach into the simulation layer. Every read
    // goes through the live views and FinancialsRepository instead, which is what lets the layer
    // be deleted without touching a single runtime path.
    expect(importersOf("fi-sim/")).toEqual([
      "scripts/generate-fi-sim-dataset.ts",
      "scripts/manage-fi-sim-activation.ts",
      "scripts/map-fi-sim-dataset.ts",
      "scripts/rehearse-gl-511-teardown.ts",
      "scripts/verify-fi-sim-foundation.ts",
    ]);
  });

  it("keeps the disclosure surface listed, because that is what teardown edits", () => {
    // The disclosure module survives teardown harmlessly — with no simulated dataset it always
    // reports `simulated: false` and a null notice, so the banner and the line marker simply stop
    // rendering. These are the files to revisit when the wording is removed for good.
    expect(importersOf("financial-simulation-disclosure")).toEqual([
      "components/company/financial-time-series-table.tsx",
      "components/company/key-figures-table.tsx",
      "components/company/overview-analytics.tsx",
      "components/company/overview/overview-charts.tsx",
      "components/company/simulated-financials-notice.tsx",
      "components/dashboard/oversikt-dashboard.tsx",
      "components/watchlist/watchlist-view.tsx",
      "lib/types.ts",
      "server/ai-search/tools/build-mna-pro-forma.ts",
      "server/ai-search/tools/estimate-group-financials.ts",
      "server/financials/njord-financial-data-reader.ts",
      "server/financials/raw-financials-reader.ts",
      "server/services/company-service.ts",
      "server/services/dd-financial-evidence-reader.ts",
      "server/services/oversikt-dashboard-service.ts",
      "server/services/public-financials-service.ts",
      "server/services/watchlist-financials-service.ts",
    ]);
  });

  it("keeps the simulation Prisma models out of runtime code", () => {
    // The tables are dropped by the teardown, so a runtime query against one would fail at the
    // first request after go-live rather than in a test.
    const models = [
      "simulatedFinancialDataset",
      "simulatedFinancialStatement",
      "simulatedFinancialLine",
      "simulatedMetricAlias",
      "activeFinancialDataset",
      "financialDatasetActivationAudit",
    ];
    const offenders = sourceFiles()
      .filter((file) => !file.startsWith("server/financials/fi-sim/"))
      .filter((file) => !file.startsWith("scripts/"))
      .filter((file) => {
        const source = readFileSync(path.join(process.cwd(), file), "utf8");
        return models.some((model) => source.includes(`prisma.${model}.`));
      });

    // mapping-store.ts is the one exception and is deliberate: mapping writes have to reach a
    // table because a view is not writable, and it resolves which table from the active dataset.
    expect(offenders).toEqual(["server/financials/mapping/mapping-store.ts"]);
  });

  it("loads live lines for every company surface that displays per-value provenance", () => {
    const companyPage = readFileSync(
      path.join(process.cwd(), "app/(app)/companies/[slug]/page.tsx"),
      "utf8",
    );

    expect(companyPage).toContain('["oversikt", "regnskap", "nokkeltall"].includes(parsedTab)');
    expect(companyPage).toContain('financialsMode: ["oversikt", "regnskap", "nokkeltall"]');
  });
});
