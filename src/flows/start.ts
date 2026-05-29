import { Markup, type Telegraf } from 'telegraf';
import { getCommunityById, upsertUser } from '../db';
import { env } from '../env';
import { isAdmin } from '../services/auth';
import type { BotContext } from '../types';
import { escapeHtml, parseStartPayload } from '../utils/format';

const DEEP_LINK_PREFIX = 'verify_';

const formatGreeting = (communityName: string): string =>
  [
    `👋 Welcome to <b>${escapeHtml(communityName)}</b> verifier.`,
    '',
    'This bot confirms that you are registered under our exchange referral.',
    '',
    'Tap /verify to start, or /help for details.',
  ].join('\n');

export const registerStartFlow = (bot: Telegraf<BotContext>): void => {
  bot.start(async (ctx) => {
    const from = ctx.from;
    if (!from) return;

    await upsertUser({
      tg_id: from.id,
      username: from.username ?? null,
      first_name: from.first_name ?? null,
    });

    // ── Group: send user to DM ───────────────────────────────────────────
    if (ctx.state.isGroup) {
      const username = env.BOT_USERNAME;
      const community = ctx.state.community;
      const payload = community ? `${DEEP_LINK_PREFIX}${community.id}` : '';
      const dmUrl = username
        ? `https://t.me/${username}${payload ? `?start=${payload}` : ''}`
        : '';

      if (dmUrl) {
        await ctx.reply(
          '👋 I verify exchange UIDs here. To get verified, message me privately:',
          Markup.inlineKeyboard([Markup.button.url('Open DM', dmUrl)]),
        );
      } else {
        await ctx.reply('👋 I verify exchange UIDs. DM me directly to start.');
      }
      return;
    }

    // ── DM: parse deep-link, resolve community ───────────────────────────
    let community = ctx.state.community ?? null;
    const messageText =
      ctx.message && 'text' in ctx.message ? ctx.message.text : undefined;
    const payload = parseStartPayload(messageText);

    if (payload.startsWith(DEEP_LINK_PREFIX)) {
      const id = payload.slice(DEEP_LINK_PREFIX.length);
      const fromLink = await getCommunityById(id);
      if (fromLink) community = fromLink;
    }

    if (!community) {
      await ctx.reply(
        [
          '👋 Hi! This bot verifies exchange UIDs against community whitelists.',
          '',
          'It looks like you arrived without a community link. Please use the',
          'link provided by your community admin.',
        ].join('\n'),
      );
      return;
    }

    await ctx.replyWithHTML(formatGreeting(community.name));
  });

  bot.help(async (ctx) => {
    const lines = [
      'Commands:',
      '/start  — onboarding',
      '/verify — verify your exchange UID',
      '/status — view your verification status',
      '/cancel — exit the verification flow',
      '/help   — this message',
    ];

    // Admin commands shown only to admins in DM
    if (
      ctx.state.isPrivate &&
      ctx.from &&
      isAdmin(ctx.from.id, ctx.state.community)
    ) {
      lines.push(
        '',
        'Admin commands (see /admin_help for full list):',
        '/admin_stats',
        '/admin_audit [limit]',
        '/admin_whitelist_add <exchange> <uid>',
        '/admin_whitelist_remove <exchange> <uid>',
        '/admin_whitelist_import',
        '/admin_whitelist_export',
        '/admin_whitelist_check <exchange> <uid>',
        '/admin_export',
        '/admin_reset <user_tg_id>',
      );
    }

    await ctx.reply(lines.join('\n'));
  });
};
