import { slugify } from "@/lib/utils";
import { NormalizedCompany, NormalizedFinancialStatement, NormalizedRole } from "@/lib/types";

export function mapBrregCompany(payload: Record<string, any>): NormalizedCompany {
  const now = new Date();
  const orgNumber = payload.organisasjonsnummer ?? payload.orgNumber;
  const businessAddress = payload.forretningsadresse ?? payload.businessAddress;
  const industry = payload.naeringskode1 ?? payload.industryCode;

  return {
    sourceSystem: "BRREG",
    sourceEntityType: "company",
    sourceId: orgNumber,
    fetchedAt: now,
    normalizedAt: now,
    rawPayload: payload,
    orgNumber,
    name: payload.navn,
    slug: slugify(payload.navn),
    legalForm: payload.organisasjonsform?.kode ?? payload.legalForm,
    status: payload.konkurs ? "BANKRUPT" : payload.slettedato ? "DISSOLVED" : "ACTIVE",
    registeredAt: payload.registreringsdatoEnhetsregisteret ? new Date(payload.registreringsdatoEnhetsregisteret) : null,
    foundedAt: payload.stiftelsesdato ? new Date(payload.stiftelsesdato) : null,
    website: payload.hjemmeside ?? null,
    employeeCount: payload.antallAnsatte ?? null,
    revenue: payload.omsetning ?? null,
    operatingProfit: payload.driftsresultat ?? null,
    netIncome: payload.aarsresultat ?? null,
    equity: payload.sumEgenkapital ?? null,
    description: payload.formaal ?? null,
    industryCode: industry ? {
      sourceSystem: "BRREG",
      sourceEntityType: "industryCode",
      sourceId: industry.kode,
      fetchedAt: now,
      normalizedAt: now,
      rawPayload: industry,
      code: industry.kode,
      title: industry.beskrivelse,
      description: industry.beskrivelse,
      level: "primary",
    } : null,
    addresses: businessAddress ? [{
      sourceSystem: "BRREG",
      sourceEntityType: "address",
      sourceId: `${orgNumber}-business`,
      fetchedAt: now,
      normalizedAt: now,
      rawPayload: businessAddress,
      line1: [businessAddress.adresse?.[0], businessAddress.adresse?.[1]].filter(Boolean).join(", "),
      postalCode: businessAddress.postnummer,
      city: businessAddress.poststed,
      region: businessAddress.kommune ?? null,
      country: businessAddress.landkode ?? "NO",
    }] : [],
  };
}

export function mapBrregRole(payload: Record<string, any>, orgNumber: string): NormalizedRole {
  const now = new Date();

  return {
    sourceSystem: "BRREG",
    sourceEntityType: "role",
    sourceId: `${orgNumber}-${payload.type?.kode ?? payload.id ?? payload.navn}`,
    fetchedAt: now,
    normalizedAt: now,
    rawPayload: payload,
    title: payload.type?.beskrivelse ?? payload.type?.kode ?? "Rolle",
    isBoardRole: /styre/i.test(payload.type?.beskrivelse ?? ""),
    fromDate: payload.fraDato ? new Date(payload.fraDato) : null,
    toDate: payload.tilDato ? new Date(payload.tilDato) : null,
    person: {
      sourceSystem: "BRREG",
      sourceEntityType: "person",
      sourceId: payload.person?.foedselsdato ?? payload.person?.navn ?? payload.id ?? "unknown",
      fetchedAt: now,
      normalizedAt: now,
      rawPayload: payload.person,
      fullName: payload.person?.navn ?? "Ukjent person",
      birthYear: payload.person?.foedselsaar ?? null,
    },
  };
}

export function mapBrregFinancialStatement(payload: Record<string, any>, orgNumber: string): NormalizedFinancialStatement {
  const now = new Date();

  return {
    sourceSystem: "BRREG",
    sourceEntityType: "financialStatement",
    sourceId: `${orgNumber}-${payload.regnskapsperiode?.fraDato ?? payload.aar}`,
    fetchedAt: now,
    normalizedAt: now,
    rawPayload: payload,
    fiscalYear: payload.aar ?? new Date(payload.regnskapsperiode?.tilDato ?? payload.regnskapsperiode?.fraDato).getFullYear(),
    currency: payload.valuta ?? "NOK",
    revenue: payload.resultatregnskap?.sumDriftsinntekter ?? payload.revenue ?? null,
    operatingProfit: payload.resultatregnskap?.driftsresultat ?? payload.operatingProfit ?? null,
    netIncome: payload.resultatregnskap?.ordinaertResultatFoerSkattekostnad ?? payload.netIncome ?? null,
    equity: payload.balanse?.sumEgenkapital ?? payload.equity ?? null,
    assets: payload.balanse?.sumEiendeler ?? payload.assets ?? null,
  };
}