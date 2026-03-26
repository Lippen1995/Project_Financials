import { fetchJson } from "@/integrations/http";
import { BrregAuthorityRule, BrregRoleHolder } from "@/lib/types";

type FullmaktPerson = {
  fodselsdato?: string;
  navn?: string;
  rolle?: {
    kode?: string;
    tekstforklaring?: string;
  };
};

type FullmaktResponse = {
  status?: {
    regelStatus?: {
      kode?: string;
      tekstforklaring?: string;
    };
    kombinasjonStatus?: {
      kode?: string;
      tekstforklaring?: string;
    };
  };
  signeringsGrunnlag?: {
    kode?: string;
    tekstforklaring?: string;
    signaturProkuraRoller?: {
      signaturProkuraFritekst?: string;
    };
    muligeSigneringsRoller?: {
      personRolleGrunnlag?: FullmaktPerson[];
    };
  };
  signeringsKombinasjon?: {
    kombinasjon?: Array<{
      kode?: string;
      tekstforklaring?: string;
      kombinasjonsId?: string;
      personRolleKombinasjon?: FullmaktPerson[];
    }>;
  };
};

function getBirthYear(value?: string) {
  if (!value) {
    return null;
  }

  const year = value.match(/(\d{4})$/)?.[1];
  return year ? Number.parseInt(year, 10) : null;
}

function mapPersonsToHolders(persons: FullmaktPerson[] | undefined, prefix: string): BrregRoleHolder[] {
  return (persons ?? []).map((person) => ({
    id: `${prefix}:${person.navn}:${person.fodselsdato ?? "unknown"}`,
    type: "PERSON",
    name: person.navn ?? "Ukjent person",
    birthYear: getBirthYear(person.fodselsdato),
    orgNumber: null,
    source: "BRREG",
  }));
}

export class BrregAuthorityProvider {
  async fetchSignatoryRules(orgNumber: string): Promise<{
    rules: BrregAuthorityRule[];
    holders: BrregRoleHolder[];
    raw: unknown;
  }> {
    const response = await fetchJson<FullmaktResponse>(
      `https://data.brreg.no/fullmakt/enheter/${orgNumber}/signatur`,
    );

    const holders = [
      ...mapPersonsToHolders(response.signeringsGrunnlag?.muligeSigneringsRoller?.personRolleGrunnlag, "signature-holder"),
      ...(response.signeringsKombinasjon?.kombinasjon ?? []).flatMap((combination) =>
        mapPersonsToHolders(combination.personRolleKombinasjon, `signature-combination:${combination.kombinasjonsId ?? "0"}`),
      ),
    ];

    const rules: BrregAuthorityRule[] = [];
    const freeText = response.signeringsGrunnlag?.signaturProkuraRoller?.signaturProkuraFritekst;
    if (freeText) {
      rules.push({
        id: `signature:${orgNumber}:freetext`,
        entityOrgNumber: orgNumber,
        type: "SIGNATURE",
        rawText: freeText,
        structuredInterpretation: response.signeringsGrunnlag?.tekstforklaring ?? null,
        relatedRoleHolders: holders.map((holder) => holder.id),
      });
    }

    for (const combination of response.signeringsKombinasjon?.kombinasjon ?? []) {
      rules.push({
        id: `signature:${orgNumber}:combination:${combination.kombinasjonsId ?? combination.kode ?? "0"}`,
        entityOrgNumber: orgNumber,
        type: "SIGNATURE",
        rawText: combination.tekstforklaring ?? "Registrert signaturkombinasjon",
        structuredInterpretation: combination.kode ?? null,
        relatedRoleHolders: mapPersonsToHolders(
          combination.personRolleKombinasjon,
          `signature-combination:${combination.kombinasjonsId ?? "0"}`,
        ).map((holder) => holder.id),
      });
    }

    return { rules, holders, raw: response };
  }

  async fetchProcurationRules(orgNumber: string): Promise<{
    rules: BrregAuthorityRule[];
    holders: BrregRoleHolder[];
    raw: unknown;
  }> {
    const response = await fetchJson<FullmaktResponse>(
      `https://data.brreg.no/fullmakt/enheter/${orgNumber}/prokura`,
    );

    const holders = mapPersonsToHolders(
      response.signeringsGrunnlag?.muligeSigneringsRoller?.personRolleGrunnlag,
      "procuration-holder",
    );

    const rules: BrregAuthorityRule[] = [];
    const freeText = response.signeringsGrunnlag?.signaturProkuraRoller?.signaturProkuraFritekst;
    if (freeText) {
      rules.push({
        id: `procuration:${orgNumber}:freetext`,
        entityOrgNumber: orgNumber,
        type: "PROCURATION",
        rawText: freeText,
        structuredInterpretation: response.signeringsGrunnlag?.tekstforklaring ?? null,
        relatedRoleHolders: holders.map((holder) => holder.id),
      });
    }

    return { rules, holders, raw: response };
  }
}
