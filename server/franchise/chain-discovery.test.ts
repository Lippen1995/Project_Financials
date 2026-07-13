import { describe, expect, it } from "vitest";

import {
  buildSecondTokenIndex,
  clusterSubunits,
  deriveBrandKey,
  normalizeName,
  type ChainCluster,
  type ClusterOptions,
  type SubunitRow,
} from "@/server/franchise/chain-discovery";

let seq = 0;
function sub(name: string, parent: string | null, extra: Partial<SubunitRow> = {}): SubunitRow {
  seq += 1;
  return {
    orgNumber: String(900_000_000 + seq),
    name,
    parentOrgNumber: parent,
    naceCode: "47.11",
    naceDescription: "Butikkhandel med bredt vareutvalg",
    status: "ACTIVE",
    municipalityNumber: "0301",
    ...extra,
  };
}

// Loosen size gates so fixtures stay small; brand-key logic is what's under test.
const OPTS: ClusterOptions = { minStores: 2, minOperators: 1, secondTokenMinCount: 2 };

function byKey(clusters: ChainCluster[], key: string): ChainCluster | undefined {
  return clusters.find((c) => c.nameKey === key);
}

describe("normalizeName", () => {
  it("lowercases, keeps Norwegian letters, collapses separators", () => {
    expect(normalizeName("REMA 1000 Grünerløkka")).toBe("rema 1000 grünerløkka");
    expect(normalizeName("Kiwi-372, Majorstuen")).toBe("kiwi 372 majorstuen");
    expect(normalizeName("  COOP   EXTRA  ")).toBe("coop extra");
  });
});

describe("deriveBrandKey", () => {
  it("keeps a recurring numeric suffix as part of the brand (REMA 1000)", () => {
    const rows = [
      sub("REMA 1000 Majorstuen", "111111111"),
      sub("REMA 1000 Lade", "222222222"),
    ];
    const index = buildSecondTokenIndex(rows);
    expect(deriveBrandKey("REMA 1000 Majorstuen", index, OPTS)).toBe("rema 1000");
  });

  it("drops a per-store number that varies (KIWI 372)", () => {
    const rows = [sub("KIWI 372 A", "111111111"), sub("KIWI 105 B", "222222222")];
    const index = buildSecondTokenIndex(rows);
    expect(deriveBrandKey("KIWI 372 A", index, OPTS)).toBe("kiwi");
  });

  it("returns null for an empty name", () => {
    const index = buildSecondTokenIndex([]);
    expect(deriveBrandKey("   ", index, OPTS)).toBeNull();
  });
});

describe("clusterSubunits", () => {
  it("merges same-brand outlets across locations and operators into one chain", () => {
    const rows = [
      sub("REMA 1000 Majorstuen", "111111111"),
      sub("REMA 1000 Grünerløkka", "222222222"),
      sub("REMA 1000 Lade", "222222222"),
    ];
    const clusters = clusterSubunits(rows, OPTS);
    const rema = byKey(clusters, "rema 1000");
    expect(rema).toBeDefined();
    expect(rema!.storeCount).toBe(3);
    expect(rema!.operatorCount).toBe(2);
    expect(rema!.displayName).toBe("REMA 1000");
    expect(rema!.slug).toBe("rema-1000");
  });

  it("strips varying store numbers so all KIWI outlets share one chain", () => {
    const rows = [
      sub("KIWI 372 Storo", "111111111"),
      sub("KIWI 105 Bergen", "222222222"),
      sub("KIWI 210 Tromsø", "333333333"),
    ];
    const clusters = clusterSubunits(rows, OPTS);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].nameKey).toBe("kiwi");
    expect(clusters[0].storeCount).toBe(3);
  });

  it("keeps distinct banners apart (COOP EXTRA vs COOP MEGA)", () => {
    const rows = [
      sub("COOP EXTRA Storo", "111111111"),
      sub("COOP EXTRA Lade", "222222222"),
      sub("COOP MEGA Sandvika", "333333333"),
      sub("COOP MEGA Bergen", "444444444"),
    ];
    const clusters = clusterSubunits(rows, OPTS);
    expect(byKey(clusters, "coop extra")).toBeDefined();
    expect(byKey(clusters, "coop mega")).toBeDefined();
    // Never collapsed to a bare "coop" chain.
    expect(byKey(clusters, "coop")).toBeUndefined();
  });

  it("does not split a single-word brand by its location suffix (MENY)", () => {
    const rows = [
      sub("MENY Sandvika", "111111111"),
      sub("MENY Storo", "222222222"),
      sub("MENY Bergen", "333333333"),
    ];
    const clusters = clusterSubunits(rows, OPTS);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].nameKey).toBe("meny");
  });

  it("counts active outlets and municipalities distinctly", () => {
    const rows = [
      sub("MENY Sandvika", "111111111", { municipalityNumber: "0219" }),
      sub("MENY Storo", "222222222", { municipalityNumber: "0301", status: "DISSOLVED" }),
      sub("MENY Oslo S", "333333333", { municipalityNumber: "0301" }),
    ];
    const [meny] = clusterSubunits(rows, OPTS);
    expect(meny.storeCount).toBe(3);
    expect(meny.activeStoreCount).toBe(2);
    expect(meny.municipalityCount).toBe(2);
  });

  it("drops clusters below the default size threshold", () => {
    const rows = [sub("Lilleputt Kolonial Torg", "111111111")];
    expect(clusterSubunits(rows)).toHaveLength(0);
  });

  it("drops a small single-operator cluster but keeps a large one", () => {
    const singleOperatorSmall = Array.from({ length: 6 }, (_, i) =>
      sub(`Nærbutikken ${i}`, "111111111"),
    );
    // 6 stores, 1 operator, below the single-operator floor (10) → dropped.
    expect(clusterSubunits(singleOperatorSmall, { minStores: 5, minOperators: 2 })).toHaveLength(0);

    const singleOperatorLarge = Array.from({ length: 12 }, (_, i) =>
      sub(`Nærbutikken ${i}`, "111111111"),
    );
    // 12 stores, 1 operator, at/above the floor → kept.
    expect(
      clusterSubunits(singleOperatorLarge, { minStores: 5, minOperators: 2 }),
    ).toHaveLength(1);
  });
});
