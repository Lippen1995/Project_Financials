import { describe, expect, it } from "vitest";

import { formatCompanyMapGroupLabel } from "@/server/company-map/company-list";

describe("company-map group labels", () => {
  it("uses the ultimate business parent name without its legal-form suffix", () => {
    expect(formatCompanyMapGroupLabel("Equinor ASA")).toBe(
      "Del av Equinor-konsernet",
    );
    expect(formatCompanyMapGroupLabel("REITAN AS")).toBe(
      "Del av REITAN-konsernet",
    );
  });

  it("does not append konsern to a name that already says so", () => {
    expect(formatCompanyMapGroupLabel("SpareBank 1 Gruppen")).toBe(
      "Del av SpareBank 1 Gruppen",
    );
  });
});
