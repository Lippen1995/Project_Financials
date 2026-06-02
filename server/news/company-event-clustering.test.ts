import { describe, expect, it } from "vitest";

import { buildDocumentClusterKey, clusterEventDocuments } from "@/server/news/company-event-clustering";

describe("company event clustering", () => {
  it("builds deterministic cluster keys from normalized title and date", () => {
    expect(
      buildDocumentClusterKey({
        id: "doc-1",
        title: "Equinor ASA: Share buy-back second tranche",
        publishedAt: new Date("2026-05-27T08:00:00Z"),
      }),
    ).toBe(
      buildDocumentClusterKey({
        id: "doc-2",
        title: "Equinor announces share buyback second tranche",
        publishedAt: new Date("2026-05-27T20:00:00Z"),
      }),
    );
  });

  it("counts duplicate documents without inflating evidence", () => {
    const cluster = clusterEventDocuments([
      { id: "doc-1", title: "Inspection event", sourceId: "a", contentHash: "same" },
      { id: "doc-2", title: "Inspection event", sourceId: "b", contentHash: "same" },
      { id: "doc-3", title: "Inspection event", sourceId: "b", contentHash: "different" },
    ]);

    expect(cluster.duplicateCount).toBe(1);
    expect(cluster.sourceCount).toBe(2);
    expect(cluster.isFollowUp).toBe(true);
  });
});
