import { z } from "zod";

import type { FinancialDatasetVersion } from "@/lib/types";

const reportedDatasetVersionSchema = z.string().regex(/^reported:\d+$/);
const simulatedDatasetVersionSchema = z
  .string()
  .regex(/^simulated:[A-Za-z0-9_-]+:\d+$/);
const financialDatasetVersionSchema = z.union([
  reportedDatasetVersionSchema,
  simulatedDatasetVersionSchema,
]) as z.ZodType<FinancialDatasetVersion>;

const liveFinancialLineSchema = z.object({
  liveLineId: z.string().min(1),
  liveStatementId: z.string().min(1),
  reportedFinancialLineItemId: z.string().min(1).nullable(),
  statementType: z.enum(["INCOME_STATEMENT", "BALANCE_SHEET"]),
  conceptKey: z.string().min(1).nullable(),
  sourceLabel: z.string().min(1).nullable(),
  metricKey: z.string().min(1).nullable(),
  value: z.bigint().nullable(),
  valueOrigin: z.enum(["reported", "synthetic"]),
  statementOrigin: z.enum(["reported", "hybrid", "simulated"]),
  financialDatasetVersion: financialDatasetVersionSchema,
  taxonomyVersion: z.string().min(1).nullable(),
  generatorVersion: z.string().min(1).nullable(),
  currency: z.string().length(3),
  unitScale: z.number().int().positive(),
  sortOrder: z.number().int(),
  reportedSourceSystem: z.string().min(1).nullable(),
  reportedSourceId: z.string().min(1).nullable(),
  sourceSystem: z.string().min(1),
  sourceEntityType: z.string().min(1),
  sourceId: z.string().min(1),
  fetchedAt: z.date(),
  normalizedAt: z.date(),
  rawPayload: z.unknown().nullish(),
  derivationRuleId: z.string().min(1).nullable(),
});

const liveFinancialStatementSchema = z
  .object({
    liveStatementId: z.string().min(1),
    reportedStatementId: z.string().min(1).nullable(),
    companyId: z.string().min(1),
    fiscalYear: z.number().int(),
    statementScope: z.enum(["COMPANY", "CONSOLIDATED"]),
    statementOrigin: z.enum(["reported", "hybrid", "simulated"]),
    financialDatasetVersion: financialDatasetVersionSchema,
    taxonomyVersion: z.string().min(1).nullable(),
    generatorVersion: z.string().min(1).nullable(),
    sourceSystem: z.string().min(1),
    sourceEntityType: z.string().min(1),
    sourceId: z.string().min(1),
    fetchedAt: z.date(),
    normalizedAt: z.date(),
    rawPayload: z.unknown().nullish(),
    currency: z.string().length(3),
    unitScale: z.number().int().positive(),
    periodStart: z.date().nullable(),
    periodEnd: z.date().nullable(),
    revenue: z.bigint().nullable(),
    operatingProfit: z.bigint().nullable(),
    netIncome: z.bigint().nullable(),
    equity: z.bigint().nullable(),
    assets: z.bigint().nullable(),
    lines: z.array(liveFinancialLineSchema),
  })
  .superRefine((statement, context) => {
    const isReportedStatement = statement.statementOrigin === "reported";
    const expectedStatementPrefix = isReportedStatement ? "reported:" : "simulated:";
    const expectedDatasetPrefix = isReportedStatement ? "reported:" : "simulated:";

    if (!statement.liveStatementId.startsWith(expectedStatementPrefix)) {
      context.addIssue({
        code: "custom",
        path: ["liveStatementId"],
        message: `liveStatementId must start with ${expectedStatementPrefix}`,
      });
    }
    if (!statement.financialDatasetVersion.startsWith(expectedDatasetPrefix)) {
      context.addIssue({
        code: "custom",
        path: ["financialDatasetVersion"],
        message: `financialDatasetVersion must start with ${expectedDatasetPrefix}`,
      });
    }

    if (isReportedStatement) {
      if (statement.reportedStatementId === null) {
        context.addIssue({
          code: "custom",
          path: ["reportedStatementId"],
          message: "reported statements require reportedStatementId",
        });
      }
      if (statement.taxonomyVersion !== null || statement.generatorVersion !== null) {
        context.addIssue({
          code: "custom",
          path: ["taxonomyVersion"],
          message: "reported statements cannot carry simulation provenance",
        });
      }
    } else {
      if (
        statement.sourceSystem !== "FI-SIM" ||
        statement.sourceEntityType !== "simulatedFinancialStatement" ||
        statement.sourceId !== statement.liveStatementId
      ) {
        context.addIssue({
          code: "custom",
          path: ["sourceSystem"],
          message:
            "hybrid and simulated statements require FI-SIM provenance bound to the live statement ID",
        });
      }
      if (statement.reportedStatementId !== null) {
        context.addIssue({
          code: "custom",
          path: ["reportedStatementId"],
          message: "simulated live statements cannot use a reported statement ID",
        });
      }
      if (!statement.taxonomyVersion?.match(/^FI-SIM-\d{4}\.\d+$/)) {
        context.addIssue({
          code: "custom",
          path: ["taxonomyVersion"],
          message: "taxonomyVersion is required for hybrid and simulated statements",
        });
      }
      if (statement.generatorVersion === null) {
        context.addIssue({
          code: "custom",
          path: ["generatorVersion"],
          message: "generatorVersion is required for hybrid and simulated statements",
        });
      }
    }

    let reportedLineCount = 0;
    let syntheticLineCount = 0;
    statement.lines.forEach((line, index) => {
      if (line.valueOrigin === "reported") reportedLineCount += 1;
      if (line.valueOrigin === "synthetic") syntheticLineCount += 1;

      if (line.liveStatementId !== statement.liveStatementId) {
        context.addIssue({
          code: "custom",
          path: ["lines", index, "liveStatementId"],
          message: "line must belong to its enclosing live statement",
        });
      }
      if (!line.liveLineId.startsWith(expectedStatementPrefix)) {
        context.addIssue({
          code: "custom",
          path: ["lines", index, "liveLineId"],
          message: `liveLineId must start with ${expectedStatementPrefix}`,
        });
      }
      if (line.financialDatasetVersion !== statement.financialDatasetVersion) {
        context.addIssue({
          code: "custom",
          path: ["lines", index, "financialDatasetVersion"],
          message: "line and statement dataset versions must match",
        });
      }
      if (line.statementOrigin !== statement.statementOrigin) {
        context.addIssue({
          code: "custom",
          path: ["lines", index, "statementOrigin"],
          message: "line and statement origins must match",
        });
      }
      if (line.valueOrigin === "reported" && line.reportedFinancialLineItemId === null) {
        context.addIssue({
          code: "custom",
          path: ["lines", index, "reportedFinancialLineItemId"],
          message: "reported lines require a reported source line ID",
        });
      }
      if (line.valueOrigin === "synthetic" && line.reportedFinancialLineItemId !== null) {
        context.addIssue({
          code: "custom",
          path: ["lines", index, "reportedFinancialLineItemId"],
          message: "synthetic lines cannot reference a reported source line ID",
        });
      }
      if (
        line.valueOrigin === "reported" &&
        (line.reportedSourceSystem === null || line.reportedSourceId === null)
      ) {
        context.addIssue({
          code: "custom",
          path: ["lines", index, "reportedSourceSystem"],
          message: "reported lines require reported source metadata",
        });
      }
      if (
        line.valueOrigin === "synthetic" &&
        (line.reportedSourceSystem !== null || line.reportedSourceId !== null)
      ) {
        context.addIssue({
          code: "custom",
          path: ["lines", index, "reportedSourceSystem"],
          message: "synthetic lines cannot carry reported source metadata",
        });
      }
      if (line.valueOrigin === "reported") {
        if (
          line.sourceSystem !== line.reportedSourceSystem ||
          line.sourceId !== line.reportedSourceId ||
          line.derivationRuleId !== null
        ) {
          context.addIssue({
            code: "custom",
            path: ["lines", index, "sourceSystem"],
            message: "reported line provenance must match its reported source",
          });
        }
      } else if (
        line.sourceSystem !== "FI-SIM" ||
        line.sourceEntityType !== "simulatedFinancialLine" ||
        line.sourceId !== line.liveLineId ||
        line.derivationRuleId === null
      ) {
        context.addIssue({
          code: "custom",
          path: ["lines", index, "sourceSystem"],
          message: "synthetic lines require FI-SIM source and derivation provenance",
        });
      }
      if (isReportedStatement) {
        if (line.taxonomyVersion !== null || line.generatorVersion !== null) {
          context.addIssue({
            code: "custom",
            path: ["lines", index, "taxonomyVersion"],
            message: "reported lines cannot carry simulation provenance",
          });
        }
      } else if (
        line.taxonomyVersion !== statement.taxonomyVersion ||
        line.generatorVersion !== statement.generatorVersion
      ) {
        context.addIssue({
          code: "custom",
          path: ["lines", index, "taxonomyVersion"],
          message: "line simulation provenance must match its statement",
        });
      }
    });

    if (statement.statementOrigin === "reported" && syntheticLineCount > 0) {
      context.addIssue({
        code: "custom",
        path: ["statementOrigin"],
        message: "reported statements cannot contain synthetic lines",
      });
    }
    if (statement.statementOrigin === "simulated" && reportedLineCount > 0) {
      context.addIssue({
        code: "custom",
        path: ["statementOrigin"],
        message: "simulated statements cannot contain reported lines",
      });
    }
    if (
      statement.statementOrigin === "hybrid" &&
      (reportedLineCount === 0 || syntheticLineCount === 0)
    ) {
      context.addIssue({
        code: "custom",
        path: ["statementOrigin"],
        message: "hybrid statements require both reported and synthetic lines",
      });
    }
  });

export type { FinancialDatasetVersion } from "@/lib/types";
export type LiveFinancialLine = z.infer<typeof liveFinancialLineSchema>;
export type LiveFinancialStatement = z.infer<typeof liveFinancialStatementSchema>;

export function parseLiveFinancialStatement(input: unknown): LiveFinancialStatement {
  return liveFinancialStatementSchema.parse(input);
}
