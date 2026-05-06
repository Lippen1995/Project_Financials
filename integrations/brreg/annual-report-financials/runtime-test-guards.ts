import {
  describe,
  it,
  type TestFunction,
  type TestOptions,
} from "vitest";

const ENABLED_VALUES = new Set(["1", "true", "yes", "on"]);

export function isRuntimeIntegrationTestsEnabled(): boolean {
  return ENABLED_VALUES.has(
    (process.env.PDF_RUNTIME_INTEGRATION_TESTS ?? "").trim().toLowerCase(),
  );
}

export function getRuntimeIntegrationSkipReason(): string | null {
  if (isRuntimeIntegrationTestsEnabled()) return null;
  return "Set PDF_RUNTIME_INTEGRATION_TESTS=1 to run OCR/OpenDataLoader runtime integration tests.";
}

export function describeRuntimeIntegration(name: string, fn: () => void): void {
  const reason = getRuntimeIntegrationSkipReason();
  const runner = reason ? describe.skip : describe;
  runner(`${name}${reason ? ` (${reason})` : ""}`, fn);
}

export function itRuntimeIntegration(
  name: string,
  fn: TestFunction,
  timeoutOrOptions?: number | TestOptions,
): void {
  const reason = getRuntimeIntegrationSkipReason();
  const runner = reason ? it.skip : it;
  runner(`${name}${reason ? ` (${reason})` : ""}`, fn, timeoutOrOptions);
}
