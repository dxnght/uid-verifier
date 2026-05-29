import type { Context, Scenes } from 'telegraf';

// ── Domain ────────────────────────────────────────────────────────────────

export type Exchange = 'binance' | 'bybit' | 'other';

export const EXCHANGES: readonly Exchange[] = [
  'binance',
  'bybit',
  'other',
] as const;

export const isExchange = (s: string): s is Exchange =>
  (EXCHANGES as readonly string[]).includes(s);

export type VerificationStatus = 'verified' | 'rejected' | 'pending';

export interface Community {
  id: string;
  name: string;
  chat_id: number | null;
  admin_tg_id: number;
  ref_code: string | null;
  exchanges: Exchange[];
  created_at: string;
}

export interface BotUser {
  tg_id: number;
  username: string | null;
  first_name: string | null;
  first_seen_at: string;
  last_seen_at: string;
}

export interface WhitelistEntry {
  id: string;
  community_id: string;
  uid: string;
  exchange: Exchange;
  added_at: string;
}

export interface Verification {
  id: string;
  user_tg_id: number;
  community_id: string;
  uid: string;
  exchange: Exchange;
  status: VerificationStatus;
  attempted_at: string;
}

export interface CommunityStats {
  whitelistCount: number;
  whitelistByExchange: Record<Exchange, number>;
  verifiedCount: number;
  rejectedCount: number;
  totalUsers: number;
}

export interface VerificationExportRow {
  user_tg_id: number;
  username: string | null;
  uid: string;
  exchange: Exchange;
  status: VerificationStatus;
  attempted_at: string;
}

export interface AdminAuditEntry {
  id: string;
  community_id: string;
  actor_tg_id: number;
  action: string;
  args: string | null;
  created_at: string;
}

// ── Augmented Telegraf Context ────────────────────────────────────────────

export interface BotState {
  isPrivate?: boolean;
  isGroup?: boolean;
  community?: Community | null;
}

/**
 * Scene-local session for the verify wizard.
 * Add fields per scene as we grow more flows.
 */
export interface VerifySceneSession extends Scenes.SceneSessionData {
  exchange?: Exchange;
}

export type BotSession = Scenes.SceneSession<VerifySceneSession>;

export interface BotContext extends Context {
  state: BotState;
  session: BotSession;
  scene: Scenes.SceneContextScene<BotContext, VerifySceneSession>;
}
