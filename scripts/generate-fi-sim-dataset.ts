import "@/lib/env";

import { prisma } from "@/lib/prisma";
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
  statementScope: "COMPANY" | "CONSOLIDATED";
  unmappedConcepts: string[];
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
      if (scope !== "COMPANY" && scope !== "CONSOLIDATED") {
        throw new Error("--scope må være COMPANY eller CONSOLIDATED.");
      }
      options.statementScope = scope;
    } else if (argument === "--unmapped-concepts") {
      options.unmappedConcepts = requireValue().split(",").map((entry) => entry.trim()).filter(Boolean);
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
  const anchors = await loadReportedAnchors({
    companyIds: companies.map((company) => company.id),
    fiscalYears,
    statementScope: options.statementScope,
  });

  const generations: FiSimCompanyGeneration[] = companies.map((company) => {
    const registry = registryByOrgNumber.get(company.orgNumber);
    const companyAnchors: FiSimCompanyAnchors | undefined = anchors.companies.get(company.id);
    return generateCompanyFinancials({
      companyId: company.id,
      orgNumber: company.orgNumber,
      registeredAt: registry?.registeredAt ?? null,
      signals: {
        industryCode: registry?.naceCode ?? null,
        organisationForm: registry?.organisationForm ?? null,
      },
      fiscalYears,
      latestCompletedFiscalYear: options.latestCompletedFiscalYear,
      statementScope: options.statementScope,
      currency: "NOK",
      unitScale: 1,
      anchorsByFiscalYear: companyAnchors?.anchorsByFiscalYear ?? {},
    });
  });

  const manifest: Omit<FiSimDatasetManifest, "exclusions"> = {
    reportedDatasetVersion: anchors.financialDatasetVersion,
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
    console.log(`  ${exclusion.orgNumber} ${exclusion.fiscalYear ?? "-"} ${exclusion.code}: ${exclusion.reason}`);
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
