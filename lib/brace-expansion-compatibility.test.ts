import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);

describe("brace-expansion compatibility", () => {
  it("preserves the legacy callable interface used by the lint toolchain", () => {
    const expand = require("brace-expansion") as (pattern: string) => string[];

    expect(typeof expand).toBe("function");
    expect(expand("src/{app,lib}/**/*.{ts,tsx}")).toEqual([
      "src/app/**/*.ts",
      "src/app/**/*.tsx",
      "src/lib/**/*.ts",
      "src/lib/**/*.tsx",
    ]);
  });

  it("bounds cumulative expansion length for chained brace groups", () => {
    const expand = require("brace-expansion") as (pattern: string) => string[];
    const values = expand("{a,b}".repeat(18));
    const cumulativeLength = values.reduce((total, value) => total + value.length, 0);

    expect(values.length).toBeLessThanOrEqual(100_000);
    expect(cumulativeLength).toBeLessThanOrEqual(4_000_000);
  });
});
