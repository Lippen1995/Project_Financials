import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PeopleSearchClient } from "@/components/people/people-search-client";

describe("PeopleSearchClient", () => {
  it("hydrates the query forwarded by the dashboard search", () => {
    globalThis.React = React;
    const html = renderToStaticMarkup(
      <PeopleSearchClient roleTypes={[]} initialQuery="PERSON_QUERY" />,
    );

    expect(html).toContain('value="PERSON_QUERY"');
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

  it("renders a role query without converting it to a person name", () => {
    globalThis.React = React;
    const html = renderToStaticMarkup(
      <PeopleSearchClient roleTypes={[]} initialQuery="Observatør" searchScope="roles" />,
    );

    expect(html).toContain('value="Observatør"');
  });
});
