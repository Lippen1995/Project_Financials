import type { FinancialSimulationProfile } from "@prisma/client";

import { FI_SIM_ASSUMPTION_VERSION } from "./assumptions";
import {
  FI_SIM_GENERATOR_VERSION,
  type FiSimCompanyGeneration,
  type FiSimGeneratedPackage,
} from "./generator";
import { FI_SIM_TAXONOMY_VERSION } from "../catalog/concepts";
import { FI_SIM_PROFILE_RULESET_VERSION } from "../catalog/profile-selection";
import { validatePackage } from "./validator";

/**
 * The validation report from F10.
 *
 * It is computed from the generator's output rather than from the database, so it can be produced
 * without writing anything. A report you can only get by first creating an immutable dataset is a
 * report nobody runs before deciding whether to create one.
 *
 * Everything it counts is something the go/no-go decision turns on: how many companies the demo
 * would actually cover, which profiles they landed in, how much of each statement rests on real
 * reported figures, and every difference the generator could not solve away.
 */

export type FiSimDatasetReportSummary = {
  taxonomyVersion: string;
  generatorVersion: string;
  assumptionVersion: string;
  profileVersion: string;
  companiesAttempted: number;
  companiesWithPackages: number;
  companiesFullyExcluded: number;
  packages: number;
  statements: number;
  reportedAnchorLines: number;
  syntheticLines: number;
  hybridStatements: number;
  simulatedStatements: number;
  profileCounts: Record<string, number>;
  /** Which concepts were bound to a reported line, and how often. */
  anchoredConceptCounts: Record<string, number>;
  residuals: {
    rounding: number;
    review: number;
    largestAbsolute: bigint | null;
    byIdentity: Record<string, number>;
  };
  errorCounts: Record<string, number>;
  skippedYearCounts: number;
  fiscalYearCounts: Record<number, number>;
  /** Companies the demo cannot support, listed rather than silently missing. */
  unsupportedCompanies: Array<{ orgNumber: string; code: string; reason: string }>;
  /** Packages the generator produced but the validator rejected. Must be zero to publish. */
  invalidPackages: Array<{ orgNumber: string; fiscalYear: number; issues: string[] }>;
  manualReviewPackages: Array<{ orgNumber: string; fiscalYear: number; amount: string }>;
};

function countInto(counts: Record<string, number>, key: string) {
  counts[key] = (counts[key] ?? 0) + 1;
}

function absolute(value: bigint) {
  return value < 0n ? -value : value;
}

export function buildDatasetReport(
  generations: readonly FiSimCompanyGeneration[],
): FiSimDatasetReportSummary {
  const summary: FiSimDatasetReportSummary = {
    taxonomyVersion: FI_SIM_TAXONOMY_VERSION,
    generatorVersion: FI_SIM_GENERATOR_VERSION,
    assumptionVersion: FI_SIM_ASSUMPTION_VERSION,
    profileVersion: FI_SIM_PROFILE_RULESET_VERSION,
    companiesAttempted: generations.length,
    companiesWithPackages: 0,
    companiesFullyExcluded: 0,
    packages: 0,
    statements: 0,
    reportedAnchorLines: 0,
    syntheticLines: 0,
    hybridStatements: 0,
    simulatedStatements: 0,
    profileCounts: {},
    anchoredConceptCounts: {},
    residuals: { rounding: 0, review: 0, largestAbsolute: null, byIdentity: {} },
    errorCounts: {},
    skippedYearCounts: 0,
    fiscalYearCounts: {},
    unsupportedCompanies: [],
    invalidPackages: [],
    manualReviewPackages: [],
  };

  for (const generation of generations) {
    summary.skippedYearCounts += generation.skipped.length;
    for (const failure of generation.failures) {
      countInto(summary.errorCounts, failure.code);
      if (failure.code === "UNSUPPORTED_SIMULATION_PROFILE" || generation.packages.length === 0) {
        summary.unsupportedCompanies.push({
          orgNumber: generation.orgNumber,
          code: failure.code,
          reason: failure.message,
        });
      }
    }
    if (generation.packages.length === 0) {
      summary.companiesFullyExcluded += 1;
      // The port is that every company is either validated or explicitly listed as unsupported.
      // A company that produced nothing and failed nothing — every year skipped — would otherwise
      // just be quietly missing from the demo.
      if (generation.failures.length === 0) {
        summary.unsupportedCompanies.push({
          orgNumber: generation.orgNumber,
          code: "NO_PUBLISHABLE_PERIOD",
          reason:
            generation.skipped[0]?.reason ?? "No fiscal year in the requested span could be generated",
        });
      }
      continue;
    }
    summary.companiesWithPackages += 1;

    for (const pkg of generation.packages) {
      summary.packages += 1;
      summary.statements += 2;
      countInto(summary.profileCounts, pkg.profile satisfies FinancialSimulationProfile);
      summary.fiscalYearCounts[pkg.fiscalYear] =
        (summary.fiscalYearCounts[pkg.fiscalYear] ?? 0) + 1;

      for (const statement of [pkg.income, pkg.balance]) {
        if (statement.statementOrigin === "HYBRID") summary.hybridStatements += 1;
        else summary.simulatedStatements += 1;
        for (const line of statement.lines) {
          if (line.reportedFinancialLineItemId !== null) {
            summary.reportedAnchorLines += 1;
            countInto(summary.anchoredConceptCounts, line.conceptKey);
          } else {
            summary.syntheticLines += 1;
          }
        }
        for (const residual of statement.residuals) {
          if (residual.severity === "ROUNDING") summary.residuals.rounding += 1;
          else summary.residuals.review += 1;
          countInto(summary.residuals.byIdentity, residual.identityId);
          const magnitude = absolute(residual.amount);
          if (
            summary.residuals.largestAbsolute === null ||
            magnitude > summary.residuals.largestAbsolute
          ) {
            summary.residuals.largestAbsolute = magnitude;
          }
        }
      }

      const validation = validatePackage(pkg);
      if (!validation.valid) {
        summary.invalidPackages.push({
          orgNumber: pkg.orgNumber,
          fiscalYear: pkg.fiscalYear,
          issues: validation.issues.map((issue) => issue.message),
        });
      }
      if (pkg.validationStatus === "MANUAL_REVIEW") {
        summary.manualReviewPackages.push({
          orgNumber: pkg.orgNumber,
          fiscalYear: pkg.fiscalYear,
          amount: (pkg.residualAmount ?? 0n).toString(),
        });
      }
    }
  }

  return summary;
}

function table(rows: Array<[string, string | number]>) {
  return ["| | |", "|---|---|", ...rows.map(([key, value]) => `| ${key} | ${value} |`)].join("\n");
}

function countTable(header: string, counts: Record<string, number>, limit = 40) {
  const entries = Object.entries(counts).sort(([, left], [, right]) => right - left);
  if (entries.length === 0) return `_Ingen._`;
  return [
    `| ${header} | Antall |`,
    "|---|---|",
    ...entries.slice(0, limit).map(([key, value]) => `| ${key} | ${value} |`),
    ...(entries.length > limit ? [`| … og ${entries.length - limit} til | |`] : []),
  ].join("\n");
}

export function formatDatasetReportMarkdown(
  summary: FiSimDatasetReportSummary,
  context: {
    datasetVersion: string;
    statementScope: string;
    latestCompletedFiscalYear: number;
    reportedDatasetVersion: string;
    dryRun: boolean;
    generatedAt: Date;
  },
) {
  const anchorShare = summary.reportedAnchorLines + summary.syntheticLines === 0
    ? 0
    : (summary.reportedAnchorLines / (summary.reportedAnchorLines + summary.syntheticLines)) * 100;

  return [
    `# FI-SIM valideringsrapport: ${context.datasetVersion}`,
    "",
    context.dryRun
      ? "**Tørrkjøring.** Ingenting er skrevet til databasen."
      : "Datasettet er skrevet og validert.",
    "",
    table([
      ["Kjørt", context.generatedAt.toISOString()],
      ["Taksonomi", summary.taxonomyVersion],
      ["Generator", summary.generatorVersion],
      ["Antakelser", summary.assumptionVersion],
      ["Profilregler", summary.profileVersion],
      ["Rapportert datasett ankrene er frosset fra", context.reportedDatasetVersion],
      ["Scope", context.statementScope],
      ["Siste fullførte regnskapsår", context.latestCompletedFiscalYear],
    ]),
    "",
    "## Dekning",
    "",
    table([
      ["Selskaper forsøkt", summary.companiesAttempted],
      ["Selskaper med minst én periode", summary.companiesWithPackages],
      ["Selskaper uten noen periode", summary.companiesFullyExcluded],
      ["Perioder", summary.packages],
      ["Statements", summary.statements],
      ["– hybride", summary.hybridStatements],
      ["– helt simulerte", summary.simulatedStatements],
      ["Rapporterte ankerlinjer", summary.reportedAnchorLines],
      ["Syntetiske linjer", summary.syntheticLines],
      ["Andel linjer som er rapporterte ankere", `${anchorShare.toFixed(1)} %`],
      ["År hoppet over (før stiftelse eller ikke avsluttet)", summary.skippedYearCounts],
    ]),
    "",
    "## Profilfordeling",
    "",
    countTable("Profil", summary.profileCounts),
    "",
    "## Ankertyper",
    "",
    "Hvilke konsepter som ble bundet til en rapportert linje, og hvor ofte.",
    "",
    countTable("Konsept", summary.anchoredConceptCounts),
    "",
    "## Residualer",
    "",
    table([
      ["Avrundingsdifferanser", summary.residuals.rounding],
      ["Ufordelte differanser til manuell kontroll", summary.residuals.review],
      [
        "Største absolutte residual",
        summary.residuals.largestAbsolute === null
          ? "—"
          : summary.residuals.largestAbsolute.toString(),
      ],
    ]),
    "",
    Object.keys(summary.residuals.byIdentity).length > 0
      ? countTable("Identitet", summary.residuals.byIdentity)
      : "_Ingen identitet trengte residualbehandling._",
    "",
    "## Mappinggrad",
    "",
    "Alle genererte linjer skrives med `metricKey = null`, jf. spec seksjon 11. Mapping kjøres som et eget, dataset-avgrenset overlay etter aktivering, og måles derfor ikke her.",
    "",
    "## Feil",
    "",
    countTable("Feilkode", summary.errorCounts),
    "",
    "## Selskaper som ikke støttes",
    "",
    summary.unsupportedCompanies.length === 0
      ? "_Ingen._"
      : [
          "| Orgnr | Kode | Årsak |",
          "|---|---|---|",
          ...summary.unsupportedCompanies
            .slice(0, 100)
            .map((entry) => `| ${entry.orgNumber} | ${entry.code} | ${entry.reason} |`),
          ...(summary.unsupportedCompanies.length > 100
            ? [`| … og ${summary.unsupportedCompanies.length - 100} til | | |`]
            : []),
        ].join("\n"),
    "",
    "## Perioder som ikke kan publiseres",
    "",
    summary.invalidPackages.length === 0
      ? "_Ingen. Alle perioder består validering._"
      : [
          "| Orgnr | År | Avvik |",
          "|---|---|---|",
          ...summary.invalidPackages
            .slice(0, 50)
            .map((entry) => `| ${entry.orgNumber} | ${entry.fiscalYear} | ${entry.issues.join("; ")} |`),
        ].join("\n"),
    "",
    "## Perioder som venter på manuell kontroll",
    "",
    summary.manualReviewPackages.length === 0
      ? "_Ingen._"
      : [
          "| Orgnr | År | Residual |",
          "|---|---|---|",
          ...summary.manualReviewPackages
            .slice(0, 50)
            .map((entry) => `| ${entry.orgNumber} | ${entry.fiscalYear} | ${entry.amount} |`),
        ].join("\n"),
    "",
  ].join("\n");
}

export function isPublishable(summary: FiSimDatasetReportSummary) {
  return summary.invalidPackages.length === 0 && summary.packages > 0;
}

export function packageOrgNumbers(packages: readonly FiSimGeneratedPackage[]) {
  return [...new Set(packages.map((pkg) => pkg.orgNumber))];
}
