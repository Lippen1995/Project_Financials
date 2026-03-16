import { slugify } from "@/lib/utils";
import { NormalizedCompany, NormalizedFinancialStatement, NormalizedRole } from "@/lib/types";

function deriveStatus(payload: Record<string, any>): "ACTIVE" | "DISSOLVED" | "BANKRUPT" {
  if (payload.konkurs || payload.underKonkursbehandling) {
    return "BANKRUPT";
  }

  if (
    payload.slettedato ||
    payload.underAvvikling ||
    payload.underTvangsavviklingEllerTvangsopplosning
  ) {
    return "DISSOLVED";
  }

  return "ACTIVE";
}

function buildSlug(name: string, orgNumber: string) {
  return `${orgNumber}-${slugify(name)}`;
}

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
    slug: buildSlug(payload.navn, orgNumber),
    legalForm: payload.organisasjonsform?.kode ?? payload.legalForm,
    status: deriveStatus(payload),
    registeredAt: payload.registreringsdatoEnhetsregisteret
      ? new Date(payload.registreringsdatoEnhetsregisteret)
      : null,
    foundedAt: payload.stiftelsesdato ? new Date(payload.stiftelsesdato) : null,
    website: payload.hjemmeside ?? null,
    employeeCount: payload.antallAnsatte ?? null,
    description: payload.formaal ?? null,
    municipality: businessAddress?.kommune ?? null,
    vatRegistered: payload.registrertIMvaregisteret ?? null,
    shareCapital: payload.kapital?.belop ?? null,
    shareCapitalCurrency: payload.kapital?.valuta ?? null,
    shareCount: payload.kapital?.antallAksjer ?? null,
    lastSubmittedAnnualReportYear: payload.sisteInnsendteAarsregnskap
      ? Number(payload.sisteInnsendteAarsregnskap)
      : null,
    announcementsUrl: orgNumber
      ? `https://w2.brreg.no/kunngjoring/hent_nr.jsp?orgnr=${orgNumber}`
      : null,
    industryCode: industry
      ? {
          sourceSystem: "SSB_KLASS",
          sourceEntityType: "industryCode",
          sourceId: industry.kode,
          fetchedAt: now,
          normalizedAt: now,
          rawPayload: industry,
          code: industry.kode,
          title: null,
          description: null,
          level: "primary",
          parentCode: null,
        }
      : null,
    addresses: businessAddress
      ? [
          {
            sourceSystem: "BRREG",
            sourceEntityType: "address",
            sourceId: `${orgNumber}-business`,
            fetchedAt: now,
            normalizedAt: now,
            rawPayload: businessAddress,
            line1: [businessAddress.adresse?.[0], businessAddress.adresse?.[1]]
              .filter(Boolean)
              .join(", "),
            postalCode: businessAddress.postnummer,
            city: businessAddress.poststed,
            region: businessAddress.kommune ?? null,
            country: businessAddress.landkode ?? "NO",
          },
        ]
      : [],
  };
}

export function mapBrregRole(payload: Record<string, any>, orgNumber: string): NormalizedRole {
  const now = new Date();
  const type = payload.type ?? payload.rolletype?.type ?? payload.rolletype ?? {};
  const personPayload = payload.person ?? payload.rolleinnehaver ?? payload.innehaver ?? {};
  const fullName = personPayload.navn ?? personPayload.fulltNavn ?? payload.navn ?? "Ukjent person";

  return {
    sourceSystem: "BRREG",
    sourceEntityType: "role",
    sourceId: `${orgNumber}-${type.kode ?? type.beskrivelse ?? fullName}`,
    fetchedAt: now,
    normalizedAt: now,
    rawPayload: payload,
    title: type.beskrivelse ?? type.kode ?? "Rolle",
    isBoardRole: /styre/i.test(type.beskrivelse ?? type.kode ?? ""),
    fromDate: payload.fraDato ? new Date(payload.fraDato) : null,
    toDate: payload.tilDato ? new Date(payload.tilDato) : null,
    person: {
      sourceSystem: "BRREG",
      sourceEntityType: "person",
      sourceId: personPayload.foedselsdato ?? personPayload.navn ?? fullName,
      fetchedAt: now,
      normalizedAt: now,
      rawPayload: personPayload,
      fullName,
      birthYear: personPayload.foedselsaar ?? personPayload.fodselsaar ?? null,
    },
  };
}

export function mapBrregFinancialStatement(
  payload: Record<string, any>,
  orgNumber: string,
): NormalizedFinancialStatement {
  const now = new Date();
  const driftsresultat = payload.resultatregnskapResultat?.driftsresultat;
  const driftsinntekter = driftsresultat?.driftsinntekter;
  const driftskostnad = driftsresultat?.driftskostnad;
  const finansresultat = payload.resultatregnskapResultat?.finansresultat;
  const egenkapitalGjeld = payload.egenkapitalGjeld;
  const egenkapital = egenkapitalGjeld?.egenkapital;
  const eiendeler = payload.eiendeler;
  const fiscalYear = payload.regnskapsperiode?.tilDato
    ? new Date(payload.regnskapsperiode.tilDato).getFullYear()
    : payload.aar ?? new Date().getFullYear();

  return {
    sourceSystem: "BRREG",
    sourceEntityType: "financialStatement",
    sourceId: `${orgNumber}-${payload.id ?? fiscalYear}`,
    fetchedAt: now,
    normalizedAt: now,
    rawPayload: payload,
    fiscalYear,
    currency: payload.valuta ?? "NOK",
    revenue:
      driftsinntekter?.salgsinntekter ??
      driftsinntekter?.sumDriftsinntekter ??
      payload.revenue ??
      null,
    operatingProfit: driftsresultat?.driftsresultat ?? payload.operatingProfit ?? null,
    netIncome:
      payload.resultatregnskapResultat?.aarsresultat ??
      payload.resultatregnskapResultat?.ordinaertResultatFoerSkattekostnad ??
      payload.netIncome ??
      null,
    equity: egenkapital?.sumEgenkapital ?? payload.equity ?? null,
    assets: eiendeler?.sumEiendeler ?? payload.assets ?? null,
  };
}
