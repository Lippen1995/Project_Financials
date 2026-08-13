import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { buildCompanyMapClusterQuery } from "@/server/company-map/public-company-map-service";

describe("company-map cluster query", () => {
  it("uses one parameterized grid expression for both selection and grouping", () => {
    const cellSize = 0.08;
    const query = buildCompanyMapClusterQuery({
      buildId: "dc95ab35-85a7-4d65-b30d-3c53fdb3e620",
      filters: Prisma.sql`TRUE`,
      viewport: { west: 3, south: 57, east: 32, north: 72 },
      cellSize,
      rowLimit: 1_001,
    });

    expect(query.values.filter((value) => value === cellSize)).toHaveLength(2);
  });
});
