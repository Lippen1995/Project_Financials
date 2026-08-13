import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RelatedNameHoldersSection } from "@/components/company/company-name-history";
import type { RelatedNameHolder } from "@/server/registry/related-name-holders";

// The Bennett case (977511410 -> 935451140) as the register holds it.
function holder(overrides: Partial<RelatedNameHolder> = {}): RelatedNameHolder {
  return {
    orgNumber: "935451140",
    name: "BENNETT AS",
    status: "ACTIVE",
    registeredAt: new Date("2025-05-06"),
    foundedAt: new Date("2025-04-03"),
    municipality: "TRONDHEIM",
    sharedName: "BENNETT AS",
    sharedNameIsTheirCurrent: true,
    sharedNameIsOurCurrent: false,
    theirPeriod: { from: null, to: null },
    ourPeriod: { from: new Date("2004-04-14"), to: new Date("2011-12-03") },
    sameMunicipality: true,
    sharedRoleHolders: ["Jan Sverre Roterud", "Pål Isern"],
    ...overrides,
  };
}

function render(props: Partial<React.ComponentProps<typeof RelatedNameHoldersSection>> = {}) {
  return renderToStaticMarkup(
    <RelatedNameHoldersSection
      holders={[holder()]}
      companyName="BENNETT REKLAMEBYRÅ AS"
      bankruptcyOpenedAt={new Date("2025-04-22")}
      {...props}
    />,
  );
}

describe("RelatedNameHoldersSection", () => {
  it("renders nothing when no other entity has carried the name", () => {
    expect(render({ holders: [] })).toBe("");
  });

  it("names the shared name, the period we held it and the people in both", () => {
    const markup = render();

    expect(markup).toContain("BENNETT AS");
    expect(markup).toContain("Org.nr 935451140");
    expect(markup).toContain("Jan Sverre Roterud, Pål Isern");
    expect(markup).toContain("Samme kommune");
    expect(markup).toContain("14. apr. 2004");
  });

  it("states the gap to the bankruptcy without reading intent into it", () => {
    const markup = render();

    expect(markup).toContain("19 dager før konkursåpningen");
    expect(markup).not.toMatch(/konkurskarantene|unndra|misbruk/i);
  });

  it("puts a later start after the bankruptcy", () => {
    const markup = render({
      holders: [holder({ foundedAt: new Date("2025-06-11"), registeredAt: new Date("2025-06-20") })],
    });

    expect(markup).toContain("50 dager etter konkursåpningen");
  });

  it("leaves the timing out when the two dates are years apart", () => {
    const markup = render({
      holders: [holder({ foundedAt: new Date("2019-04-06"), registeredAt: new Date("2019-05-03") })],
    });

    expect(markup).not.toContain("konkursåpningen");
  });

  it("leaves the timing out when this company has no bankruptcy on record", () => {
    const markup = render({ bankruptcyOpenedAt: null });

    expect(markup).not.toContain("konkursåpningen");
    expect(markup).toContain("Jan Sverre Roterud");
  });
});
