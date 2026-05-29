import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';
import {
  isExchange,
  type AdminAuditEntry,
  type BotUser,
  type Community,
  type CommunityStats,
  type Exchange,
  type Verification,
  type VerificationExportRow,
  type VerificationStatus,
  type WhitelistEntry,
} from './types';

/**
 * Server-side Supabase client using the service-role key.
 * Bypasses RLS — never expose this client to user-facing code outside the bot.
 */
export const db: SupabaseClient = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);

// ── Communities ───────────────────────────────────────────────────────────

export const getCommunityById = async (
  id: string,
): Promise<Community | null> => {
  const { data, error } = await db
    .from('communities')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`[db] getCommunityById: ${error.message}`);
  return (data as Community | null) ?? null;
};

export const getCommunityByChatId = async (
  chatId: number,
): Promise<Community | null> => {
  const { data, error } = await db
    .from('communities')
    .select('*')
    .eq('chat_id', chatId)
    .maybeSingle();
  if (error) throw new Error(`[db] getCommunityByChatId: ${error.message}`);
  return (data as Community | null) ?? null;
};

export const createCommunity = async (input: {
  name: string;
  chat_id: number | null;
  admin_tg_id: number;
}): Promise<Community> => {
  const { data, error } = await db
    .from('communities')
    .insert({
      name: input.name,
      chat_id: input.chat_id,
      admin_tg_id: input.admin_tg_id,
    })
    .select('*')
    .single();
  if (error) throw new Error(`[db] createCommunity: ${error.message}`);
  return data as Community;
};

// ── Users ─────────────────────────────────────────────────────────────────

export const upsertUser = async (input: {
  tg_id: number;
  username?: string | null;
  first_name?: string | null;
}): Promise<BotUser> => {
  const { data, error } = await db
    .from('users')
    .upsert(
      {
        tg_id: input.tg_id,
        username: input.username ?? null,
        first_name: input.first_name ?? null,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'tg_id' },
    )
    .select('*')
    .single();
  if (error) throw new Error(`[db] upsertUser: ${error.message}`);
  return data as BotUser;
};

// ── Whitelist ─────────────────────────────────────────────────────────────

export const lookupWhitelist = async (
  communityId: string,
  exchange: Exchange,
  uid: string,
): Promise<WhitelistEntry | null> => {
  const { data, error } = await db
    .from('whitelist')
    .select('*')
    .eq('community_id', communityId)
    .eq('exchange', exchange)
    .eq('uid', uid)
    .maybeSingle();
  if (error) throw new Error(`[db] lookupWhitelist: ${error.message}`);
  return (data as WhitelistEntry | null) ?? null;
};

export const addToWhitelist = async (input: {
  community_id: string;
  exchange: Exchange;
  uid: string;
}): Promise<{ added: boolean }> => {
  const { error } = await db.from('whitelist').insert({
    community_id: input.community_id,
    exchange: input.exchange,
    uid: input.uid,
  });
  if (!error) return { added: true };
  // Postgres unique_violation — UID already on the whitelist
  if (error.code === '23505') return { added: false };
  throw new Error(`[db] addToWhitelist: ${error.message}`);
};

export const removeFromWhitelist = async (input: {
  community_id: string;
  exchange: Exchange;
  uid: string;
}): Promise<{ removed: boolean }> => {
  const { count, error } = await db
    .from('whitelist')
    .delete({ count: 'exact' })
    .eq('community_id', input.community_id)
    .eq('exchange', input.exchange)
    .eq('uid', input.uid);
  if (error) throw new Error(`[db] removeFromWhitelist: ${error.message}`);
  return { removed: (count ?? 0) > 0 };
};

// ── Verifications ─────────────────────────────────────────────────────────

export const getUserVerifications = async (
  userTgId: number,
  communityId: string,
): Promise<Verification[]> => {
  const { data, error } = await db
    .from('verifications')
    .select('*')
    .eq('user_tg_id', userTgId)
    .eq('community_id', communityId)
    .order('exchange', { ascending: true });
  if (error) throw new Error(`[db] getUserVerifications: ${error.message}`);
  return (data as Verification[]) ?? [];
};

export const getVerificationForExchange = async (
  userTgId: number,
  communityId: string,
  exchange: Exchange,
): Promise<Verification | null> => {
  const { data, error } = await db
    .from('verifications')
    .select('*')
    .eq('user_tg_id', userTgId)
    .eq('community_id', communityId)
    .eq('exchange', exchange)
    .maybeSingle();
  if (error)
    throw new Error(`[db] getVerificationForExchange: ${error.message}`);
  return (data as Verification | null) ?? null;
};

export const upsertVerification = async (input: {
  user_tg_id: number;
  community_id: string;
  uid: string;
  exchange: Exchange;
  status: VerificationStatus;
}): Promise<Verification> => {
  const { data, error } = await db
    .from('verifications')
    .upsert(
      {
        user_tg_id: input.user_tg_id,
        community_id: input.community_id,
        uid: input.uid,
        exchange: input.exchange,
        status: input.status,
        attempted_at: new Date().toISOString(),
      },
      { onConflict: 'user_tg_id,community_id,exchange' },
    )
    .select('*')
    .single();
  if (error) throw new Error(`[db] upsertVerification: ${error.message}`);
  return data as Verification;
};

// Clears every exchange row for the user in the community (used by /admin_reset).
export const deleteVerification = async (
  userTgId: number,
  communityId: string,
): Promise<{ deleted: boolean }> => {
  const { count, error } = await db
    .from('verifications')
    .delete({ count: 'exact' })
    .eq('user_tg_id', userTgId)
    .eq('community_id', communityId);
  if (error) throw new Error(`[db] deleteVerification: ${error.message}`);
  return { deleted: (count ?? 0) > 0 };
};

export const listWhitelist = async (
  communityId: string,
): Promise<WhitelistEntry[]> => {
  const { data, error } = await db
    .from('whitelist')
    .select('*')
    .eq('community_id', communityId)
    .order('exchange', { ascending: true })
    .order('uid', { ascending: true });
  if (error) throw new Error(`[db] listWhitelist: ${error.message}`);
  return (data as WhitelistEntry[]) ?? [];
};

export const bulkAddToWhitelist = async (input: {
  community_id: string;
  entries: { exchange: Exchange; uid: string }[];
}): Promise<{ inserted: number; duplicates: number }> => {
  const { community_id, entries } = input;
  if (entries.length === 0) return { inserted: 0, duplicates: 0 };

  const distinctExchanges = [...new Set(entries.map((e) => e.exchange))];
  const uids = [...new Set(entries.map((e) => e.uid))];

  const { data: existing, error: selectError } = await db
    .from('whitelist')
    .select('exchange, uid')
    .eq('community_id', community_id)
    .in('exchange', distinctExchanges)
    .in('uid', uids);

  if (selectError) {
    throw new Error(`[db] bulkAddToWhitelist select: ${selectError.message}`);
  }

  const existingSet = new Set(
    ((existing ?? []) as { exchange: string; uid: string }[]).map(
      (r) => `${r.exchange}:${r.uid}`,
    ),
  );

  const newEntries = entries.filter(
    (e) => !existingSet.has(`${e.exchange}:${e.uid}`),
  );

  if (newEntries.length === 0) {
    return { inserted: 0, duplicates: entries.length };
  }

  // TODO: TOCTOU — concurrent insert may still hit a unique_violation; for v1 let it throw
  const { error: insertError } = await db.from('whitelist').insert(
    newEntries.map((e) => ({
      community_id,
      exchange: e.exchange,
      uid: e.uid,
    })),
  );

  if (insertError) {
    throw new Error(`[db] bulkAddToWhitelist insert: ${insertError.message}`);
  }

  return {
    inserted: newEntries.length,
    duplicates: entries.length - newEntries.length,
  };
};

export const listVerifications = async (
  communityId: string,
): Promise<VerificationExportRow[]> => {
  const { data, error } = await db
    .from('verifications')
    .select('user_tg_id, uid, exchange, status, attempted_at, users(username)')
    .eq('community_id', communityId)
    .order('attempted_at', { ascending: false });

  if (error) throw new Error(`[db] listVerifications: ${error.message}`);
  if (!data || data.length === 0) return [];

  // Flatten joined users.username; Supabase returns it as { users: { username } | null }
  return (
    data as unknown as {
      user_tg_id: number;
      uid: string;
      exchange: Exchange;
      status: VerificationStatus;
      attempted_at: string;
      users: { username: string | null } | null;
    }[]
  ).map((row) => ({
    user_tg_id: row.user_tg_id,
    username: row.users?.username ?? null,
    uid: row.uid,
    exchange: row.exchange,
    status: row.status,
    attempted_at: row.attempted_at,
  }));
};

// ── Audit log ─────────────────────────────────────────────────────────────

export const recordAdminAction = async (input: {
  community_id: string;
  actor_tg_id: number;
  action: string;
  args: string | null;
}): Promise<void> => {
  const { error } = await db.from('admin_audit_log').insert({
    community_id: input.community_id,
    actor_tg_id: input.actor_tg_id,
    action: input.action,
    args: input.args,
  });
  if (error) throw new Error(`[db] recordAdminAction: ${error.message}`);
};

export const listAuditLog = async (
  communityId: string,
  limit: number,
): Promise<AdminAuditEntry[]> => {
  const clamped = Math.min(Math.max(limit, 1), 100);
  const { data, error } = await db
    .from('admin_audit_log')
    .select('*')
    .eq('community_id', communityId)
    .order('created_at', { ascending: false })
    .limit(clamped);
  if (error) throw new Error(`[db] listAuditLog: ${error.message}`);
  return (data as AdminAuditEntry[]) ?? [];
};

// ── Stats ─────────────────────────────────────────────────────────────────

export const getCommunityStats = async (
  communityId: string,
): Promise<CommunityStats> => {
  const [whitelistRes, verifRes] = await Promise.all([
    db.from('whitelist').select('exchange').eq('community_id', communityId),
    db
      .from('verifications')
      .select('status, user_tg_id')
      .eq('community_id', communityId),
  ]);
  if (whitelistRes.error) {
    throw new Error(
      `[db] getCommunityStats whitelist: ${whitelistRes.error.message}`,
    );
  }
  if (verifRes.error) {
    throw new Error(
      `[db] getCommunityStats verifications: ${verifRes.error.message}`,
    );
  }

  const whitelistByExchange: Record<Exchange, number> = {
    binance: 0,
    bybit: 0,
    other: 0,
  };
  const whitelistRows = (whitelistRes.data ?? []) as { exchange: string }[];
  for (const row of whitelistRows) {
    if (isExchange(row.exchange)) {
      whitelistByExchange[row.exchange] += 1;
    }
  }

  let verifiedCount = 0;
  let rejectedCount = 0;
  const userSet = new Set<number>();
  const verifRows = (verifRes.data ?? []) as {
    status: string;
    user_tg_id: number;
  }[];
  for (const row of verifRows) {
    if (row.status === 'verified') verifiedCount += 1;
    else if (row.status === 'rejected') rejectedCount += 1;
    userSet.add(row.user_tg_id);
  }

  return {
    whitelistCount: whitelistRows.length,
    whitelistByExchange,
    verifiedCount,
    rejectedCount,
    totalUsers: userSet.size,
  };
};
