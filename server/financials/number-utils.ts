export function toSafeNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "bigint") {
    const converted = Number(value);
    return Number.isSafeInteger(converted) ? converted : null;
  }

  if (typeof value === "object" && value && "toNumber" in value && typeof value.toNumber === "function") {
    const converted = value.toNumber() as number;
    return Number.isFinite(converted) ? converted : null;
  }

  const converted = Number(value);
  return Number.isFinite(converted) ? converted : null;
}
