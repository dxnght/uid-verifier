import { Scenes, type Telegraf } from 'telegraf';
import { randomBytes } from 'node:crypto';
import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  addToWhitelist,
  bulkAddToWhitelist,
  deleteVerification,
  getCommunityStats,
  listAuditLog,
  listVerifications,
  listWhitelist,
  lookupWhitelist,
  recordAdminAction,
  removeFromWhitelist,
} from '../db';
import { isAdmin } from '../services/auth';
import {
  formatVerificationsCsv,
  formatWhitelistCsv,
  parseWhitelistCsv,
  type WhitelistImportError,
} from '../services/csv';
import { clearRateLimit } from '../services/rateLimit';
import { formatExchange, isValidUid } from '../services/verification';
import { isExchange, type BotContext } from '../types';
import { escapeHtml } from '../utils/format';

const ADMIN_HELP = [
  '<b>Admin commands</b>',
  '',
  '/admin_help — this message',
  '/admin_stats — community stats',
  '/admin_audit [limit] — recent admin actions (default 20)',
  '',
  '<b>Whitelist</b>',
  '/admin_whitelist_add &lt;exchange&gt; &lt;uid&gt; — add UID',
  '/admin_whitelist_remove &lt;exchange&gt; &lt;uid&gt; — remove UID',
  '/admin_whitelist_import — upload CSV to bulk-add UIDs',
  '/admin_whitelist_export — download whitelist as CSV',
  '/admin_whitelist_check &lt;exchange&gt; &lt;uid&gt; — check if UID is on whitelist',
  '',
  '<b>Verifications</b>',
  '/admin_export — download verifications as CSV',
  '/admin_reset &lt;user_tg_id&gt; — clear all user verifications + rate limit',
  '',
  'Exchanges: <code>binance</code>, <code>bybit</code>, <code>other</code>',
].join('\n');

export const WHITELIST_IMPORT_SCENE_ID = 'admin_whitelist_import';

const IMPORT_ERROR_REASONS: Record<WhitelistImportError['reason'], string> = {
  invalid_columns: 'expected exchange,uid (2 fields)',
  invalid_exchange: 'exchange must be binance, bybit, or other',
  invalid_uid: 'UID must be 6–12 digits',
};

export const buildWhitelistImportScene = (): Scenes.BaseScene<BotContext> => {
  const scene = new Scenes.BaseScene<BotContext>(WHITELIST_IMPORT_SCENE_ID);

  scene.enter(async (ctx) => {
    await ctx.replyWithHTML(
      [
        '📥 Send the CSV file as an attachment.',
        'Format: exchange,uid (one per line; header optional).',
        'Exchanges: binance, bybit, other.',
        'Max file size: 1 MB.',
        '/cancel to exit.',
      ].join('\n'),
    );
  });

  scene.command('cancel', async (ctx) => {
    await ctx.reply('Cancelled.');
    await ctx.scene.leave();
  });

  scene.on('document', async (ctx) => {
    const doc = ctx.message.document;

    if ((doc.file_size ?? 0) >= 1_048_576) {
      await ctx.reply('File too large (max 1 MB).');
      return;
    }

    const mimeOk =
      doc.mime_type !== undefined &&
      ['text/csv', 'text/plain', 'application/csv'].includes(doc.mime_type);
    const extOk = doc.file_name?.toLowerCase().endsWith('.csv') === true;

    if (!mimeOk && !extOk && doc.mime_type !== undefined) {
      await ctx.reply(
        `MIME \`${doc.mime_type}\` is unexpected; attempting to parse anyway.`,
      );
    }

    const community = ctx.state.community;
    if (!community) {
      await ctx.reply(
        'No community context for admin actions. Set DEFAULT_COMMUNITY_ID or arrive via deep-link.',
      );
      await ctx.scene.leave();
      return;
    }

    try {
      const fileLink = await ctx.telegram.getFileLink(doc.file_id);
      const response = await fetch(fileLink.href);
      const text = await response.text();

      const result = parseWhitelistCsv(text);
      const { inserted, duplicates } = await bulkAddToWhitelist({
        community_id: community.id,
        entries: result.entries,
      });

      const lines: string[] = [
        '<b>Import complete.</b>',
        '',
        `✅ Imported: ${inserted}`,
        `⚠️ Duplicates (already on whitelist): ${duplicates}`,
        `❌ Invalid: ${result.errors.length}`,
      ];

      if (result.errors.length > 0) {
        lines.push('', '<b>Invalid rows:</b>');
        const shown = result.errors.slice(0, 10);
        for (const err of shown) {
          lines.push(
            `  Line ${err.row}: <code>${escapeHtml(err.raw)}</code> — ${IMPORT_ERROR_REASONS[err.reason]}`,
          );
        }
        if (result.errors.length > 10) {
          lines.push(`  …and ${result.errors.length - 10} more.`);
        }
      }

      console.log(
        `[admin] user=${ctx.from?.id} csv import community=${community.id}: inserted=${inserted} duplicates=${duplicates} invalid=${result.errors.length}`,
      );
      await ctx.replyWithHTML(lines.join('\n'));
    } catch (err) {
      console.error(
        '[admin] csv import error:',
        err instanceof Error ? err.stack : err,
      );
      await ctx.reply(
        `❌ Import failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      );
    }

    await ctx.scene.leave();
  });

  scene.on('message', async (ctx) => {
    if ('text' in ctx.message && ctx.message.text.startsWith('/')) return;
    await ctx.reply('Send the CSV as a file attachment, or /cancel.');
  });

  return scene;
};

const NO_COMMUNITY_MSG =
  'No community context for admin actions. Set DEFAULT_COMMUNITY_ID or arrive via deep-link.';

const getCommandArgs = (ctx: BotContext): string[] => {
  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
  return text.split(/\s+/).slice(1);
};

export const registerAdminFlow = (bot: Telegraf<BotContext>): void => {
  /**
   * Wrap a command handler with the admin gate:
   *  - DM-only (admin commands never run in groups)
   *  - Caller must be operator or community admin
   *  - Leave any active scene first (don't strand the user mid-verify)
   *
   * Non-admins or wrong chat type silently ignore the command — feels less
   * leaky than confirming a command exists by responding with an error.
   */
  const adminCommand = (
    name: string,
    handler: (ctx: BotContext) => Promise<void>,
  ): void => {
    bot.command(name, async (ctx) => {
      if (!ctx.state.isPrivate || !ctx.from) return;
      if (!isAdmin(ctx.from.id, ctx.state.community)) return;
      if (ctx.scene.current) await ctx.scene.leave();

      if (ctx.state.community) {
        const args = getCommandArgs(ctx).join(' ').trim();
        void recordAdminAction({
          community_id: ctx.state.community.id,
          actor_tg_id: ctx.from.id,
          action: name,
          args: args.length > 0 ? args : null,
        }).catch((err: unknown) => {
          console.error(
            '[audit] failed to log admin action:',
            err instanceof Error ? err.message : err,
          );
        });
      }

      await handler(ctx);
    });
  };

  adminCommand('admin_help', async (ctx) => {
    await ctx.replyWithHTML(ADMIN_HELP);
  });

  adminCommand('admin_whitelist_import', async (ctx) => {
    await ctx.scene.enter(WHITELIST_IMPORT_SCENE_ID);
  });

  adminCommand('admin_export', async (ctx) => {
    const community = ctx.state.community;
    if (!community) {
      await ctx.reply(NO_COMMUNITY_MSG);
      return;
    }

    const rows = await listVerifications(community.id);
    if (rows.length === 0) {
      await ctx.reply('No verifications yet. Nothing to export.');
      return;
    }

    const csv = formatVerificationsCsv(rows);
    const datePart = new Date().toISOString().slice(0, 10);
    const filename = `verifications_${community.id.slice(0, 8)}_${datePart}.csv`;

    // Write to a tmp file rather than passing Buffer — Telegraf's Buffer-source
    // multipart path hangs on Render free tier (TODO: Day 4 debugging notes).
    // File-path source uses fs.ReadStream + explicit Content-Length and works.
    const tmpPath = join(
      tmpdir(),
      `${randomBytes(8).toString('hex')}-${filename}`,
    );
    await writeFile(tmpPath, csv, 'utf-8');

    try {
      await ctx.replyWithDocument({ source: tmpPath, filename });
      await ctx.reply(`📤 Exported ${rows.length} verifications.`);
    } catch (err) {
      console.error(
        `[admin] export failed for community=${community.id}:`,
        err instanceof Error ? err.stack : err,
      );
      await ctx.reply('❌ Export failed. Check bot logs for details.');
    } finally {
      await unlink(tmpPath).catch(() => {
        // best-effort cleanup; tmpfs is wiped on container restart anyway
      });
    }
  });

  adminCommand('admin_stats', async (ctx) => {
    const community = ctx.state.community;
    if (!community) {
      await ctx.reply(NO_COMMUNITY_MSG);
      return;
    }
    const stats = await getCommunityStats(community.id);
    await ctx.replyWithHTML(
      [
        `📊 Stats for <b>${escapeHtml(community.name)}</b>`,
        '',
        `Whitelist: ${stats.whitelistCount} UIDs`,
        `  Binance: ${stats.whitelistByExchange.binance}`,
        `  Bybit:   ${stats.whitelistByExchange.bybit}`,
        `  Other:   ${stats.whitelistByExchange.other}`,
        '',
        `Verifications: ${stats.verifiedCount + stats.rejectedCount} attempts`,
        `  ✅ Verified: ${stats.verifiedCount}`,
        `  ❌ Rejected: ${stats.rejectedCount}`,
        '',
        `Unique users who attempted: ${stats.totalUsers}`,
      ].join('\n'),
    );
  });

  adminCommand('admin_whitelist_add', async (ctx) => {
    const community = ctx.state.community;
    if (!community) {
      await ctx.reply(NO_COMMUNITY_MSG);
      return;
    }
    const args = getCommandArgs(ctx);
    if (args.length !== 2) {
      await ctx.reply(
        'Usage: /admin_whitelist_add <exchange> <uid>\nExchanges: binance, bybit, other',
      );
      return;
    }
    const [rawExchange, rawUid] = args;
    if (!rawExchange || !isExchange(rawExchange)) {
      await ctx.reply(
        `Invalid exchange "${rawExchange ?? ''}". Use: binance, bybit, other`,
      );
      return;
    }
    if (!rawUid || !isValidUid(rawUid)) {
      await ctx.reply(
        'Invalid UID format. Expected 6–12 digits (numbers only).',
      );
      return;
    }
    const { added } = await addToWhitelist({
      community_id: community.id,
      exchange: rawExchange,
      uid: rawUid,
    });
    if (added) {
      console.log(
        `[admin] user=${ctx.from?.id} added ${rawExchange}:${rawUid} to community=${community.id}`,
      );
      await ctx.replyWithHTML(
        `✅ Added <b>${formatExchange(rawExchange)}</b> UID <code>${escapeHtml(rawUid)}</code> to whitelist.`,
      );
    } else {
      await ctx.replyWithHTML(
        `⚠️ <b>${formatExchange(rawExchange)}</b> UID <code>${escapeHtml(rawUid)}</code> is already on the whitelist.`,
      );
    }
  });

  adminCommand('admin_whitelist_remove', async (ctx) => {
    const community = ctx.state.community;
    if (!community) {
      await ctx.reply(NO_COMMUNITY_MSG);
      return;
    }
    const args = getCommandArgs(ctx);
    if (args.length !== 2) {
      await ctx.reply('Usage: /admin_whitelist_remove <exchange> <uid>');
      return;
    }
    const [rawExchange, rawUid] = args;
    if (!rawExchange || !isExchange(rawExchange)) {
      await ctx.reply(`Invalid exchange "${rawExchange ?? ''}".`);
      return;
    }
    if (!rawUid || !isValidUid(rawUid)) {
      await ctx.reply('Invalid UID format. Expected 6–12 digits.');
      return;
    }
    const { removed } = await removeFromWhitelist({
      community_id: community.id,
      exchange: rawExchange,
      uid: rawUid,
    });
    if (removed) {
      console.log(
        `[admin] user=${ctx.from?.id} removed ${rawExchange}:${rawUid} from community=${community.id}`,
      );
      await ctx.replyWithHTML(
        `✅ Removed <b>${formatExchange(rawExchange)}</b> UID <code>${escapeHtml(rawUid)}</code>.`,
      );
    } else {
      await ctx.replyWithHTML(
        `⚠️ <b>${formatExchange(rawExchange)}</b> UID <code>${escapeHtml(rawUid)}</code> was not on the whitelist.`,
      );
    }
  });

  adminCommand('admin_whitelist_export', async (ctx) => {
    const community = ctx.state.community;
    if (!community) {
      await ctx.reply(NO_COMMUNITY_MSG);
      return;
    }

    const rows = await listWhitelist(community.id);
    if (rows.length === 0) {
      await ctx.reply('Whitelist is empty. Nothing to export.');
      return;
    }

    const csv = formatWhitelistCsv(rows);
    const datePart = new Date().toISOString().slice(0, 10);
    const filename = `whitelist_${community.id.slice(0, 8)}_${datePart}.csv`;
    const tmpPath = join(
      tmpdir(),
      `${randomBytes(8).toString('hex')}-${filename}`,
    );
    await writeFile(tmpPath, csv, 'utf-8');

    try {
      await ctx.replyWithDocument({ source: tmpPath, filename });
      await ctx.reply(`📤 Exported ${rows.length} whitelist entries.`);
    } catch (err) {
      console.error(
        `[admin] whitelist export failed for community=${community.id}:`,
        err instanceof Error ? err.stack : err,
      );
      await ctx.reply('❌ Export failed. Check bot logs for details.');
    } finally {
      await unlink(tmpPath).catch(() => {
        // best-effort cleanup
      });
    }
  });

  adminCommand('admin_whitelist_check', async (ctx) => {
    const community = ctx.state.community;
    if (!community) {
      await ctx.reply(NO_COMMUNITY_MSG);
      return;
    }
    const args = getCommandArgs(ctx);
    if (args.length !== 2) {
      await ctx.reply(
        'Usage: /admin_whitelist_check <exchange> <uid>\nExchanges: binance, bybit, other',
      );
      return;
    }
    const [rawExchange, rawUid] = args;
    if (!rawExchange || !isExchange(rawExchange)) {
      await ctx.reply(
        `Invalid exchange "${rawExchange ?? ''}". Use: binance, bybit, other`,
      );
      return;
    }
    if (!rawUid || !isValidUid(rawUid)) {
      await ctx.reply(
        'Invalid UID format. Expected 6–12 digits (numbers only).',
      );
      return;
    }
    const entry = await lookupWhitelist(community.id, rawExchange, rawUid);
    if (entry) {
      const date = entry.added_at.slice(0, 10);
      await ctx.replyWithHTML(
        `✅ <b>${formatExchange(rawExchange)}</b> UID <code>${escapeHtml(rawUid)}</code> IS on the whitelist (added ${date}).`,
      );
    } else {
      await ctx.replyWithHTML(
        `❌ <b>${formatExchange(rawExchange)}</b> UID <code>${escapeHtml(rawUid)}</code> is NOT on the whitelist.`,
      );
    }
  });

  adminCommand('admin_audit', async (ctx) => {
    const community = ctx.state.community;
    if (!community) {
      await ctx.reply(NO_COMMUNITY_MSG);
      return;
    }

    const args = getCommandArgs(ctx);
    let limit = 20;
    if (args.length > 0) {
      const parsed = Number(args[0]);
      if (Number.isInteger(parsed) && parsed > 0) {
        limit = Math.min(parsed, 100);
      }
    }

    const entries = await listAuditLog(community.id, limit);
    if (entries.length === 0) {
      await ctx.reply('📋 No admin actions recorded yet.');
      return;
    }

    const lines = [
      `📋 <b>Recent admin actions</b> (showing ${entries.length})`,
      '',
    ];
    for (const e of entries) {
      const ts = e.created_at.slice(0, 19).replace('T', ' ');
      const actor = String(e.actor_tg_id);
      const argsPart = e.args ? ` <code>${escapeHtml(e.args)}</code>` : '';
      lines.push(
        `<code>${ts}</code> · ${actor} · <b>${e.action}</b>${argsPart}`,
      );
    }
    await ctx.replyWithHTML(lines.join('\n'));
  });

  adminCommand('admin_reset', async (ctx) => {
    const community = ctx.state.community;
    if (!community) {
      await ctx.reply(NO_COMMUNITY_MSG);
      return;
    }
    const args = getCommandArgs(ctx);
    if (args.length !== 1) {
      await ctx.reply('Usage: /admin_reset <user_tg_id>');
      return;
    }
    const rawId = args[0];
    const userTgId = Number(rawId);
    if (!Number.isInteger(userTgId) || userTgId <= 0) {
      await ctx.reply(
        `Invalid user_tg_id "${rawId ?? ''}". Expected positive integer.`,
      );
      return;
    }
    const { deleted } = await deleteVerification(userTgId, community.id);
    await clearRateLimit(`${userTgId}:${community.id}`);
    console.log(
      `[admin] user=${ctx.from?.id} reset user=${userTgId} community=${community.id} (deleted=${deleted})`,
    );
    await ctx.reply(
      deleted
        ? `✅ Cleared all verifications + rate limit for user ${userTgId}.`
        : `⚠️ No verification records for user ${userTgId}. Rate limit cleared anyway.`,
    );
  });
};
