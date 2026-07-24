import { createHash } from "node:crypto";

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

type RateLimitStore = Map<string, RateLimitEntry>;

export type RateLimitPolicy = {
  limit: number;
  windowMs: number;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

const MAX_KEYS = 10_000;
const globalRateLimitStore = globalThis as typeof globalThis & {
  __fjordInsightRateLimitStore?: RateLimitStore;
};

function getStore() {
  globalRateLimitStore.__fjordInsightRateLimitStore ??= new Map();
  return globalRateLimitStore.__fjordInsightRateLimitStore;
}

function hashKey(namespace: string, identity: string) {
  return createHash("sha256").update(`${namespace}:${identity}`).digest("hex");
}

function removeExpiredEntries(store: RateLimitStore, now: number) {
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) {
      store.delete(key);
    }
  }
}

export function getClientAddress(headers: Headers) {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (
    headers.get("cf-connecting-ip")?.trim() ||
    headers.get("x-real-ip")?.trim() ||
    forwarded ||
    "unknown"
  );
}

export function consumeRateLimit(
  namespace: string,
  identity: string,
  policy: RateLimitPolicy,
  now = Date.now(),
): RateLimitResult {
  if (
    !Number.isSafeInteger(policy.limit) ||
    policy.limit < 1 ||
    !Number.isSafeInteger(policy.windowMs) ||
    policy.windowMs < 1
  ) {
    throw new Error("Invalid rate-limit policy.");
  }

  const store = getStore();
  const key = hashKey(namespace, identity);
  let entry = store.get(key);

  if (!entry || entry.resetAt <= now) {
    if (store.size >= MAX_KEYS) {
      removeExpiredEntries(store, now);
      if (store.size >= MAX_KEYS) {
        const oldestKey = store.keys().next().value;
        if (oldestKey) store.delete(oldestKey);
      }
    }

    entry = { count: 0, resetAt: now + policy.windowMs };
    store.set(key, entry);
  }

  entry.count += 1;
  const allowed = entry.count <= policy.limit;

  return {
    allowed,
    remaining: Math.max(0, policy.limit - entry.count),
    retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1_000)),
  };
}

export function rateLimitHeaders(result: RateLimitResult) {
  return {
    "Retry-After": String(result.retryAfterSeconds),
    "X-RateLimit-Remaining": String(result.remaining),
  };
}
