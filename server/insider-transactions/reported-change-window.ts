export type ReportedChangeAction = "PURCHASE" | "SALE" | "SUBSCRIPTION" | "OTHER";

export type ReportedRoleChange = {
  transactionId: string;
  transactionDate: string;
  action: ReportedChangeAction;
  reportedShares: string;
  attributedShares: string;
  ownershipFraction: string;
  direct: boolean;
  legalPartyName: string;
  sourceUrl: string;
};

export function isTransactionAfterSnapshot(transactionDate: Date, snapshotDate: Date) {
  return transactionDate.getTime() > snapshotDate.getTime();
}

function decimalParts(value: string) {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
    throw new Error(`Invalid ownership fraction: ${value}`);
  }
  const [whole, fraction = ""] = normalized.split(".");
  return {
    numerator: BigInt(`${whole}${fraction}`),
    denominator: 10n ** BigInt(fraction.length),
  };
}

export function weightShares(shares: bigint, ownershipFraction: string) {
  const { numerator, denominator } = decimalParts(ownershipFraction);
  const scaled = shares * numerator;
  const quotient = scaled / denominator;
  const remainder = scaled % denominator;
  return remainder * 2n >= denominator ? quotient + 1n : quotient;
}

export function buildReportedChange(input: {
  transactionId: string;
  transactionDate: Date;
  action: ReportedChangeAction;
  reportedShares: bigint;
  ownershipFraction: string;
  direct?: boolean;
  legalPartyName: string;
  sourceUrl: string;
}): ReportedRoleChange {
  return {
    transactionId: input.transactionId,
    transactionDate: input.transactionDate.toISOString().slice(0, 10),
    action: input.action,
    reportedShares: input.reportedShares.toString(),
    attributedShares: weightShares(input.reportedShares, input.ownershipFraction).toString(),
    ownershipFraction: input.ownershipFraction,
    direct: input.direct ?? input.ownershipFraction === "1",
    legalPartyName: input.legalPartyName,
    sourceUrl: input.sourceUrl,
  };
}
