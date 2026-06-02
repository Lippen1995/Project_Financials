import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, repositoryMock } = vi.hoisted(() => ({
  prismaMock: {
    sourceDocument: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
  },
  repositoryMock: {
    upsertNewsSource: vi.fn(),
    upsertSourceDocument: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/server/news/company-event-repository", () => repositoryMock);

import { upsertSourceDocuments } from "@/server/news/company-event-ingestion-service";

describe("company event ingestion service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates normalized source documents when no duplicate exists", async () => {
    prismaMock.sourceDocument.findUnique.mockResolvedValue(null);
    prismaMock.sourceDocument.findFirst.mockResolvedValue(null);
    repositoryMock.upsertSourceDocument.mockResolvedValue({ id: "doc-1" });

    const metrics = await upsertSourceDocuments([
      {
        sourceId: "eia-press",
        externalId: "press588",
        url: "https://www.eia.gov/pressroom/releases/press588.php?utm_source=x",
        title: "EIA publishes petroleum update",
        summary: "Weekly petroleum data.",
        language: "en",
        publishedAt: new Date("2026-06-02T10:00:00Z"),
      },
    ]);

    expect(metrics).toMatchObject({ fetched: 1, created: 1, updated: 0, duplicate: 0 });
    expect(repositoryMock.upsertSourceDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: "eia-press",
        externalId: "press588",
        canonicalUrl: "https://www.eia.gov/pressroom/releases/press588.php",
        documentFingerprint: expect.any(String),
        contentHash: expect.any(String),
      }),
    );
  });

  it("updates title-window duplicates instead of creating noisy duplicates", async () => {
    prismaMock.sourceDocument.findUnique.mockResolvedValue(null);
    prismaMock.sourceDocument.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "existing-doc" });
    repositoryMock.upsertSourceDocument.mockResolvedValue({ id: "existing-doc" });

    const metrics = await upsertSourceDocuments([
      {
        sourceId: "media",
        url: "https://example.com/articles/one",
        title: "Equinor announces contract",
        publishedAt: new Date("2026-06-02T10:00:00Z"),
      },
    ]);

    expect(metrics).toMatchObject({ fetched: 1, created: 0, updated: 1, duplicate: 1 });
    expect(repositoryMock.upsertSourceDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "existing-doc",
        metadata: { duplicateKind: "titleWindow" },
      }),
    );
  });
});
