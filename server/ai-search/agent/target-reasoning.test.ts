import { describe, expect, it } from "vitest";

import { buildTargetReasoningPrompt } from "./target-reasoning";

describe("buildTargetReasoningPrompt", () => {
  it("requires one claim per line with exact citation IDs supplied by tools", () => {
    const prompt = buildTargetReasoningPrompt();

    expect(prompt).toContain("one factual or calculated claim per line");
    expect(prompt).toContain("[source:1]");
    expect(prompt).toContain("[calculation:1]");
    expect(prompt).toContain("[knowledge:");
  });
});
