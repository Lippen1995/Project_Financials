import env from "@/lib/env";
import { NormalizedFinancialDocument } from "@/lib/types";
import { fetchText } from "@/integrations/http";
import { FinancialsProvider } from "@/integrations/provider-interface";

type BrregFinancialDocument = {
  year: string;
  files: {
    type: string;
    id: string;
  }[];
};

function documentLabel(type: string) {
  switch (type) {
    case "aarsregnskap":
      return "Innsendt arsregnskap";
    case "baerekraft":
      return "Innsendt arsberetning med baerekraftsopplysninger";
    case "mellombalanse":
      return "Innsendt mellombalanse";
    default:
      return type;
  }
}

function parseRegnskapsAarResponse(html: string, orgNumber: string): NormalizedFinancialDocument[] {
  const match = html.match(/"regnskapsAarResponse":\{"data":(\[[\s\S]*?\]),"errors":(\[[\s\S]*?\])\},"orgnr":"\d{9}"/);

  if (!match) {
    return [];
  }

  const years = JSON.parse(match[1]) as BrregFinancialDocument[];
  const now = new Date();

  return years
    .map((entry) => ({
      sourceSystem: "BRREG",
      sourceEntityType: "financialDocument",
      sourceId: `${orgNumber}-${entry.year}`,
      fetchedAt: now,
      normalizedAt: now,
      rawPayload: entry,
      year: Number(entry.year),
      files: entry.files.map((file) => ({
        type: file.type,
        id: file.id,
        label: documentLabel(file.type),
      })),
    }))
    .sort((left, right) => right.year - left.year);
}

export class BrregFinancialsProvider implements FinancialsProvider {
  async getFinancialStatements(orgNumber: string) {
    const companyPageUrl = `${env.brregCompanyLookupBaseUrl}/${orgNumber}`;
    let documents: NormalizedFinancialDocument[] = [];

    try {
      const html = await fetchText(companyPageUrl, undefined, 12000);
      documents = parseRegnskapsAarResponse(html, orgNumber);
    } catch {
      documents = [];
    }

    return {
      statements: [],
      documents,
      availability: {
        available: false,
        sourceSystem: "BRREG",
        message:
          documents.length > 0
            ? "ProjectX viser apen arsregnskapsmetadata fra Bronnoysundregistrene. Historiske resultatlinjer som omsetning og EBIT vises forst nar den apne kontrakten for disse feltene er verifisert ende-til-ende."
            : "ProjectX fant ingen apne regnskapsdokumenter for virksomheten akkurat na.",
      },
    };
  }
}
