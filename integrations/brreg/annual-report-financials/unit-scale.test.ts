import { describe, expect, it } from "vitest";

import { detectUnitScale } from "@/integrations/brreg/annual-report-financials/unit-scale";
import { AnnualReportParsedPage } from "@/integrations/brreg/annual-report-financials/types";

describe("detectUnitScale", () => {
  it("detects whole NOK declarations", () => {
    const result = detectUnitScale("Belop i: NOK Resultatregnskap for 2024");

    expect(result.unitScale).toBe(1);
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  it("detects NOK 1000 declarations", () => {
    const result = detectUnitScale("Belop i NOK 1 000. Balanse per 31.12.");

    expect(result.unitScale).toBe(1000);
    expect(result.confidence).toBeGreaterThan(0.9);
  });

  it("detects TNOK shorthand declarations", () => {
    const result = detectUnitScale("Resultatregnskap for 2024 TNOK");

    expect(result.unitScale).toBe(1000);
    expect(result.confidence).toBeGreaterThan(0.9);
  });

  it("detects note-level NOK 1.000 declarations", () => {
    const result = detectUnitScale(
      "Alle tall i notene er NOK 1.000 dersom annet ikke er oppgitt.",
    );

    expect(result.unitScale).toBe(1000);
    expect(result.confidence).toBeGreaterThan(0.9);
  });

  it("returns null when no declaration is present", () => {
    const result = detectUnitScale("Balanse per 31.12.2024");

    expect(result.unitScale).toBeNull();
  });

  it("blocks conflicting whole-NOK and NOK-1000 declarations", () => {
    const result = detectUnitScale("Belop i: NOK. Alle tall i notene er NOK 1 000.");

    expect(result.unitScale).toBeNull();
    expect(result.conflictingSignals).toBe(true);
  });

  it("detects note-level scale from structured page blocks when the declaration is preserved", () => {
    const notePage: AnnualReportParsedPage = {
      pageNumber: 7,
      text: "Noter til regnskapet\nAlle tall i notene er NOK 1.000 dersom annet ikke er oppgitt\nNote 8 Bankinnskudd, kontanter o.l. 15558 14001",
      normalizedText:
        "noter til regnskapet\nalle tall i notene er nok 1.000 dersom annet ikke er oppgitt\nnote 8 bankinnskudd kontanter o.l. 15558 14001",
      hasEmbeddedText: true,
      lines: [],
      blocks: [
        {
          id: "note-heading",
          kind: "heading",
          rawType: "heading",
          text: "Noter til regnskapet",
          normalizedText: "noter til regnskapet",
          bbox: { left: 72, bottom: 710, right: 320, top: 740 },
          source: {
            engine: "OPENDATALOADER",
            engineMode: "local",
            sourceElementId: "note-heading",
            sourceRawType: "heading",
            order: 0,
          },
        },
        {
          id: "note-scale",
          kind: "paragraph",
          rawType: "paragraph",
          text: "Alle tall i notene er NOK 1.000 dersom annet ikke er oppgitt",
          normalizedText: "alle tall i notene er nok 1.000 dersom annet ikke er oppgitt",
          bbox: { left: 72, bottom: 680, right: 520, top: 705 },
          source: {
            engine: "OPENDATALOADER",
            engineMode: "local",
            sourceElementId: "note-scale",
            sourceRawType: "paragraph",
            order: 1,
          },
        },
      ],
      tables: [],
      source: {
        engine: "OPENDATALOADER",
        engineMode: "local",
        sourceElementId: "page-7",
        sourceRawType: "page",
        order: 7,
      },
    };

    const result = detectUnitScale(notePage);

    expect(result.unitScale).toBe(1000);
    expect(result.confidence).toBeGreaterThan(0.9);
  });

  it("keeps note-level scale uncertain when the structured page only contains a note caption", () => {
    const notePage: AnnualReportParsedPage = {
      pageNumber: 4,
      text: "Note 8 Bankinnskudd, kontanter o.l. 15558 14001",
      normalizedText: "note 8 bankinnskudd kontanter o.l. 15558 14001",
      hasEmbeddedText: true,
      lines: [],
      blocks: [
        {
          id: "note-caption",
          kind: "caption",
          rawType: "caption",
          text: "Note 8 Bankinnskudd, kontanter o.l. 15558 14001",
          normalizedText: "note 8 bankinnskudd kontanter o.l. 15558 14001",
          bbox: { left: 72, bottom: 730, right: 520, top: 760 },
          source: {
            engine: "OPENDATALOADER",
            engineMode: "local",
            sourceElementId: "note-caption",
            sourceRawType: "caption",
            order: 0,
          },
        },
      ],
      tables: [],
      source: {
        engine: "OPENDATALOADER",
        engineMode: "local",
        sourceElementId: "page-4",
        sourceRawType: "page",
        order: 4,
      },
    };

    const result = detectUnitScale(notePage);

    expect(result.unitScale).toBeNull();
    expect(result.confidence).toBe(0);
  });
});
