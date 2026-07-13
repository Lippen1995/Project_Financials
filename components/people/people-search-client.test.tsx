import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PeopleSearchClient } from "@/components/people/people-search-client";

describe("PeopleSearchClient", () => {
  it("hydrates the query forwarded by the dashboard search", () => {
    globalThis.React = React;
    const html = renderToStaticMarkup(
      <PeopleSearchClient roleTypes={[]} initialQuery="Ola Nordmann" />,
    );

    expect(html).toContain('value="Ola Nordmann"');
  });

  it("hydrates a role filter forwarded by the dashboard search", () => {
    globalThis.React = React;
    const html = renderToStaticMarkup(
      <PeopleSearchClient
        roleTypes={[{ code: "LEDE", label: "Styrets leder" }]}
        initialRoleType="LEDE"
      />,
    );

    expect(html).toContain('<option value="LEDE" selected="">Styrets leder</option>');
    expect(html).not.toContain("Skriv minst 2 tegn");
  });
});
