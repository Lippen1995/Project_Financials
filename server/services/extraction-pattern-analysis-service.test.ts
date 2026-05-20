import { describe, expect, it, vi, beforeEach } from "vitest";

const { prismaMock, store } = vi.hoisted(() => {
  type StoredLabel = {
    id: string;
    filingId: string;
    labelType: string;
    targetRef: unknown;
    proposedValue: unknown;
    acceptedValue: unknown;
    sourcePayload: unknown;
    createdAt: Date;
  };
  type StoredReport = {
    id: string;
    periodStart: Date;
    periodEnd: Date;
    generatedAt: Date;
    status: string;
    totalCorrections: number;
    notes: string | null;
    patterns: Array<{
      id: string;
      reportId: string;
      metricKey: string | null;
      ruleCode: string | null;
      errorClass: string;
      occurrenceCount: number;
      severityScore: number;
      affectedFilings: string[];
      suggestedFix: string | null;
    }>;
  };
  const labels: StoredLabel[] = [];
  const reports: StoredReport[] = [];
  let nextId = 1;

  const prismaMock = {
    pdfTrainingLabel: {
      findMany: vi.fn(async (args: { where: Record<string, unknown> }) => {
        return labels.filter((l) => {
          if (args.where.labelType && l.labelType !== args.where.labelType) return false;
          return true;
        });
      }),
    },
    extractionPatternReport: {
      updateMany: vi.fn(async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        let count = 0;
        for (const r of reports) {
          if (args.where.status && r.status !== args.where.status) continue;
          Object.assign(r, args.data);
          count++;
        }
        return { count };
      }),
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        const created: StoredReport = {
          id: `pr-${nextId++}`,
          periodStart: args.data.periodStart as Date,
          periodEnd: args.data.periodEnd as Date,
          generatedAt: new Date(),
          status: (args.data.status as string) ?? "ACTIVE",
          totalCorrections: (args.data.totalCorrections as number) ?? 0,
          notes: (args.data.notes as string | null) ?? null,
          patterns: [],
        };
        const patternsCreate = (args.data.patterns as { create: Array<Record<string, unknown>> } | undefined)?.create ?? [];
        created.patterns = patternsCreate.map((p, i) => ({
          id: `p-${nextId++}-${i}`,
          reportId: created.id,
          metricKey: (p.metricKey as string | null) ?? null,
          ruleCode: (p.ruleCode as string | null) ?? null,
          errorClass: p.errorClass as string,
          occurrenceCount: p.occurrenceCount as number,
          severityScore: p.severityScore as number,
          affectedFilings: p.affectedFilings as string[],
          suggestedFix: (p.suggestedFix as string | null) ?? null,
        }));
        reports.push(created);
        return created;
      }),
      findFirst: vi.fn(async (args: { where: Record<string, unknown> }) => {
        const matches = reports.filter((r) => {
          if (args.where.status && r.status !== args.where.status) return false;
          return true;
        });
        matches.sort((a, b) => b.generatedAt.getTime() - a.generatedAt.getTime());
        return matches[0] ?? null;
      }),
      findMany: vi.fn(async (args: { take?: number }) => {
        const sorted = reports.slice().sort((a, b) => b.generatedAt.getTime() - a.generatedAt.getTime());
        return sorted.slice(0, args.take ?? sorted.length);
      }),
    },
    adminNotification: { upsert: vi.fn(async () => ({})) },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock)),
  };

  return {
    prismaMock,
    store: {
      labels,
      reports,
      reset() {
        labels.length = 0;
        reports.length = 0;
        nextId = 1;
      },
      addLabel(label: Omit<StoredLabel, "id">) {
        labels.push({ id: `l-${nextId++}`, ...label });
      },
    },
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/server/services/admin-notification-service", () => ({
  createAdminNotificationIfMissing: vi.fn(async () => ({})),
}));

import {
  classifyCorrection,
  runPatternAnalysis,
  getActivePatternReport,
} from "@/server/services/extraction-pattern-analysis-service";

function recentDate(daysAgo = 1): Date {
  return new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
}

describe("extraction-pattern-analysis-service", () => {
  beforeEach(() => {
    store.reset();
    prismaMock.pdfTrainingLabel.findMany.mockClear();
    prismaMock.extractionPatternReport.create.mockClear();
    prismaMock.extractionPatternReport.updateMany.mockClear();
  });

  describe("classifyCorrection", () => {
    it("detects UNIT_SCALE_MISS when accepted is 1000x proposed", () => {
      const result = classifyCorrection(
        { value: 100, unitScale: 1 },
        { value: 100000, unitScale: 1 },
      );
      expect(result).toBe("UNIT_SCALE_MISS");
    });

    it("detects UNIT_SCALE_MISS when accepted is proposed / 1000", () => {
      const result = classifyCorrection(
        { value: 100000, unitScale: 1 },
        { value: 100, unitScale: 1 },
      );
      expect(result).toBe("UNIT_SCALE_MISS");
    });

    it("detects MISSING_VALUE when proposed is null", () => {
      const result = classifyCorrection(null, { value: 50000 });
      expect(result).toBe("MISSING_VALUE");
    });

    it("detects OCR_NOISE when magnitudes are close but digits differ", () => {
      const result = classifyCorrection({ value: 12340 }, { value: 12345 });
      expect(result).toBe("OCR_NOISE");
    });

    it("detects WRONG_PAGE when same value but different sourcePage", () => {
      const result = classifyCorrection(
        { value: 100, sourcePage: 3 },
        { value: 100, sourcePage: 4 },
      );
      expect(result).toBe("WRONG_PAGE");
    });

    it("returns null when no actual change", () => {
      const result = classifyCorrection({ value: 100 }, { value: 100 });
      expect(result).toBeNull();
    });

    it("returns null when both values are null", () => {
      const result = classifyCorrection(null, null);
      expect(result).toBeNull();
    });

    it("classifies wildly different magnitudes as OTHER", () => {
      const result = classifyCorrection({ value: 50 }, { value: 5000000 });
      expect(result).toBe("OTHER");
    });

    it("handles string-encoded values in correction flow", () => {
      const result = classifyCorrection({ value: 100 }, { value: "100000" });
      expect(result).toBe("UNIT_SCALE_MISS");
    });
  });

  describe("runPatternAnalysis", () => {
    it("creates a report aggregating corrections by metric and error class", async () => {
      // Three filings with revenue unit scale errors
      for (let i = 0; i < 4; i++) {
        store.addLabel({
          filingId: `filing-${i}`,
          labelType: "FACT_VALUE",
          targetRef: { metricKey: "revenue" },
          proposedValue: { value: 100 },
          acceptedValue: { value: 100000 },
          sourcePayload: null,
          createdAt: recentDate(1),
        });
      }
      // One total_assets OCR error (under MIN_OCCURRENCES threshold)
      store.addLabel({
        filingId: "filing-9",
        labelType: "FACT_VALUE",
        targetRef: { metricKey: "total_assets" },
        proposedValue: { value: 12340 },
        acceptedValue: { value: 12345 },
        sourcePayload: null,
        createdAt: recentDate(1),
      });

      const report = await runPatternAnalysis({ skipNotification: true });

      expect(report).not.toBeNull();
      expect(report!.totalCorrections).toBe(5);
      // Only the revenue pattern is significant (>= 3 occurrences)
      expect(report!.patterns).toHaveLength(1);
      expect(report!.patterns[0]!.metricKey).toBe("revenue");
      expect(report!.patterns[0]!.errorClass).toBe("UNIT_SCALE_MISS");
      expect(report!.patterns[0]!.occurrenceCount).toBe(4);
      expect(report!.patterns[0]!.affectedFilings).toHaveLength(4);
      expect(report!.patterns[0]!.suggestedFix).toContain("Skala");
    });

    it("archives the previous ACTIVE report when a new one is created", async () => {
      for (let i = 0; i < 3; i++) {
        store.addLabel({
          filingId: `filing-${i}`,
          labelType: "FACT_VALUE",
          targetRef: { metricKey: "revenue" },
          proposedValue: { value: 100 },
          acceptedValue: { value: 100000 },
          sourcePayload: null,
          createdAt: recentDate(1),
        });
      }

      const first = await runPatternAnalysis({ skipNotification: true });
      const second = await runPatternAnalysis({ skipNotification: true });

      expect(first!.id).not.toBe(second!.id);
      const active = await getActivePatternReport();
      expect(active!.id).toBe(second!.id);
      // First report should now be ARCHIVED
      const firstStored = store.reports.find((r) => r.id === first!.id);
      expect(firstStored?.status).toBe("ARCHIVED");
    });

    it("still creates a report when no patterns are significant (so the UI shows empty state)", async () => {
      store.addLabel({
        filingId: "filing-1",
        labelType: "FACT_VALUE",
        targetRef: { metricKey: "revenue" },
        proposedValue: { value: 100 },
        acceptedValue: { value: 100000 },
        sourcePayload: null,
        createdAt: recentDate(1),
      });

      const report = await runPatternAnalysis({ skipNotification: true });

      expect(report).not.toBeNull();
      expect(report!.patterns).toHaveLength(0);
      expect(report!.notes).toContain("Ingen signifikante mønstre");
    });

    it("caps affectedFilings sample to prevent runaway row size", async () => {
      for (let i = 0; i < 100; i++) {
        store.addLabel({
          filingId: `filing-${i}`,
          labelType: "FACT_VALUE",
          targetRef: { metricKey: "revenue" },
          proposedValue: { value: 100 },
          acceptedValue: { value: 100000 },
          sourcePayload: null,
          createdAt: recentDate(1),
        });
      }

      const report = await runPatternAnalysis({ skipNotification: true });

      expect(report!.patterns[0]!.occurrenceCount).toBe(100);
      expect(report!.patterns[0]!.affectedFilings.length).toBeLessThanOrEqual(50);
    });
  });
});
