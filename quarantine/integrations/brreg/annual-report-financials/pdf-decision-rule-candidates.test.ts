import { describe, expect, it } from "vitest";

import { normalizePdfDecisionRuleConfig } from "./pdf-decision-rule-config";
import {
  DEFAULT_PDF_DECISION_RULE_CANDIDATES,
  getPdfDecisionRuleCandidateById,
  listPdfDecisionRuleCandidates,
  PDF_DECISION_RULE_CANDIDATE_SET,
  PDF_DECISION_RULE_CANDIDATE_SET_VERSION,
} from "./pdf-decision-rule-candidates";

describe("PDF Decision rule candidate registry", () => {
  it("has a versioned candidate set with unique ids", () => {
    const ids = PDF_DECISION_RULE_CANDIDATE_SET.candidates.map((candidate) => candidate.id);

    expect(PDF_DECISION_RULE_CANDIDATE_SET.version).toBe(PDF_DECISION_RULE_CANDIDATE_SET_VERSION);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("returns default candidates from the registry", () => {
    const candidates = listPdfDecisionRuleCandidates();

    expect(candidates.map((candidate) => candidate.id)).toEqual(
      DEFAULT_PDF_DECISION_RULE_CANDIDATES.map((candidate) => candidate.id),
    );
    expect(candidates.every((candidate) => candidate.rationale && candidate.expectedEffect)).toBe(true);
  });

  it("filters by family", () => {
    const candidates = listPdfDecisionRuleCandidates({ family: "PAGE_HINT_SENSITIVE" });

    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.every((candidate) => candidate.family === "PAGE_HINT_SENSITIVE")).toBe(true);
  });

  it("gets candidates by id", () => {
    const candidate = getPdfDecisionRuleCandidateById("reward-reliable-page-hints");

    expect(candidate).toMatchObject({
      id: "reward-reliable-page-hints",
      family: "PAGE_HINT_SENSITIVE",
    });
  });

  it("contains valid rule config overrides", () => {
    for (const candidate of PDF_DECISION_RULE_CANDIDATE_SET.candidates) {
      expect(() => normalizePdfDecisionRuleConfig(candidate.ruleConfigOverride)).not.toThrow();
    }
  });
});
