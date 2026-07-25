import { z } from "zod";

const routeIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/);

function createRouteIdsSchema<Key extends string>(keys: readonly Key[]) {
  return z.object(Object.fromEntries(keys.map((key) => [key, routeIdSchema]))).strict();
}

export function parseRouteIds<const Key extends string>(
  params: Record<Key, unknown>,
  keys: readonly Key[],
): Record<Key, string> {
  return createRouteIdsSchema(keys).parse(params) as Record<Key, string>;
}

export function tryParseRouteIds<const Key extends string>(
  params: Record<Key, unknown>,
  keys: readonly Key[],
): Record<Key, string> | null {
  const parsed = createRouteIdsSchema(keys).safeParse(params);
  return parsed.success ? (parsed.data as Record<Key, string>) : null;
}
