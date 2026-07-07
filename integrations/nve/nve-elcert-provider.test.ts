import { describe, expect, it } from "vitest";

import { __testables } from "@/integrations/nve/nve-elcert-provider";

describe("nve-elcert-provider normalization", () => {
  it("maps an NVE elcertificate application to the internal intangible-right model", () => {
    const normalized = __testables.mapElcertApplication(
      {
        Status: "Godkjent",
        TypeAnlegg: "Vannkraft",
        KraftverksNavn: "Sundsfjord",
        GWh: 561.689,
        MW: 96,
        StatusDato: "20/12/2012 00:00:00",
        StatusID: 4,
        Startdato: "31/12/2012 00:00:00",
        Sluttdato: "30/06/2027 00:00:00",
        KraftverkEierOrgNr: 915637353,
        KraftverkEierNavn: "SKS PRODUKSJON AS",
        Fylke: "Nordland",
        Kommune: "Gildeskal",
        Omraade: "EL 4",
      },
      "915637353",
    );

    expect(normalized?.type).toBe("elCertificate");
    expect(normalized?.title).toBe("Sundsfjord");
    expect(normalized?.owners[0]).toEqual({ name: "SKS PRODUKSJON AS", orgNumber: "915637353" });
    expect(normalized?.registrationOrGrantDate).toBe("2012-12-31T00:00:00.000Z");
    expect(normalized?.expiryDate).toBe("2027-06-30T00:00:00.000Z");
    expect(normalized?.sourceSystem).toBe("NVE");
    expect(normalized?.sourceEntityType).toBe("ELCERT_APPLICATION");
    expect(normalized?.supportingFacts).toContainEqual({ label: "Effekt", value: "96 MW" });
    expect(normalized?.supportingFacts).toContainEqual({ label: "Forventet produksjon", value: "561,689 GWh" });
  });

  it("drops applications owned by another organization", () => {
    expect(
      __testables.mapElcertApplication(
        {
          KraftverkEierOrgNr: 915637353,
          KraftverksNavn: "Sundsfjord",
        },
        "123456789",
      ),
    ).toBeNull();
  });

  it("parses NVE's day-first timestamp format", () => {
    expect(__testables.parseNveDate("20/12/2012 00:00:00")).toBe("2012-12-20T00:00:00.000Z");
  });
});
