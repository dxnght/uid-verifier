import 'dotenv/config';

/**
 * Typed environment loader.
 * Fails fast with a clear message if required vars are missing.
 */

const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`[env] required variable ${name} is missing or empty`);
  }
  return value;
};

const optionalEnv = (name: string, fallback = ''): string => {
  const value = process.env[name]?.trim();
  if (!value) return fallback;
  return value;
};

const parseIdList = (raw: string): number[] => {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => {
      const n = Number(s);
      if (!Number.isInteger(n)) {
        throw new Error(`[env] invalid telegram id in OPERATOR_IDS: "${s}"`);
      }
      return n;
    });
};

export const env = {
  // Telegram
  BOT_TOKEN: requireEnv('BOT_TOKEN'),
  BOT_USERNAME: optionalEnv('BOT_USERNAME'),

  // Supabase
  SUPABASE_URL: requireEnv('SUPABASE_URL'),
  SUPABASE_SERVICE_ROLE_KEY: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),

  // Optional services (not used in Demo #1)
  UPSTASH_REDIS_REST_URL: optionalEnv('UPSTASH_REDIS_REST_URL'),
  UPSTASH_REDIS_REST_TOKEN: optionalEnv('UPSTASH_REDIS_REST_TOKEN'),
  ANTHROPIC_API_KEY: optionalEnv('ANTHROPIC_API_KEY'),
  ANTHROPIC_MODEL: optionalEnv('ANTHROPIC_MODEL', 'claude-sonnet-4-5'),

  // Operators (global bot admins, comma-separated tg ids)
  OPERATOR_IDS: parseIdList(optionalEnv('OPERATOR_IDS')),

  // Demo default community (used in DM when no deep-link payload)
  DEFAULT_COMMUNITY_ID: optionalEnv('DEFAULT_COMMUNITY_ID'),

  // Webhook (set on prod; empty locally → polling)
  WEBHOOK_DOMAIN: optionalEnv('WEBHOOK_DOMAIN'),
  WEBHOOK_SECRET: optionalEnv('WEBHOOK_SECRET'),
  PORT: Number(optionalEnv('PORT', '3000')),

  // Runtime
  NODE_ENV: optionalEnv('NODE_ENV', 'development'),
  LOG_LEVEL: optionalEnv('LOG_LEVEL', 'info'),
} as const;

export type Env = typeof env;
