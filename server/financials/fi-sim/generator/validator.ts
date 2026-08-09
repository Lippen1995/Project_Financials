import {
  FI_SIM_BALANCE_IDENTITY,
  FI_SIM_CALCULATIONS,
} from "../catalog/calculations";
import { FI_SIM_TAXONOMY_VERSION, findConcept } from "../catalog/concepts";
import { permittedConcepts } from "../catalog/profiles";
import { conceptQName, type FiSimGeneratedPackage, type FiSimGeneratedStatement } from "./generator";

/**
 * The validator, from spec section 9.2 step 8 and section 14.
 *
 * It deliberately re-derives everything from the catalog rather than trusting the generator's own
 * bookkeeping: it walks `FI_SIM_CALCULATIONS` and the balance equation over the produced lines the
 * way the presentation layer will, so an identity the generator thought it had solved and an
 * identity that actually holds are two separate claims.
 *
 * A statement passes only when every identity is exact. The residual line is the single permitted
 * exception, and only for the one identity it was recorded against — that is what "must hold
 * exactly after residual handling" means.
 */

export type FiSimValidationIssue = {
  fiscalYear: number;
  statementFamily: "INCOME_STATEMENT" | "BALANCE_SHEET";
  identityId: string;
  message: string;
};

export type FiSimValidationResult = {
  valid: boolean;
  issues: FiSimValidationIssue[];
};

function checkStatement(
  statement: FiSimGeneratedStatement,
  context: { fiscalYear: number; permitted: ReadonlySet<string>; anchorsAllowed: boolean },
): FiSimValidationIssue[] {
  const issues: FiSimValidationIssue[] = [];
  const family = statement.statementFamily;
  const issue = (identityId: string, message: string) =>
    issues.push({ fiscalYear: context.fiscalYear, statementFamily: family, identityId, message });

  const values = new Map<string, bigint>();
  const seen = new Set<string>();
  for (const line of statement.lines) {
    if (seen.has(line.conceptKey)) {
      issue(line.conceptKey, "The same concept is published twice on one statement");
    }
    seen.add(line.conceptKey);
    values.set(line.conceptKey, line.resolvedValue);

    const concept = findConcept(line.conceptKey);
    if (!concept) {
      issue(line.conceptKey, `${line.conceptKey} is not a concept in ${FI_SIM_TAXONOMY_VERSION}`);
      continue;
    }
    if (concept.statementFamily !== family) {
      issue(line.conceptKey, `${line.conceptKey} does not belong on a ${family}`);
    }
    if (line.conceptQName !== conceptQName(line.conceptKey)) {
      issue(line.conceptKey, "Qualified name does not match the concept key");
    }
    if (line.sourceLabel !== concept.sourceLabel || line.sortOrder !== concept.sortOrder) {
      issue(line.conceptKey, "Label or presentation order does not match the catalog");
    }

    // Spec section 3.2: exactly one of a reported anchor reference and a synthetic value.
    const hasAnchor = line.reportedFinancialLineItemId !== null;
    const hasSynthetic = line.syntheticValue !== null;
    if (hasAnchor === hasSynthetic) {
      issue(line.conceptKey, "A line must reference a reported anchor or carry a synthetic value");
    }
    if (hasAnchor && !context.anchorsAllowed) {
      issue(line.conceptKey, "A simulated statement cannot reference a reported anchor");
    }
    if (hasSynthetic && line.derivationRuleId === null) {
      issue(line.conceptKey, "A synthetic value must say which rule derived it");
    }
    if (hasAnchor && line.derivationRuleId !== null) {
      issue(line.conceptKey, "A reported anchor is referenced, not derived");
    }
    if (hasSynthetic && line.syntheticValue !== line.resolvedValue) {
      issue(line.conceptKey, "The synthetic value and the resolved value disagree");
    }
    // A concept outside the profile is allowed only because the company reported it.
    if (!context.permitted.has(line.conceptKey) && !hasAnchor) {
      issue(line.conceptKey, `${line.conceptKey} is not permitted by the statement's profile`);
    }
  }

  const residual = statement.residual;
  if (residual) {
    const published = values.get(residual.conceptKey);
    if (published !== residual.amount) {
      issue(residual.identityId, "The residual line does not carry the recorded difference");
    }
  }

  for (const relationship of FI_SIM_CALCULATIONS) {
    if (relationship.statementFamily !== family) continue;
    const parent = values.get(relationship.parentConceptKey);
    if (parent === undefined) continue;

    let sum = 0n;
    for (const operand of relationship.operands) {
      const value = values.get(operand.conceptKey);
      // Spec section 8: an absent optional child is absent, never a published zero.
      if (value === undefined) continue;
      sum += BigInt(operand.weight) * value;
    }
    const allowance = residual?.identityId === relationship.parentConceptKey ? residual.amount : 0n;
    if (parent !== sum + allowance) {
      issue(
        relationship.parentConceptKey,
        `${relationship.parentConceptKey} is ${parent} but its children sum to ${sum + allowance}`,
      );
    }
  }

  if (family === "BALANCE_SHEET") {
    const left = values.get(FI_SIM_BALANCE_IDENTITY.left);
    const right = values.get(FI_SIM_BALANCE_IDENTITY.right);
    if (left === undefined || right === undefined) {
      issue("BalanceEquation", "A balance sheet must publish both sides of the balance equation");
    } else {
      const allowance = residual?.identityId === "BalanceEquation" ? residual.amount : 0n;
      if (left !== right + allowance) {
        issue("BalanceEquation", `Assets are ${left} but equity and liabilities are ${right}`);
      }
    }
  }

  return issues;
}

export function validatePackage(pkg: FiSimGeneratedPackage): FiSimValidationResult {
  const permitted = permittedConcepts(pkg.profile);
  const issues = [
    ...checkStatement(pkg.income, {
      fiscalYear: pkg.fiscalYear,
      permitted,
      anchorsAllowed: pkg.income.statementOrigin === "HYBRID",
    }),
    ...checkStatement(pkg.balance, {
      fiscalYear: pkg.fiscalYear,
      permitted,
      anchorsAllowed: pkg.balance.statementOrigin === "HYBRID",
    }),
  ];

  if (pkg.periodEnd < pkg.periodStart) {
    issues.push({
      fiscalYear: pkg.fiscalYear,
      statementFamily: "INCOME_STATEMENT",
      identityId: "Period",
      message: "The period ends before it starts",
    });
  }
  if (pkg.periodStart.getUTCFullYear() !== pkg.fiscalYear) {
    issues.push({
      fiscalYear: pkg.fiscalYear,
      statementFamily: "INCOME_STATEMENT",
      identityId: "Period",
      message: "The period does not belong to its fiscal year",
    });
  }

  const bridge = pkg.bridge;
  const bridged =
    bridge.openingAccumulatedResults +
    bridge.profitForPeriod -
    bridge.assumedDistribution +
    bridge.explicitCapitalAdjustment;
  if (bridged !== bridge.closingAccumulatedResults) {
    issues.push({
      fiscalYear: pkg.fiscalYear,
      statementFamily: "BALANCE_SHEET",
      identityId: "AccumulatedResultsBridge",
      message: `The bridge closes at ${bridge.closingAccumulatedResults} but its steps sum to ${bridged}`,
    });
  }

  return { valid: issues.length === 0, issues };
}

export function validatePackages(packages: readonly FiSimGeneratedPackage[]): FiSimValidationResult {
  const issues = packages.flatMap((pkg) => validatePackage(pkg).issues);
  return { valid: issues.length === 0, issues };
}
