import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

import { NJORD_EVAL_SET_V1 } from "@/server/ai-search/evaluation/eval-set-v1";
import {
  evaluateNjordRun,
  type NjordEvaluationObservation,
} from "@/server/ai-search/evaluation/evaluator";

const observationSchema = z.object({
  caseId: z.string().min(1),
  answer: z.string().nullable(),
  toolNames: z.array(z.string()),
  evidenceKinds: z.array(z.enum(["DOCUMENTED_FACT", "CALCULATION", "EXPLANATION"])),
  ungroundedOrgNumbers: z.array(z.string().regex(/^\d{9}$/)),
  outcome: z.enum(["GROUNDED_ANSWER", "UNAVAILABLE", "REFUSAL"]),
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
