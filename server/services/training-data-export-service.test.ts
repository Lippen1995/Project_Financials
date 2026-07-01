import { describe, expect, it, vi, beforeEach } from "vitest";

const { prismaMock, store } = vi.hoisted(() => {
  type StoredLabel = {
    id: string;
    filingId: string;
    proposedValue: unknown;
    acceptedValue: unknown;
    sourcePayload: unknown;
  };
  const labels: StoredLabel[] = [];

  const prismaMock = {
    pdfTrainingLabel: {
      findMany: vi.fn(async () => labels),
    },
  };

  return {
    prismaMock,
    store: {
      labels,
      reset() {
        labels.length = 0;
      },
      add(input: Omit<StoredLabel, "id">) {
        labels.push({ id: `lbl-${labels.length + 1}`, ...input });
      },
    },
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import {
  exportFinancialFactDataset,
  exportUnitScaleDataset,
  serializeDatasetAsJsonl,
} from "@/server/services/training-data-export-service";

describe("training-data-export-service", () => {
  beforeEach(() => {
    store.reset();
    prismaMock.pdfTrainingLabel.findMany.mockClear();
  });

  it("extracts one page-context example with unitScale", async () => {
    store.add({
      filingId: "f1",
      proposedValue: { value: 100, unitScale: 1 },
      acceptedValue: {
        value: 100000,
        rawLabel: "Salgsinntekter",
        unitScale: 1000,
        sourcePage: 3,
        sourceSection: "SUPPLEMENTARY_INCOME",
        statementScope: "COMPANY",
      },
      sourcePayload: { unitDeclarationText: "Belop i NOK 1000" },
    });

    const dataset = await exportUnitScaleDataset();

    expect(dataset.totalExamples).toBe(1);
    const example = [...dataset.train, ...dataset.validation, ...dataset.test][0]!;
    expect(example.features.pageContextText).toContain("Belop i NOK 1000");
    expect(example.features.pageContextText).toContain("Salgsinntekter");
    expect(example.features.rawLabel).toBe(example.features.pageContextText);
    expect(example.features.sourcePage).toBe(3);
    expect(example.label).toBe(1000);
    expect(example.proposedLabel).toBe(1);
  });

  it("deduplicates multiple reviewed rows into one page example", async () => {
    store.add({
      filingId: "f1",
      proposedValue: null,
      acceptedValue: { value: 100, rawLabel: "Operating revenue", unitScale: 1, sourcePage: 5 },
      sourcePayload: null,
    });
    store.add({
      filingId: "f1",
      proposedValue: null,
      acceptedValue: { value: 50, rawLabel: "Driftsresultat", unitScale: 1, sourcePage: 5 },
      sourcePayload: null,
    });

    const dataset = await exportUnitScaleDataset();
    const example = [...dataset.train, ...dataset.validation, ...dataset.test][0]!;

    expect(dataset.totalExamples).toBe(1);
    expect(example.features.pageContextText).toContain("Operating revenue");
    expect(example.features.pageContextText).toContain("Driftsresultat");
  });

  it("skips labels that lack a usable source page", async () => {
    store.add({
      filingId: "f1",
      proposedValue: { value: 100 },
      acceptedValue: { value: 100, rawLabel: "Belop i NOK", unitScale: 1 },
      sourcePayload: null,
    });

    const dataset = await exportUnitScaleDataset();
    expect(dataset.totalExamples).toBe(0);
  });

  it("skips page groups with conflicting accepted unit scales", async () => {
    store.add({
      filingId: "f1",
      proposedValue: null,
      acceptedValue: { value: 100, rawLabel: "Operating revenue", unitScale: 1, sourcePage: 5 },
      sourcePayload: null,
    });
    store.add({
      filingId: "f1",
      proposedValue: null,
      acceptedValue: { value: 100, rawLabel: "Driftsresultat", unitScale: 1000, sourcePage: 5 },
      sourcePayload: null,
    });

    const dataset = await exportUnitScaleDataset();
    expect(dataset.totalExamples).toBe(0);
  });

  it("computes a stable label distribution", async () => {
    for (let i = 0; i < 5; i++) {
      store.add({
        filingId: `f${i}`,
        proposedValue: null,
        acceptedValue: { value: 0, rawLabel: "Belop i NOK", unitScale: 1, sourcePage: 1 },
        sourcePayload: null,
      });
    }
    for (let i = 5; i < 8; i++) {
      store.add({
        filingId: `f${i}`,
        proposedValue: null,
        acceptedValue: { value: 0, rawLabel: "Belop i NOK 1000", unitScale: 1000, sourcePage: 1 },
        sourcePayload: null,
      });
    }

    const dataset = await exportUnitScaleDataset();
    expect(dataset.labelDistribution).toEqual({ "1": 5, "1000": 3 });
  });

  it("splits deterministically and keeps all pages for one filing in one bucket", async () => {
    for (let i = 0; i < 20; i++) {
      store.add({
        filingId: `filing-${i}`,
        proposedValue: null,
        acceptedValue: { value: 0, rawLabel: "Belop i NOK", unitScale: 1, sourcePage: 1 },
        sourcePayload: null,
      });
    }
    store.add({
      filingId: "one-filing-many-pages",
      proposedValue: null,
      acceptedValue: { value: 0, rawLabel: "Belop i NOK", unitScale: 1, sourcePage: 1 },
      sourcePayload: null,
    });
    store.add({
      filingId: "one-filing-many-pages",
      proposedValue: null,
      acceptedValue: { value: 0, rawLabel: "Belop i NOK", unitScale: 1, sourcePage: 2 },
      sourcePayload: null,
    });

    const a = await exportUnitScaleDataset();
    const b = await exportUnitScaleDataset();

    expect(a.train.map((e) => e.filingId).sort()).toEqual(b.train.map((e) => e.filingId).sort());
    expect(a.validation.map((e) => e.filingId).sort()).toEqual(
      b.validation.map((e) => e.filingId).sort(),
    );
    expect(a.test.map((e) => e.filingId).sort()).toEqual(b.test.map((e) => e.filingId).sort());

    const buckets = [a.train, a.validation, a.test].filter((bucket) =>
      bucket.some((example) => example.filingId === "one-filing-many-pages"),
    );
    expect(buckets).toHaveLength(1);
  });

  it("serialises as JSONL with one object per line", async () => {
    store.add({
      filingId: "f1",
      proposedValue: null,
      acceptedValue: { value: 0, rawLabel: "Belop i NOK", unitScale: 1, sourcePage: 1 },
      sourcePayload: null,
    });

    const dataset = await exportUnitScaleDataset();
    const { trainJsonl, validationJsonl, testJsonl } = serializeDatasetAsJsonl(dataset);

    const total = [trainJsonl, validationJsonl, testJsonl]
      .filter((s) => s.length > 0)
      .map((s) => s.split("\n").length)
      .reduce((a, b) => a + b, 0);

    expect(total).toBe(1);
    const allLines = [trainJsonl, validationJsonl, testJsonl].join("\n").trim();
    const parsed = JSON.parse(allLines);
    expect(parsed.features.rawLabel).toContain("Belop i NOK");
    expect(parsed.features.pageContextText).toContain("Belop i NOK");
    expect(parsed.label).toBe(1);
  });

  it("exports supervised financial fact examples from reviewed facts", async () => {
    store.add({
      filingId: "jotun-2024",
      proposedValue: { metricKey: "total_equity", value: 21661000000 },
      acceptedValue: {
        metricKey: "total_equity",
        value: 21661000000,
        rawLabel: "Sum egenkapital",
        fiscalYear: 2024,
        unitScale: 1,
        sourcePage: 7,
        sourceSection: "STATUTORY_BALANCE_CONTINUATION",
        statementType: "BALANCE_SHEET",
        statementScope: "CONSOLIDATED",
      },
      sourcePayload: {
        sourceRowText: "Sum egenkapital 21 661 000 000 18 325 000 000",
        noteReference: null,
      },
    });
    store.add({
      filingId: "jotun-2024",
      proposedValue: { metricKey: "total_assets", value: 49876000000 },
      acceptedValue: {
        metricKey: "total_assets",
        value: 49876000000,
        rawLabel: "SUM EIENDELER",
        fiscalYear: 2024,
        unitScale: 1,
        sourcePage: 7,
        sourceSection: "STATUTORY_BALANCE_CONTINUATION",
        statementType: "BALANCE_SHEET",
        statementScope: "CONSOLIDATED",
      },
      sourcePayload: {
        sourceRowText: "SUM EIENDELER 49 876 000 000 43 792 000 000",
        noteReference: null,
      },
    });

    const dataset = await exportFinancialFactDataset();
    const example = [...dataset.train, ...dataset.validation, ...dataset.test].find(
      (candidate) => candidate.label === "total_equity",
    )!;

    expect(dataset.taskType).toBe("OTHER");
    expect(dataset.totalExamples).toBe(2);
    expect(dataset.labelDistribution).toEqual({ total_assets: 1, total_equity: 1 });
    expect(example.label).toBe("total_equity");
    expect(example.proposedLabel).toBe("total_equity");
    expect(example.features.factContextText).toContain("page=7");
    expect(example.features.factContextText).toContain("scope=CONSOLIDATED");
    expect(example.features.factContextText).toContain("label=Sum egenkapital");
    expect(example.features.factContextText).toContain("value=21661000000");
    expect(example.features.factContextText).toContain("nearbyRow1=SUM EIENDELER");
    expect(example.features.nearbyRows).toEqual([
      "SUM EIENDELER | SUM EIENDELER 49 876 000 000 43 792 000 000",
    ]);
  });

  it("skips financial fact labels without a metric key or row text", async () => {
    store.add({
      filingId: "f1",
      proposedValue: null,
      acceptedValue: { value: 100 },
      sourcePayload: null,
    });

    const dataset = await exportFinancialFactDataset();
    expect(dataset.totalExamples).toBe(0);
  });
});
