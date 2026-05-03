import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  evaluatePdfDecisionFixtures,
  type PdfDecisionFixture,
} from "@/integrations/brreg/annual-report-financials/pdf-decision-evaluation";

const fixtureDir = join(
  process.cwd(),
  "test",
  "fixtures",
  "annual-reports",
  "pdf-decision-engine",
);

const fixtures = readdirSync(fixtureDir)
  .filter((filename) => filename.endsWith(".json"))
  .sort()
  .map((filename) =>
    JSON.parse(readFileSync(join(fixtureDir, filename), "utf8")),
  ) as PdfDecisionFixture[];

const summary = evaluatePdfDecisionFixtures(fixtures);
console.log(JSON.stringify(summary, null, 2));
if (summary.failedCount > 0) {
  process.exitCode = 1;
}

