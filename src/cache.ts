import { Redis } from '@upstash/redis';
import { env } from './env';

/**
 * Upstash Redis client. Returns null if not configured —
 * call sites must handle the null case explicitly.
 */
export const cache: Redis | null =
  env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    })
    : null;
