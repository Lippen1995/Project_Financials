import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CompanyRoles } from "@/components/company/ownership/company-roles";

describe("CompanyRoles", () => {
  it("keeps the annual holding separate from dated reported changes", () => {
    const html = renderToStaticMarkup(
      <CompanyRoles
        overview={{
          snapshot: { taxYear: 2025, asOfDate: "2025-12-31" },
          roles: [
            {
              holderType: "PERSON",
              personIdentityKey: "PERSON|1957-01-01",
              holderName: "Arvid Ståle Pettersen",
              holderOrgNumber: null,
              birthDate: "1957-01-01",
              roleType: "MEDL",
              roleTypeLabel: "Styremedlem",
              isBoardRole: true,
              deregistered: false,
              effectiveShares: 30_000,
              effectivePercent: 0.01,
              directShares: 0,
              heldVia: "PI SUBSEA AS",
              indirectHoldings: [{ orgNumber: "000000000", name: "PI SUBSEA AS", personOwnershipFraction: 1 }],
              reportedChanges: [
                {
                  transactionId: "tx-1",
                  transactionDate: "2026-07-16",
                  action: "PURCHASE",
                  reportedShares: "10000",
                  attributedShares: "10000",
                  ownershipFraction: "1",
                  direct: false,
                  legalPartyName: "PI SUBSEA AS",
                  sourceUrl: "https://newsweb.oslobors.no/message/678361",
                },
              ],
            },
          ],
        }}
      />,
    );

    expect(html).toContain("Rapporterte endringer");
    expect(html).toContain("Aksjer per 31.12.2025");
    expect(html).toContain("+10 000 kjøpt");
    expect(html).toContain("16.07.2026");
    expect(html).toContain("100,0 % eierbrøk");
    expect(html).toContain("30 000 aksjer");
    expect(html).toContain("Endringene er ikke innarbeidet");
  });
});
