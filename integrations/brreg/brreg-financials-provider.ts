import { FinancialsProvider } from "@/integrations/provider-interface";

export class BrregFinancialsProvider implements FinancialsProvider {
  async getFinancialStatements(_orgNumber: string) {
    return {
      statements: [],
      availability: {
        available: false,
        sourceSystem: "BRREG",
        message:
          "Detaljerte regnskapstall er ikke koblet til en åpen, stabil Brreg-kilde i dette MVP-et. ProjectX viser derfor ikke syntetiske tall.",
      },
    };
  }
}
