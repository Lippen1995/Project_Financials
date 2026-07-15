import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FinancialDocuments } from "@/components/company/financial-documents";
import type { NormalizedFinancialDocument } from "@/lib/types";

const source = {
  sourceSystem: "BRREG",
  sourceEntityType: "annualReport",
  fetchedAt: new Date("2026-07-15T17:00:00.000Z"),
  normalizedAt: new Date("2026-07-15T17:00:00.000Z"),
};

describe("FinancialDocuments", () => {
  it("renders annual-report links as one compact disclosure grouped by year", () => {
    const documents: NormalizedFinancialDocument[] = [
      {
        ...source,
        sourceId: "report-2025",
        year: 2025,
        files: [{
          type: "aarsregnskap",
          id: "company-2025",
          label: "Årsrapport",
          url: "https://example.com/annual-report-2025.pdf",
        }],
      },
      {
        ...source,
        sourceId: "report-2024",
        year: 2024,
        files: [{
          type: "aarsregnskap",
          id: "company-2024",
          label: "Årsrapport",
          url: "https://example.com/annual-report-2024.pdf",
        }],
      },
      {
        ...source,
        sourceId: "brreg-2024",
        year: 2024,
        files: [{
          type: "aarsregnskap",
          id: "brreg-copy-2024",
          label: "Årsregnskap",
          url: "https://data.brreg.no/regnskapsregisteret/regnskap/aarsregnskap/kopi/123/2024",
        }],
      },
    ];

    const html = renderToStaticMarkup(
      <FinancialDocuments documents={documents} latestYear={null} />,
    );

    expect(html).toContain('data-financial-documents-variant="compact"');
    expect(html).toContain("Årsrapporter");
    expect(html).toContain("Nyeste 2025");
    expect(html).toContain("2 regnskapsår");
    expect(html.match(/data-financial-document-year=/g)).toHaveLength(2);
    expect(html.match(/href=/g)).toHaveLength(3);
    expect(html).not.toContain("Sist innsendte årsregnskap");
    expect(html).not.toContain("Registrerte regnskapsår");
  });
});
