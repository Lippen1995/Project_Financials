import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

import { NJORD_EVAL_SET_V1 } from "@/server/ai-search/evaluation/eval-set-v1";
import {
  evaluateNjordRun,
  type NjordEvaluationObservation,
} from "@/server/ai-search/evaluation/evaluator";

const evidenceKindSchema = z.enum([
  "DOCUMENTED_FACT",
  "CALCULATION",
  "EXPLANATION",
]);
const sourceSchema = z.object({
  citationId: z.string().trim().min(1).max(500),
  sourceSystem: z.string().trim().min(1).max(100),
  sourceEntityType: z.string().trim().min(1).max(100),
  sourceId: z.string().trim().min(1).max(500),
  fetchedAt: z.string().datetime(),
  normalizedAt: z.string().datetime(),
  label: z.string().nullable(),
  sourceUrl: z.string().url().nullable(),
  tool: z.string().trim().min(1).max(100),
  toolVersion: z.string().regex(/^v\d+$/).nullable(),
  kind: evidenceKindSchema,
}).strict();
const observationSchema = z.object({
  caseId: z.string().min(1),
  status: z.number().int().min(100).max(599),
  result: z.object({
    answer: z.string().nullable(),
    invocations: z.array(z.object({
      name: z.string().trim().min(1).max(100),
      arguments: z.unknown(),
      ok: z.boolean(),
      error: z.string().optional(),
    }).strict()),
    toolResults: z.array(z.object({
      name: z.string().trim().min(1).max(100),
      toolVersion: z.string().regex(/^v\d+$/).optional(),
      outputKind: evidenceKindSchema.optional(),
      dataDomains: z.array(z.string()).optional(),
      output: z.unknown(),
    }).strict()),
    claimEvidence: z.object({
      claims: z.array(z.object({
        text: z.string(),
        kind: evidenceKindSchema,
        citationIds: z.array(z.string()),
        sources: z.array(sourceSchema),
      }).strict()),
      sources: z.array(sourceSchema),
      invalidCitationIds: z.array(z.string()),
      uncitedLines: z.array(z.string()),
    }).strict(),
    stopReason: z.enum(["final", "max_turns", "max_tool_calls"]),
  }).strict().nullable(),
}).strict();

const fileSchema = z.object({
  adapter: z.string().trim().min(1).max(100),
  model: z.string().trim().min(1).max(100),
  observations: z.array(observationSchema),
}).strict();

const paths = process.argv.slice(2);
if (paths.length === 0) {
  process.stdout.write(JSON.stringify({
    version: "njord-evaluation-manifest-v1",
    evaluationSet: "njord-eval-v1",
    caseCount: NJORD_EVAL_SET_V1.length,
    expectedFactCount: NJORD_EVAL_SET_V1.reduce(
      (count, testCase) => count + (testCase.expectedFacts?.length ?? 0),
      0,
    ),
    note: "Pass one or more JSON observation files to compare adapters without running paid models.",
  }, null, 2));
  process.stdout.write("\n");
  process.exit(0);
}

const reports = paths.map((path) => {
  const parsed = fileSchema.parse(JSON.parse(readFileSync(resolve(path), "utf8")));
  return {
    adapter: parsed.adapter,
    model: parsed.model,
    ...evaluateNjordRun(
      NJORD_EVAL_SET_V1,
      parsed.observations as NjordEvaluationObservation[],
    ),
  };
});

reports.sort((a, b) => b.passRate - a.passRate || a.adapter.localeCompare(b.adapter));
process.stdout.write(JSON.stringify({
  version: "njord-model-comparison-v1",
  evaluationSet: "njord-eval-v1",
  reports,
}, null, 2));
process.stdout.write("\n");
