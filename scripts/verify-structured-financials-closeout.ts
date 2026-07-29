import { prisma } from "@/lib/prisma";
import { getPublicCompanyFinancials } from "@/server/services/public-financials-service";
import {
  selectStructuredFinancialCloseoutSample,
  STRUCTURED_FINANCIAL_CLOSEOUT_SAMPLE_PROFILE,
} from "@/server/services/structured-financial-sampling-service";
import { ensureStructuredFinancialsForCompany } from "@/server/services/structured-financials-service";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function hasCompleteProvenance(value: {
  sourceSystem?: string;
  sourceEntityType?: string;
  sourceId?: string;
  fetchedAt?: Date;
  normalizedAt?: Date;
}) {
  return Boolean(
    value.sourceSystem &&
      value.sourceEntityType &&
      value.sourceId &&
      value.fetchedAt &&
      value.normalizedAt,
  );
}

async function main() {
  const candidates = await prisma.company.findMany({
    select: {
      orgNumber: true,
      legalForm: true,
      status: true,
    },
    orderBy: { orgNumber: "asc" },
  });
  const sample = selectStructuredFinancialCloseoutSample(
    candidates.map((company) => ({
      ...company,
      companyStatus: company.status,
    })),
  );
  const sampleOrgNumbers = sample.selected.map((company) => company.orgNumber);
  const states = await prisma.structuredFinancialFetchState.findMany({
    where: { company: { orgNumber: { in: sampleOrgNumbers } } },
    select: {
      status: true,
      nextCheckAt: true,
      company: { select: { orgNumber: true } },
    },
  });

  assert(
    states.length === sample.selected.length,
    "Ikke alle virksomheter i closeout-utvalget har en lagret kildekontroll.",
  );
  const availableState = states.find((state) => state.status === "AVAILABLE");
  const unavailableState = states.find((state) => state.status === "UNAVAILABLE");
  assert(availableState, "Utvalget mangler et tilgjengelig kontrolltilfelle.");
  assert(unavailableState, "Utvalget mangler et utilgjengelig kontrolltilfelle.");
  assert(
    states.every(
      (state) => state.status === "AVAILABLE" || state.status === "UNAVAILABLE",
    ),
    "Utvalget inneholder uløste eller utdaterte kildekontroller.",
  );
  assert(
    states.every((state) => state.nextCheckAt > new Date()),
    "Utvalget inneholder utløpte kildekontroller.",
  );

  const [availableCache, unavailableCache] = await Promise.all([
    ensureStructuredFinancialsForCompany(availableState.company.orgNumber),
    ensureStructuredFinancialsForCompany(unavailableState.company.orgNumber),
  ]);
  assert(availableCache.fromCache, "Tilgjengelig read-through brukte ikke fersk cache.");
  assert(unavailableCache.fromCache, "Utilgjengelig read-through brukte ikke fersk cache.");

  const [availablePublic, unavailablePublic] = await Promise.all([
    getPublicCompanyFinancials(availableState.company.orgNumber),
    getPublicCompanyFinancials(unavailableState.company.orgNumber),
  ]);
  assert(availablePublic.statements.length > 0, "Offentlig port mangler tilgjengelige tall.");
  assert(
    availablePublic.statements.every(
      (statement) =>
        statement.sourceSystem === "BRREG" &&
        statement.sourceEntityType === "structuredAnnualAccounts" &&
        statement.rawPayload === undefined,
    ),
    "Offentlig port eksponerer feil kilde eller rå payload.",
  );
  assert(
    availablePublic.documents.length === 0 && availablePublic.lineItems.length === 0,
    "Offentlig port falt tilbake til PDF/OCR-data.",
  );
  assert(
    hasCompleteProvenance(availablePublic.availability),
    "Tilgjengelig offentlig resultat mangler proveniens.",
  );
  assert(
    unavailablePublic.statements.length === 0 &&
      unavailablePublic.allScopeStatements.length === 0 &&
      unavailablePublic.documents.length === 0 &&
      unavailablePublic.lineItems.length === 0,
    "Utilgjengelig offentlig resultat inneholder fallback-data.",
  );
  assert(
    unavailablePublic.availability.status === "UNAVAILABLE" &&
      hasCompleteProvenance(unavailablePublic.availability),
    "Utilgjengelig offentlig resultat mangler kontrollert status eller proveniens.",
  );

  console.log(
    JSON.stringify(
      {
        verificationProfile: STRUCTURED_FINANCIAL_CLOSEOUT_SAMPLE_PROFILE,
        poolFingerprint: sample.poolFingerprint,
        selectionFingerprint: sample.selectionFingerprint,
        selectedCompanies: sample.selected.length,
        persistedSourceChecks: states.length,
        available: states.filter((state) => state.status === "AVAILABLE").length,
        unavailable: states.filter((state) => state.status === "UNAVAILABLE").length,
        errors: states.filter((state) => state.status === "ERROR").length,
        staleOrUnknown: states.filter(
          (state) => state.status !== "AVAILABLE" && state.status !== "UNAVAILABLE",
        ).length,
        readThroughFromCache: true,
        availablePublicPath: "PASS",
        unavailablePublicPath: "PASS",
        rawPayloadExposed: false,
        pdfOrOcrFallbackObserved: false,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
