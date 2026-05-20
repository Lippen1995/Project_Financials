import { describe, expect, it, vi, beforeEach } from "vitest";

const { prismaMock, store } = vi.hoisted(() => {
  type StoredLabel = {
    id: string;
    filingId: string;
    labelType: string;
    targetRef: { metricKey?: string } | null;
    proposedValue: unknown;
    acceptedValue: unknown;
    createdAt: Date;
  };
  type StoredFiling = {
    id: string;
    fiscalYear: number;
    company: {
      name: string;
      orgNumber: string;
      industryCodeId: string | null;
      industryCode: { code: string; title: string } | null;
    };
  };
  const labels: StoredLabel[] = [];
  const filings: StoredFiling[] = [];

  const prismaMock = {
    pdfTrainingLabel: {
      findMany: vi.fn(async (args: { where: Record<string, unknown>; take?: number }) => {
        let matches = labels.filter((l) => {
          if (args.where.labelType && l.labelType !== args.where.labelType) return false;
          if ((args.where.filingId as { not?: string })?.not && l.filingId === (args.where.filingId as { not: string }).not) return false;
          if (args.where.targetRef) {
            const path = (args.where.targetRef as { path: string[]; equals: string }).path;
            const equals = (args.where.targetRef as { path: string[]; equals: string }).equals;
            if (path[0] === "metricKey" && l.targetRef?.metricKey !== equals) return false;
          }
          if (args.where.acceptedValue && l.acceptedValue === null) return false;
          return true;
        });
        matches.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return matches.slice(0, args.take ?? matches.length);
      }),
    },
    annualReportFiling: {
      findMany: vi.fn(async (args: { where: { id: { in: string[] } } }) => {
        return filings.filter((f) => args.where.id.in.includes(f.id));
      }),
    },
  };

  return {
    prismaMock,
    store: {
      labels,
      filings,
      reset() {
        labels.length = 0;
        filings.length = 0;
      },
      addExample(input: {
        filingId: string;
        metricKey: string;
        industryCode: string;
        industryTitle: string;
        companyName: string;
        orgNumber: string;
        fiscalYear: number;
        approvedValue: unknown;
        proposedValue?: unknown;
        daysAgo?: number;
      }) {
        const existing = filings.find((f) => f.id === input.filingId);
        if (!existing) {
          filings.push({
            id: input.filingId,
            fiscalYear: input.fiscalYear,
            company: {
              name: input.companyName,
              orgNumber: input.orgNumber,
              industryCodeId: input.industryCode,
              industryCode: { code: input.industryCode, title: input.industryTitle },
            },
          });
        }
        labels.push({
          id: `lbl-${labels.length + 1}`,
          filingId: input.filingId,
          labelType: "FACT_VALUE",
          targetRef: { metricKey: input.metricKey },
          proposedValue: input.proposedValue ?? null,
          acceptedValue: input.approvedValue,
          createdAt: new Date(Date.now() - (input.daysAgo ?? 1) * 86_400_000),
        });
      },
    },
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import {
  FEW_SHOT_MILESTONE_THRESHOLD,
  getFewShotLibraryInventory,
  retrieveFewShotExamples,
} from "@/server/services/extraction-fewshot-retrieval-service";

describe("extraction-fewshot-retrieval-service", () => {
  beforeEach(() => {
    store.reset();
    prismaMock.pdfTrainingLabel.findMany.mockClear();
    prismaMock.annualReportFiling.findMany.mockClear();
  });

  describe("retrieveFewShotExamples", () => {
    it("returns exact industry matches first, ordered by recency", async () => {
      store.addExample({
        filingId: "f1",
        metricKey: "revenue",
        industryCode: "46110",
        industryTitle: "Wholesale",
        companyName: "Older Match",
        orgNumber: "111",
        fiscalYear: 2024,
        approvedValue: { value: 5000000 },
        daysAgo: 30,
      });
      store.addExample({
        filingId: "f2",
        metricKey: "revenue",
        industryCode: "46110",
        industryTitle: "Wholesale",
        companyName: "Newer Match",
        orgNumber: "222",
        fiscalYear: 2024,
        approvedValue: { value: 6000000 },
        daysAgo: 1,
      });
      store.addExample({
        filingId: "f3",
        metricKey: "revenue",
        industryCode: "62010",
        industryTitle: "Software",
        companyName: "Different Industry",
        orgNumber: "333",
        fiscalYear: 2024,
        approvedValue: { value: 1000000 },
        daysAgo: 1,
      });

      const result = await retrieveFewShotExamples({
        industryCode: "46110",
        metricKey: "revenue",
        limit: 5,
      });

      // Exact matches come first, ordered by recency. Other-industry filings
      // are allowed as a fallback to fill up to `limit`.
      expect(result.slice(0, 2).map((r) => r.companyName)).toEqual([
        "Newer Match",
        "Older Match",
      ]);
    });

    it("falls back to industry prefix when exact match has too few examples", async () => {
      // Only one exact 46110 match, but two 46xxx matches
      store.addExample({
        filingId: "f1",
        metricKey: "revenue",
        industryCode: "46110",
        industryTitle: "Wholesale A",
        companyName: "Exact",
        orgNumber: "111",
        fiscalYear: 2024,
        approvedValue: { value: 5000000 },
      });
      store.addExample({
        filingId: "f2",
        metricKey: "revenue",
        industryCode: "46220",
        industryTitle: "Wholesale B",
        companyName: "Prefix Match A",
        orgNumber: "222",
        fiscalYear: 2024,
        approvedValue: { value: 6000000 },
      });
      store.addExample({
        filingId: "f3",
        metricKey: "revenue",
        industryCode: "46330",
        industryTitle: "Wholesale C",
        companyName: "Prefix Match B",
        orgNumber: "333",
        fiscalYear: 2024,
        approvedValue: { value: 7000000 },
      });

      const result = await retrieveFewShotExamples({
        industryCode: "46110",
        metricKey: "revenue",
        limit: 5,
      });

      const names = result.map((r) => r.companyName);
      expect(names[0]).toBe("Exact");
      expect(names).toContain("Prefix Match A");
      expect(names).toContain("Prefix Match B");
    });

    it("excludes the requested filing from results", async () => {
      store.addExample({
        filingId: "f1",
        metricKey: "revenue",
        industryCode: "46110",
        industryTitle: "Wholesale",
        companyName: "Itself",
        orgNumber: "111",
        fiscalYear: 2024,
        approvedValue: { value: 5000000 },
      });
      store.addExample({
        filingId: "f2",
        metricKey: "revenue",
        industryCode: "46110",
        industryTitle: "Wholesale",
        companyName: "Peer",
        orgNumber: "222",
        fiscalYear: 2024,
        approvedValue: { value: 6000000 },
      });

      const result = await retrieveFewShotExamples({
        industryCode: "46110",
        excludeFilingId: "f1",
      });

      expect(result).toHaveLength(1);
      expect(result[0]!.companyName).toBe("Peer");
    });

    it("returns examples from any industry when no industryCode is provided", async () => {
      store.addExample({
        filingId: "f1",
        metricKey: "revenue",
        industryCode: "46110",
        industryTitle: "Wholesale",
        companyName: "A",
        orgNumber: "111",
        fiscalYear: 2024,
        approvedValue: { value: 5000000 },
      });
      store.addExample({
        filingId: "f2",
        metricKey: "revenue",
        industryCode: "62010",
        industryTitle: "Software",
        companyName: "B",
        orgNumber: "222",
        fiscalYear: 2024,
        approvedValue: { value: 6000000 },
      });

      const result = await retrieveFewShotExamples({ industryCode: null });

      expect(result).toHaveLength(2);
    });
  });

  describe("getFewShotLibraryInventory", () => {
    it("returns example counts per industry, sorted descending", async () => {
      for (let i = 0; i < 5; i++) {
        store.addExample({
          filingId: `f-${i}`,
          metricKey: "revenue",
          industryCode: "46110",
          industryTitle: "Wholesale",
          companyName: `Co ${i}`,
          orgNumber: `${i}`,
          fiscalYear: 2024,
          approvedValue: { value: 100 },
        });
      }
      for (let i = 5; i < 7; i++) {
        store.addExample({
          filingId: `f-${i}`,
          metricKey: "revenue",
          industryCode: "62010",
          industryTitle: "Software",
          companyName: `Co ${i}`,
          orgNumber: `${i}`,
          fiscalYear: 2024,
          approvedValue: { value: 200 },
        });
      }

      const inventory = await getFewShotLibraryInventory();

      expect(inventory).toHaveLength(2);
      expect(inventory[0]!.industryCode).toBe("46110");
      expect(inventory[0]!.exampleCount).toBe(5);
      expect(inventory[1]!.industryCode).toBe("62010");
      expect(inventory[1]!.exampleCount).toBe(2);
    });

    it("flags industries that pass the milestone threshold", async () => {
      for (let i = 0; i < FEW_SHOT_MILESTONE_THRESHOLD + 5; i++) {
        store.addExample({
          filingId: `f-${i}`,
          metricKey: "revenue",
          industryCode: "46110",
          industryTitle: "Wholesale",
          companyName: `Co ${i}`,
          orgNumber: `${i}`,
          fiscalYear: 2024,
          approvedValue: { value: 100 },
        });
      }

      const inventory = await getFewShotLibraryInventory();

      expect(inventory[0]!.hasMilestone).toBe(true);
    });

    it("returns an empty list when there are no examples", async () => {
      const inventory = await getFewShotLibraryInventory();
      expect(inventory).toEqual([]);
    });
  });
});
