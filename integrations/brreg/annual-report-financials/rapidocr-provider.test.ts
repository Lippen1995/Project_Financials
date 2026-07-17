import { describe, expect, it } from "vitest";

import { parseRapidOcrPayload } from "@/integrations/brreg/annual-report-financials/rapidocr-provider";

describe("parseRapidOcrPayload", () => {
  it("preserves verbatim text, confidence, and geometry from the sidecar", () => {
    const result = parseRapidOcrPayload(JSON.stringify({
      engine: "rapidocr",
      pages: [{
        pageNumber: 38,
        text: "President & CEO",
        lines: [{
          text: "President & CEO",
          confidence: 0.9701,
          box: [[1910, 1063], [2001, 1063], [2001, 1083], [1910, 1083]],
        }],
      }],
    }));

    expect(result.pages[0]?.text).toBe("President & CEO");
    expect(result.pages[0]?.blocks[0]).toMatchObject({
      text: "President & CEO",
      bbox: { left: 1910, bottom: 1063, right: 2001, top: 1083 },
      metadata: { confidence: 0.9701 },
    });
  });

  it("rejects malformed sidecar output", () => {
    expect(() => parseRapidOcrPayload('{"error":"bad input"}')).toThrow(
      "RapidOCR sidecar returned an invalid payload",
    );
  });
});
