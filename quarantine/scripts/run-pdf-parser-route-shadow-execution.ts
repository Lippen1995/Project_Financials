/**
 * CLI: run shadow parser route execution for a specific annual report filing.
 *
 * Reads the PDF from artifact storage and runs it through the requested shadow
 * routes. Results are persisted as a PARSER_ROUTE_SHADOW_EXECUTION artifact.
 * Production routing, extracted facts, and publish gate are NOT affected.
 *
 * Usage:
 *   npm run run:pdf-parser-route-shadow -- \
 *     --annual-report-id=<id> \
 *     --routes=OCR,OPENDATALOADER_LOCAL,HYBRID \
 *     [--reason=manual-sampling] \
 *     [--source=CLI] \
 *     [--run-id=batch-001] \
 *     [--json]
 *
 * Env gates (all default to disabled/dry-run):
 *   PDF_OCR_SHADOW_ENABLED=true   — enable Tesseract OCR shadow execution
 *   PDF_ODL_SHADOW_ENABLED=true   — enable OpenDataLoader local shadow execution
 *
 * Examples:
 *
 *   # Dry-run (all gates off) — verifies pipeline wiring, persists RUNTIME_UNAVAILABLE result:
 *   npm run run:pdf-parser-route-shadow -- \
 *     --annual-report-id=clxxxx --routes=OCR,OPENDATALOADER_LOCAL --reason=dry-run
 *
 *   # OCR shadow run (Tesseract must be installed):
 *   PDF_OCR_SHADOW_ENABLED=true npm run run:pdf-parser-route-shadow -- \
 *     --annual-report-id=clxxxx --routes=OCR --reason=sampling
 *
 *   # ODL shadow run (Java 11+ and @opendataloader/pdf must be available):
 *   PDF_ODL_SHADOW_ENABLED=true npm run run:pdf-parser-route-shadow -- \
 *     --annual-report-id=clxxxx --routes=OPENDATALOADER_LOCAL --reason=sampling
 *
 *   # Hybrid shadow run (combines OCR + ODL signals):
 *   PDF_OCR_SHADOW_ENABLED=true PDF_ODL_SHADOW_ENABLED=true \
 *   npm run run:pdf-parser-route-shadow -- \
 *     --annual-report-id=clxxxx --routes=HYBRID --reason=hybrid-sampling
 *
 *   # JSON output for piping to quality comparison report:
 *   PDF_OCR_SHADOW_ENABLED=true npm run run:pdf-parser-route-shadow -- \
 *     --annual-report-id=clxxxx --routes=OCR --json
 *
 * Exit codes:
 *   0  — success (including RUNTIME_UNAVAILABLE routes — those are valid results)
 *   1  — invalid input or persistence failure
 */

import { LocalAnnualReportArtifactStorage } from "@/server/financials/artifact-storage";
import {
  isValidShadowRoute,
  runPdfParserRouteShadowExecution,
  VALID_SHADOW_ROUTES,
} from "@/server/services/pdf-parser-route-shadow-execution-service";

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function readOption(prefix: string): string | undefined {
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("run-pdf-parser-route-shadow-execution requires DATABASE_URL.");
  }

  const annualReportId = readOption("--annual-report-id=");
  if (!annualReportId) {
    throw new Error("--annual-report-id=<id> is required.");
  }

  const routesRaw = readOption("--routes=");
  if (!routesRaw) {
    throw new Error(
      `--routes=<routes> is required. Valid values: ${VALID_SHADOW_ROUTES.join(", ")}.`,
    );
  }

  const requestedRoutes = routesRaw
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);

  if (requestedRoutes.length === 0) {
    throw new Error("--routes must specify at least one route.");
  }

  for (const route of requestedRoutes) {
    if (!isValidShadowRoute(route)) {
      throw new Error(
        `Invalid route: "${route}". Valid routes: ${VALID_SHADOW_ROUTES.join(", ")}.`,
      );
    }
  }

  const reason = readOption("--reason=") ?? "manual-sampling";
  const source = readOption("--source=") ?? "CLI";
  const runId = readOption("--run-id=") ?? undefined;
  const json = hasFlag("--json");

  // Wire artifact storage for PDF buffer reading (required for real OCR/ODL execution).
  const artifactStorage = new LocalAnnualReportArtifactStorage();

  const result = await runPdfParserRouteShadowExecution(
    {
      annualReportId,
      requestedRoutes: requestedRoutes as never,
      reason,
      source,
      runId,
    },
    {
      readPdfBuffer: async (storageKey) => {
        try {
          return await artifactStorage.getArtifactBuffer(storageKey);
        } catch {
          return null;
        }
      },
    },
  );

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`Shadow execution complete.`);
  console.log(`  Artifact ID : ${result.artifactId}`);
  console.log(`  Filing      : ${result.filingId}  (org ${result.orgNumber}, year ${result.fiscalYear})`);
  console.log(`  Routes:`);
  for (const r of result.routeResults) {
    console.log(`    ${r.route.padEnd(24)} ${r.status}  (${r.durationMs}ms)`);
  }
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
