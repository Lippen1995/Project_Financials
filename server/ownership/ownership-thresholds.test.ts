import { describe, expect, it } from "vitest";

import {
  ASSOCIATED_THRESHOLD_PERCENT,
  CONTROL_THRESHOLD_PERCENT,
  classifyRelationship,
  isControlling,
  relationshipLabel,
} from "@/server/ownership/ownership-thresholds";

describe("classifyRelationship", () => {
  it("treats strictly more than 50 % as a subsidiary", () => {
    expect(classifyRelationship(50.0001)).toBe("SUBSIDIARY");
    expect(classifyRelationship(66.7)).toBe("SUBSIDIARY");
    expect(classifyRelationship(100)).toBe("SUBSIDIARY");
  });

  it("treats exactly 50 % as associated, not controlling", () => {
    // 50 % does not confer control under the >50 % rule.
    expect(classifyRelationship(50)).toBe("ASSOCIATED");
    expect(isControlling(50)).toBe(false);
  });

  it("treats 20 % up to and including 50 % as associated", () => {
    expect(classifyRelationship(20)).toBe("ASSOCIATED");
    expect(classifyRelationship(33.33)).toBe("ASSOCIATED");
    expect(classifyRelationship(49.99)).toBe("ASSOCIATED");
  });

  it("treats less than 20 % as minority", () => {
    expect(classifyRelationship(19.99)).toBe("MINORITY");
    expect(classifyRelationship(0.5)).toBe("MINORITY");
    expect(classifyRelationship(0)).toBe("MINORITY");
  });

  it("falls back to minority when the percentage is unknown", () => {
    expect(classifyRelationship(null)).toBe("MINORITY");
    expect(classifyRelationship(undefined)).toBe("MINORITY");
    expect(classifyRelationship(Number.NaN)).toBe("MINORITY");
  });

  it("uses thresholds consistent with the exported constants", () => {
    expect(CONTROL_THRESHOLD_PERCENT).toBe(50);
    expect(ASSOCIATED_THRESHOLD_PERCENT).toBe(20);
    expect(classifyRelationship(CONTROL_THRESHOLD_PERCENT + 0.000001)).toBe("SUBSIDIARY");
    expect(classifyRelationship(ASSOCIATED_THRESHOLD_PERCENT - 0.000001)).toBe("MINORITY");
  });
});

describe("isControlling", () => {
  it("is true only above the control threshold", () => {
    expect(isControlling(50.01)).toBe(true);
    expect(isControlling(50)).toBe(false);
    expect(isControlling(20)).toBe(false);
    expect(isControlling(null)).toBe(false);
  });
});

describe("relationshipLabel", () => {
  it("maps relationships to Norwegian labels", () => {
    expect(relationshipLabel("SUBSIDIARY")).toBe("Datterselskap");
    expect(relationshipLabel("ASSOCIATED")).toBe("Tilknyttet selskap");
    expect(relationshipLabel("MINORITY")).toBe("Minoritetspost");
  });
});
