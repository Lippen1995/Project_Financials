type RecoverableErrorContext = Record<string, unknown>;

export function logRecoverableError(
  scope: string,
  error: unknown,
  context?: RecoverableErrorContext,
) {
  console.error(`[${scope}] recoverable error`, {
    message: error instanceof Error ? error.message : "Unknown error",
    stack: error instanceof Error ? error.stack : undefined,
    context,
  });
}
