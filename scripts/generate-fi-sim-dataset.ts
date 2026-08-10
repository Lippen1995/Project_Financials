import "@/lib/env";

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { prisma } from "@/lib/prisma";
import {
  buildDatasetReport,
  formatDatasetReportMarkdown,
  isPublishable,
} from "@/server/financials/fi-sim/generator/dataset-report";
import {
  loadReportedAnchors,
  type FiSimCompanyAnchors,
} from "@/server/financials/fi-sim/generator/anchor-binding";
import {
  writeSimulatedDataset,
  type FiSimDatasetManifest,
} from "@/server/financials/fi-sim/generator/dataset-store";
import {
  FI_SIM_MAX_FISCAL_YEARS,
  generateCompanyFinancials,
  type FiSimCompanyGeneration,
} from "@/server/financials/fi-sim/generator/generator";
import { isInvestorDemoFinancialSimulationEnabled } from "@/server/financials/financials-repository";

/**
 * The explicit background job that builds an FI-SIM dataset, from spec section 9.2.
 *
 * Generation is a job and never a request path. It reads reported anchors through the live
 * repository, generates, writes the dataset as BUILDING, validates and moves it to VALIDATED. It
 * does not activate anything: the pointer switch is F8's controlled command, and a dataset sitting
 * validated and unreferenced changes nothing that any user can see.
 */

type Options = {
  datasetVersion: string;
  createdByUserId: string;
  orgNumbers: string[] | null;
  limit: number;
  years: number;
  latestCompletedFiscalYear: number;
  statementScope: "COMPANY" | "CONSOLIDATED" | "BOTH";
  unmappedConcepts: string[];
  /** Generate and report without writing. A validated dataset can never be deleted. */
  dryRun: boolean;
  reportPath: string | null;
};

function parseOptions(argv: string[]): Options {
  const now = new Date();
  const options: Options = {
    datasetVersion: `fi-sim-${now.toISOString().slice(0, 19).replaceAll(/[:-]/g, "")}`,
    createdByUserId: "fi-sim-generator",
    orgNumbers: null,
    limit: 50,
    years: FI_SIM_MAX_FISCAL_YEARS,
    // The newest fiscal year that has closed. Overridable so a run is reproducible next January.
    latestCompletedFiscalYear: now.getUTCFullYear() - 1,
    statementScope: "COMPANY",
    unmappedConcepts: [],
    dryRun: false,
    reportPath: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];
    const requireValue = () => {
      if (!value || value.startsWith("--")) throw new Error(`${argument} krever en verdi.`);
      index += 1;
      return value;
    };

    if (argument === "--dataset-version") options.datasetVersion = requireValue();
    else if (argument === "--created-by") options.createdByUserId = requireValue();
    else if (argument === "--org-numbers") {
      options.orgNumbers = requireValue().split(",").map((entry) => entry.trim()).filter(Boolean);
    } else if (argument === "--limit") options.limit = Number.parseInt(requireValue(), 10);
    else if (argument === "--years") options.years = Number.parseInt(requireValue(), 10);
    else if (argument === "--latest-fiscal-year") {
      options.latestCompletedFiscalYear = Number.parseInt(requireValue(), 10);
    } else if (argument === "--scope") {
      const scope = requireValue();
      if (scope !== "COMPANY" && scope !== "CONSOLIDATED" && scope !== "BOTH") {
        throw new Error("--scope må være COMPANY, CONSOLIDATED eller BOTH.");
      }
      options.statementScope = scope;
    } else if (argument === "--unmapped-concepts") {
      options.unmappedConcepts = requireValue().split(",").map((entry) => entry.trim()).filter(Boolean);
    } else if (argument === "--dry-run") {
      options.dryRun = true;
    } else if (argument === "--report") {
      options.reportPath = requireValue();
    } else {
      throw new Error(`Ukjent argument: ${argument}`);
    }
  }

  if (!Number.isInteger(options.years) || options.years < 1 || options.years > FI_SIM_MAX_FISCAL_YEARS) {
    throw new Error(`--years må være mellom 1 og ${FI_SIM_MAX_FISCAL_YEARS}.`);
  }
  if (!Number.isInteger(options.limit) || options.limit < 1) {
    throw new Error("--limit må være et positivt heltall.");
  }
  return options;
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (isInvestorDemoFinancialSimulationEnabled()) {
    // With the demo flag on, the live repository may resolve to a previously activated dataset,
    // and the anchors would then be a previous demo's synthetic figures.
    throw new Error(
      "Kjør generatoren med FJORD_FINANCIAL_SIMULATION_ENABLED av, slik at ankere leses fra rapporterte tall.",
    );
  }

  const companies = await prisma.company.findMany({
    where: options.orgNumbers ? { orgNumber: { in: options.orgNumbers } } : {},
    orderBy: { orgNumber: "asc" },
    take: options.orgNumbers ? options.orgNumbers.length : options.limit,
    select: { id: true, orgNumber: true, name: true },
  });
  if (companies.length === 0) {
    throw new Error("Fant ingen selskaper å generere for.");
  }

  const registryEntities = await prisma.registryEntity.findMany({
    where: { orgNumber: { in: companies.map((company) => company.orgNumber) } },
    select: {
      orgNumber: true,
      naceCode: true,
      organisationForm: true,
      registeredAt: true,
    },
  });
  const registryByOrgNumber = new Map(
    registryEntities.map((entity) => [entity.orgNumber, entity]),
  );

  const fiscalYears = Array.from(
    { length: options.years },
    (_, offset) => options.latestCompletedFiscalYear - offset,
  );
  const requestedScopes: Array<"COMPANY" | "CONSOLIDATED"> = options.statementScope === "BOTH"
    ? ["COMPANY", "CONSOLIDATED"]
    : [options.statementScope];
  const anchorSnapshots = await Promise.all(
    requestedScopes.map(async (statementScope) => ({
      statementScope,
      snapshot: await loadReportedAnchors({
        companyIds: companies.map((company) => company.id),
        fiscalYears,
        statementScope,
      }),
    })),
  );
  const reportedDatasetVersions = new Set(
    anchorSnapshots.map(({ snapshot }) => snapshot.financialDatasetVersion),
  );
  if (reportedDatasetVersions.size !== 1) {
    throw new Error(
      "Rapportert datasett endret seg mellom scope-lesingene; ingen blandet simulering ble bygget.",
    );
  }
  const reportedDatasetVersion = anchorSnapshots[0].snapshot.financialDatasetVersion;
  const anchorsByScope = new Map(
    anchorSnapshots.map(({ statementScope, snapshot }) => [statementScope, snapshot]),
  );

  const generations: FiSimCompanyGeneration[] = companies.flatMap((company) => {
    const registry = registryByOrgNumber.get(company.orgNumber);
    return requestedScopes.flatMap((statementScope) => {
      const companyAnchors: FiSimCompanyAnchors | undefined = anchorsByScope
        .get(statementScope)
        ?.companies.get(company.id);
      if (
        options.statementScope === "BOTH" &&
        statementScope === "CONSOLIDATED" &&
        (companyAnchors?.reportedFiscalYears.length ?? 0) === 0
      ) {
        // A group statement is generated only when the reported live dataset proves that the
        // company has filed one. COMPANY remains the universal legal-entity scope.
        return [];
      }
      return [generateCompanyFinancials({
        companyId: company.id,
        orgNumber: company.orgNumber,
        registeredAt: registry?.registeredAt ?? null,
        reportedFiscalYears: companyAnchors?.reportedFiscalYears ?? [],
        reportedHeadlineByFiscalYear: companyAnchors?.reportedHeadlineByFiscalYear ?? {},
        signals: {
          industryCode: registry?.naceCode ?? null,
          organisationForm: registry?.organisationForm ?? null,
        },
        fiscalYears,
        latestCompletedFiscalYear: options.latestCompletedFiscalYear,
        statementScope,
        currency: "NOK",
        unitScale: 1,
        anchorsByFiscalYear: companyAnchors?.anchorsByFiscalYear ?? {},
      })];
    });
  });

  // A real build reports the exact publishable subset written by dataset-store. Dry runs retain
  // all generated candidates so a go/no-go review can see what would be excluded before writing.
  const summary = buildDatasetReport(generations, { publishableOnly: !options.dryRun });
  const writeValidationReport = async () => {
    if (!options.reportPath) return;
    const markdown = formatDatasetReportMarkdown(summary, {
      datasetVersion: options.datasetVersion,
      statementScope: options.statementScope,
      latestCompletedFiscalYear: options.latestCompletedFiscalYear,
      reportedDatasetVersion,
      dryRun: options.dryRun,
      generatedAt: new Date(),
    });
    await mkdir(dirname(resolve(options.reportPath)), { recursive: true });
    await writeFile(resolve(options.reportPath), markdown, "utf8");
    console.log(`Valideringsrapport skrevet til ${options.reportPath}.`);
  };
  console.log(
    [
      `Selskaper forsøkt: ${summary.companiesAttempted}. Med perioder: ${summary.companiesWithPackages}. Uten: ${summary.companiesFullyExcluded}.`,
      `Perioder: ${summary.packages}. Ankerlinjer: ${summary.reportedAnchorLines}. Syntetiske linjer: ${summary.syntheticLines}.`,
      `Profilfordeling: ${JSON.stringify(summary.profileCounts)}.`,
      `Scopefordeling: ${JSON.stringify(summary.scopeCounts)}.`,
      `Residualer: ${summary.residuals.rounding} avrunding, ${summary.residuals.review} til manuell kontroll.`,
      `Feil: ${JSON.stringify(summary.errorCounts)}.`,
    ].join("\n"),
  );

  if (summary.invalidPackages.length > 0) {
    console.error(
      `${summary.invalidPackages.length} perioder består ikke validering og ville blitt utelatt. Se rapporten.`,
    );
  }

  if (options.dryRun) {
    await writeValidationReport();
    console.log("Tørrkjøring: ingenting er skrevet. Kjør uten --dry-run for å bygge datasettet.");
    return;
  }
  if (!isPublishable(summary)) {
    throw new Error(
      "Ingen periode kan publiseres. Datasettet ble ikke opprettet.",
    );
  }

  const manifest: Omit<FiSimDatasetManifest, "exclusions"> = {
    reportedDatasetVersion,
    statementScope: options.statementScope,
    latestCompletedFiscalYear: options.latestCompletedFiscalYear,
    intentionallyUnmappedConcepts: options.unmappedConcepts,
  };

  const report = await writeSimulatedDataset({
    datasetVersion: options.datasetVersion,
    createdByUserId: options.createdByUserId,
    manifest,
    generations,
  });

  if (
    report.status !== "VALIDATED" ||
    report.companyCount !== summary.companiesWithPackages ||
    report.packageCount !== summary.packages ||
    report.statementCount !== summary.statements ||
    report.anchoredLineCount !== summary.reportedAnchorLines ||
    report.syntheticLineCount !== summary.syntheticLines
  ) {
    throw new Error(
      "Persisted FI-SIM dataset does not match the validation summary; report was not written.",
    );
  }
  await writeValidationReport();

  console.log(
    [
      `Dataset ${report.datasetVersion} (${report.datasetId}) er ${report.status}.`,
      `Selskaper: ${report.companyCount}. Perioder: ${report.packageCount}. Statements: ${report.statementCount}.`,
      `Linjer: ${report.syntheticLineCount} syntetiske, ${report.anchoredLineCount} rapporterte ankere.`,
      `Profilfordeling: ${JSON.stringify(report.profileCounts)}.`,
      `Utelatt: ${report.exclusions.length}.`,
    ].join("\n"),
  );
  for (const exclusion of report.exclusions.slice(0, 20)) {
    console.log(
      `  ${exclusion.orgNumber} ${exclusion.statementScope} ${exclusion.fiscalYear ?? "-"} ${exclusion.code}: ${exclusion.reason}`,
    );
  }
  if (report.exclusions.length > 20) {
    console.log(`  … og ${report.exclusions.length - 20} til. Hele listen ligger i manifestet.`);
  }
  if (report.issues.length > 0) {
    console.error(`${report.issues.length} valideringsavvik ble avvist før skriving.`);
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
