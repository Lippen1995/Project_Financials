import env from "@/lib/env";
import { fetchJson } from "@/integrations/http";
import { BrregSubunit } from "@/lib/types";

type BrregSubunitsResponse = {
  _embedded?: {
    underenheter?: Record<string, any>[];
  };
};

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

export class BrregSubunitsProvider {
  async fetchSubunits(orgNumber: string): Promise<BrregSubunit[]> {
    const response = await fetchJson<BrregSubunitsResponse>(
      `${env.brregBaseUrl}/underenheter?overordnetEnhet=${orgNumber}`,
    );

    return (
      response._embedded?.underenheter?.map((payload) => ({
        id: `subunit:${payload.organisasjonsnummer}`,
        orgNumber: payload.organisasjonsnummer,
        name: payload.navn,
        parentOrgNumber: payload.overordnetEnhet,
        address: [payload.beliggenhetsadresse?.adresse?.[0], payload.beliggenhetsadresse?.postnummer, payload.beliggenhetsadresse?.poststed]
          .filter(Boolean)
          .join(", ") || null,
        status: deriveStatus(payload),
        source: "BRREG",
        rawPayload: payload,
      })) ?? []
    );
  }
}
