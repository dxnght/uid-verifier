import { cache } from '../cache';

const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_ATTEMPTS = 5;
const REDIS_KEY_PREFIX = 'ratelimit:verify:';

export interface RateLimitResult {
  allowed: boolean;
  /** Milliseconds until the bucket resets. Zero when allowed and no bucket yet. */
  resetInMs: number;
  /** Remaining attempts in the current window after this consume. */
  remaining: number;
}

// ── In-memory fallback ────────────────────────────────────────────────────

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

const memConsume = (key: string): RateLimitResult => {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, resetInMs: WINDOW_MS, remaining: MAX_ATTEMPTS - 1 };
  }

  if (bucket.count >= MAX_ATTEMPTS) {
    return { allowed: false, resetInMs: bucket.resetAt - now, remaining: 0 };
  }

  bucket.count += 1;
  return {
    allowed: true,
    resetInMs: bucket.resetAt - now,
    remaining: MAX_ATTEMPTS - bucket.count,
  };
};

const memClear = (key: string): void => {
  buckets.delete(key);
};

export const cleanupExpiredBuckets = (): number => {
  const now = Date.now();
  let removed = 0;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
      removed += 1;
    }
  }
  return removed;
};

// ── Backend selection ─────────────────────────────────────────────────────

if (cache) {
  console.log('[ratelimit] backend: upstash');
} else {
  console.log('[ratelimit] backend: in-memory (no UPSTASH_REDIS_REST_URL configured)');
}

// ── Public API ────────────────────────────────────────────────────────────

export const consumeRateLimit = async (key: string): Promise<RateLimitResult> => {
  if (!cache) return memConsume(key);

  const fullKey = REDIS_KEY_PREFIX + key;
  const ttlSeconds = Math.floor(WINDOW_MS / 1000);

  try {
    const setResult = await cache.set(fullKey, 1, { nx: true, ex: ttlSeconds });

    let count: number;
    if (setResult === 'OK') {
      count = 1;
    } else {
      count = await cache.incr(fullKey);
    }

    if (count > MAX_ATTEMPTS) {
      const pttl = await cache.pttl(fullKey);
      const resetInMs = pttl > 0 ? pttl : WINDOW_MS;
      return { allowed: false, resetInMs, remaining: 0 };
    }

    return {
      allowed: true,
      resetInMs: WINDOW_MS,
      remaining: MAX_ATTEMPTS - count,
    };
  } catch (err) {
    console.error(
      '[ratelimit] redis error, falling back to in-memory:',
      err instanceof Error ? err.message : err,
    );
    return memConsume(key);
  }
};

export const clearRateLimit = async (key: string): Promise<void> => {
  if (!cache) {
    memClear(key);
    return;
  }

  try {
    await cache.del(REDIS_KEY_PREFIX + key);
  } catch (err) {
    console.error(
      '[ratelimit] redis error on clear, falling back to in-memory:',
      err instanceof Error ? err.message : err,
    );
    memClear(key);
  }
};
