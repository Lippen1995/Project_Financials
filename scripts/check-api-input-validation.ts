import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { analyzeApiInputRoute } from "../lib/api-input-inventory";

function findRouteFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return findRouteFiles(absolutePath);
    }
    return entry.name === "route.ts" ? [absolutePath] : [];
  });
}

const repositoryRoot = process.cwd();
const apiRoot = path.join(repositoryRoot, "app", "api");
const inventory = findRouteFiles(apiRoot)
  .map((absolutePath) => {
    const route = path.relative(repositoryRoot, absolutePath).replaceAll("\\", "/");
    return analyzeApiInputRoute(route, readFileSync(absolutePath, "utf8"));
  })
  .filter((entry) => entry.mutating);

const violations = inventory.filter((entry) => entry.missingValidation.length > 0);
const surfaceCounts = inventory.reduce(
  (counts, entry) => {
    for (const surface of entry.surfaces) {
      counts[surface] += 1;
    }
    return counts;
  },
  { body: 0, path: 0, query: 0 },
);

if (violations.length > 0) {
  console.error("API input validation inventory failed.");
  for (const violation of violations) {
    console.error(
      `${violation.route}: missing ${violation.missingValidation.join(", ")} validation`,
    );
  }
  process.exit(1);
}

console.log(
  [
    `Checked ${inventory.length} mutating API route files`,
    `${surfaceCounts.body} request-body surfaces`,
    `${surfaceCounts.path} dynamic-path surfaces`,
    `${surfaceCounts.query} query-string surfaces`,
    "no missing validation evidence found.",
  ].join(": "),
);
