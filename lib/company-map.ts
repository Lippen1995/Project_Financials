import { z } from "zod";

const organisationFormsSchema = z
  .string()
  .default("AS,ASA")
  .transform((value, context) => {
    const values = value
      .split(",")
      .map((item) => item.trim().toLocaleUpperCase("nb-NO"))
      .filter(Boolean);
    if (values.length === 1 && values[0] === "ALL") return null;
    if (values.includes("ALL")) {
      context.addIssue({
        code: "custom",
        message: "ALL cannot be combined with organisation forms.",
      });
      return z.NEVER;
    }
    if (
      values.length === 0 ||
      values.length > 6 ||
      values.some((item) => !/^[A-ZÆØÅ0-9]{1,12}$/.test(item))
    ) {
      context.addIssue({
        code: "custom",
        message: "Invalid organisation-form filter.",
      });
      return z.NEVER;
    }
    return [...new Set(values)];
  });

const companyStatusesSchema = z
  .string()
  .default("ACTIVE")
  .transform((value, context) => {
    const allowed = new Set(["ACTIVE", "DISSOLVED", "BANKRUPT"]);
    const values = value
      .split(",")
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean);
    if (
      values.length === 0 ||
      values.length > 3 ||
      values.some((item) => !allowed.has(item))
    ) {
      context.addIssue({
        code: "custom",
        message: "Invalid company-status filter.",
      });
      return z.NEVER;
    }
    return [...new Set(values)] as Array<"ACTIVE" | "DISSOLVED" | "BANKRUPT">;
  });

export const companyMapCoverageQuerySchema = z.preprocess(
  (value) =>
    value instanceof URLSearchParams
      ? Object.fromEntries(value.entries())
      : value,
  z.object({
    organisationForms: organisationFormsSchema,
    companyStatuses: companyStatusesSchema,
  }),
);

export type CompanyMapCoverageQuery = z.infer<
  typeof companyMapCoverageQuerySchema
>;
