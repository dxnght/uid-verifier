import Anthropic from '@anthropic-ai/sdk';
import { env } from './env';

/**
 * Anthropic Claude client. Returns null if not configured —
 * call sites must check before use.
 */
export const ai: Anthropic | null = env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
  : null;

export const AI_MODEL = env.ANTHROPIC_MODEL;
