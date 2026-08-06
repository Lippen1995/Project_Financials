import { describe, expect, it } from "vitest";

import { formatCompanyMapGroupLabel } from "@/server/company-map/company-list";

describe("company-map group labels", () => {
  it("uses the ultimate business parent name without its legal-form suffix", () => {
    expect(formatCompanyMapGroupLabel("Equinor ASA")).toBe(
      "Part of the Equinor Group",
    );
    expect(formatCompanyMapGroupLabel("REITAN AS")).toBe(
      "Part of the REITAN Group",
    );
  });

  it("does not alter names without an AS or ASA suffix", () => {
    expect(formatCompanyMapGroupLabel("SpareBank 1 Gruppen")).toBe(
      "Part of the SpareBank 1 Gruppen",
    );
  });
});
