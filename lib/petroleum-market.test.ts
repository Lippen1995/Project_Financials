import { describe, expect, it } from "vitest";

import {
  parsePetroleumFilters,
  queryPetroleumEventsSchema,
  queryPetroleumFiltersSchema,
  queryPetroleumTimeseriesSchema,
} from "@/lib/petroleum-market";

describe("queryPetroleumFiltersSchema", () => {
  it("rejects unsupported enums and invalid pagination", () => {
    expect(
      queryPetroleumFiltersSchema.safeParse(
        new URLSearchParams({ tab: "unknown", page: "-1", size: "1.5" }),
      ).success,
    ).toBe(false);
  });

  it("rejects an inverted survey-year range", () => {
    expect(
      queryPetroleumFiltersSchema.safeParse(
        new URLSearchParams({ surveyYearFrom: "2025", surveyYearTo: "2020" }),
      ).success,
    ).toBe(false);
  });

  it("keeps the client-side parser fail-safe for malformed URLs", () => {
    expect(() =>
      parsePetroleumFilters(new URLSearchParams({ tab: "unknown" })),
    ).not.toThrow();
  });
});

describe("queryPetroleumEventsSchema", () => {
  it("rejects fractional or negative limits", () => {
    expect(
      queryPetroleumEventsSchema.safeParse(new URLSearchParams({ limit: "1.5" })).success,
    ).toBe(false);
    expect(
      queryPetroleumEventsSchema.safeParse(new URLSearchParams({ limit: "-1" })).success,
    ).toBe(false);
  });
});

describe("queryPetroleumTimeseriesSchema", () => {
  it("rejects unsupported measures and malformed years", () => {
    expect(
      queryPetroleumTimeseriesSchema.safeParse(
        new URLSearchParams({ measures: "oe,unsupported", yearFrom: "2024suffix" }),
      ).success,
    ).toBe(false);
  });

  it("rejects an inverted year range", () => {
    expect(
      queryPetroleumTimeseriesSchema.safeParse(
        new URLSearchParams({ yearFrom: "2025", yearTo: "2020" }),
      ).success,
    ).toBe(false);
  });
});
