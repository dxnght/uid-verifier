import { Markup, Scenes, type Telegraf } from 'telegraf';
import {
  getUserVerifications,
  getVerificationForExchange,
  lookupWhitelist,
  upsertVerification,
  upsertUser,
} from '../db';
import { env } from '../env';
import { consumeRateLimit } from '../services/rateLimit';
import { formatExchange, isValidUid } from '../services/verification';
import {
  isExchange,
  type BotContext,
  type Exchange,
} from '../types';
import { escapeHtml, maskUid } from '../utils/format';

export const VERIFY_SCENE_ID = 'verify';
const DEEP_LINK_PREFIX = 'verify_';

// ── UI helpers ────────────────────────────────────────────────────────────

const exchangeKeyboard = Markup.inlineKeyboard([
  [
    Markup.button.callback('Binance', 'verify:exchange:binance'),
    Markup.button.callback('Bybit', 'verify:exchange:bybit'),
  ],
  [
    Markup.button.callback('Other', 'verify:exchange:other'),
    Markup.button.callback('✖ Cancel', 'verify:cancel'),
  ],
]);

const afterSuccessKeyboard = Markup.inlineKeyboard([
  [
    Markup.button.callback('➕ Verify another exchange', 'verify:another'),
    Markup.button.callback('✅ Done', 'verify:done'),
  ],
]);

const afterRejectionKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('🔁 Try this exchange again', 'verify:retry_uid')],
  [
    Markup.button.callback('↩️ Pick another', 'verify:another'),
    Markup.button.callback('✅ Done', 'verify:done'),
  ],
]);

const replaceKeyboard = Markup.inlineKeyboard([
  [
    Markup.button.callback('♻️ Replace', 'verify:replace'),
    Markup.button.callback('↩️ Pick another', 'verify:another'),
  ],
  [Markup.button.callback('✖ Cancel', 'verify:cancel')],
]);

const formatResetWindow = (resetInMs: number): string => {
  const minutes = Math.ceil(resetInMs / 60_000);
  if (minutes < 1) return 'less than a minute';
  if (minutes === 1) return '1 minute';
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.ceil(minutes / 60);
  return hours === 1 ? '1 hour' : `${hours} hours`;
};

// ── Scene ─────────────────────────────────────────────────────────────────

export const buildVerifyScene = (): Scenes.BaseScene<BotContext> => {
  const scene = new Scenes.BaseScene<BotContext>(VERIFY_SCENE_ID);

  scene.enter(async (ctx) => {
    if (!ctx.from) return;
    const community = ctx.state.community;
    let prompt = 'Pick your exchange:';
    if (community) {
      const existing = await getUserVerifications(ctx.from.id, community.id);
      if (existing.length > 0) {
        const names = existing.map((v) => formatExchange(v.exchange)).join(', ');
        prompt = `You're verified on: ${names}. Pick an exchange to add or replace:`;
      }
    }
    await ctx.reply(prompt, exchangeKeyboard);
  });

  // Exchange selection
  scene.action(/^verify:exchange:(binance|bybit|other)$/, async (ctx) => {
    const raw = ctx.match[1];
    if (!raw || !isExchange(raw)) {
      await ctx.answerCbQuery('Invalid exchange');
      return;
    }
    const exchange: Exchange = raw;
    ctx.scene.session.exchange = exchange;
    await ctx.answerCbQuery();

    const community = ctx.state.community;
    if (!community || !ctx.from) {
      await ctx.editMessageText('Context lost. Run /verify again.');
      await ctx.scene.leave();
      return;
    }

    const existing = await getVerificationForExchange(
      ctx.from.id,
      community.id,
      exchange,
    );

    if (existing?.status === 'verified') {
      await ctx.editMessageText(
        `You're already verified on <b>${formatExchange(exchange)}</b> (UID ${escapeHtml(maskUid(existing.uid))}). Replace it?`,
        { parse_mode: 'HTML', ...replaceKeyboard },
      );
    } else if (existing?.status === 'rejected') {
      await ctx.editMessageText(
        `Previous <b>${formatExchange(exchange)}</b> attempt was rejected (UID ${escapeHtml(maskUid(existing.uid))}). Send a new UID (6–12 digits), or /cancel.`,
        { parse_mode: 'HTML' },
      );
    } else {
      await ctx.editMessageText(
        `Send your <b>${formatExchange(exchange)}</b> UID (6–12 digits), or /cancel.`,
        { parse_mode: 'HTML' },
      );
    }
  });

  // Replace confirmed — just prompt for a new UID
  scene.action('verify:replace', async (ctx) => {
    await ctx.answerCbQuery();
    const exchange = ctx.scene.session.exchange;
    if (!exchange) {
      await ctx.editMessageText('Pick an exchange first:', exchangeKeyboard);
      return;
    }
    await ctx.editMessageText(
      `Send your new <b>${formatExchange(exchange)}</b> UID (6–12 digits), or /cancel.`,
      { parse_mode: 'HTML' },
    );
  });

  // Re-show exchange picker
  scene.action('verify:another', async (ctx) => {
    await ctx.answerCbQuery();
    ctx.scene.session.exchange = undefined;
    if (!ctx.from) return;
    const community = ctx.state.community;
    let prompt = 'Pick your exchange:';
    if (community) {
      const existing = await getUserVerifications(ctx.from.id, community.id);
      if (existing.length > 0) {
        const names = existing.map((v) => formatExchange(v.exchange)).join(', ');
        prompt = `You're verified on: ${names}. Pick an exchange to add or replace:`;
      }
    }
    try {
      await ctx.editMessageText(prompt, exchangeKeyboard);
    } catch {
      await ctx.reply(prompt, exchangeKeyboard);
    }
  });

  // Done — leave scene
  scene.action('verify:done', async (ctx) => {
    await ctx.answerCbQuery();
    try {
      await ctx.editMessageReplyMarkup(undefined);
    } catch {
      // ignore
    }
    await ctx.reply('All set. 🎉');
    await ctx.scene.leave();
  });

  // Retry same exchange after rejection
  scene.action('verify:retry_uid', async (ctx) => {
    await ctx.answerCbQuery();
    const exchange = ctx.scene.session.exchange;
    if (!exchange) {
      await ctx.editMessageText('Pick an exchange first:', exchangeKeyboard);
      return;
    }
    try {
      await ctx.editMessageReplyMarkup(undefined);
    } catch {
      // ignore
    }
    await ctx.reply(
      `Send your <b>${formatExchange(exchange)}</b> UID (6–12 digits), or /cancel.`,
      { parse_mode: 'HTML' },
    );
  });

  // Cancel via button
  scene.action('verify:cancel', async (ctx) => {
    await ctx.answerCbQuery();
    try {
      await ctx.editMessageText('Cancelled.');
    } catch {
      await ctx.reply('Cancelled.');
    }
    await ctx.scene.leave();
  });

  // Cancel via command
  scene.command('cancel', async (ctx) => {
    await ctx.reply('Cancelled.');
    await ctx.scene.leave();
  });

  // Restart verification mid-flow
  scene.command('verify', async (ctx) => {
    ctx.scene.session.exchange = undefined;
    await ctx.scene.reenter();
  });

  // Block other commands politely
  scene.command(['start', 'help'], async (ctx) => {
    await ctx.reply(
      "You're in the middle of verification. /cancel to exit, then run the command again.",
    );
  });

  // UID input
  scene.on('message', async (ctx) => {
    // Commands handled above; ignore any other slash-prefixed input here.
    if (!ctx.text || ctx.text.startsWith('/')) return;

    const exchange = ctx.scene.session.exchange;
    if (!exchange) {
      await ctx.reply('Pick an exchange first:', exchangeKeyboard);
      return;
    }

    const community = ctx.state.community;
    if (!community) {
      await ctx.reply('Community context lost. Run /verify again.');
      await ctx.scene.leave();
      return;
    }

    if (!ctx.from) {
      await ctx.scene.leave();
      return;
    }

    const uid = ctx.text.trim();
    if (!isValidUid(uid)) {
      await ctx.reply(
        '❌ Invalid UID format. Send 6–12 digits (numbers only), or /cancel.',
      );
      return;
    }

    // Rate limit AFTER format check — typos shouldn't burn attempts.
    const rateLimitKey = `${ctx.from.id}:${community.id}`;
    const rl = await consumeRateLimit(rateLimitKey);
    if (!rl.allowed) {
      await ctx.reply(
        `⏱️ Too many verification attempts. Try again in ${formatResetWindow(rl.resetInMs)}.`,
      );
      await ctx.scene.leave();
      return;
    }

    const hit = await lookupWhitelist(community.id, exchange, uid);
    const status = hit ? 'verified' : 'rejected';

    await upsertVerification({
      user_tg_id: ctx.from.id,
      community_id: community.id,
      uid,
      exchange,
      status,
    });

    console.log(
      `[verify] user=${ctx.from.id} community=${community.id} exchange=${exchange} uid=${maskUid(uid)} status=${status} remaining=${rl.remaining}`,
    );

    if (hit) {
      await ctx.replyWithHTML(
        [
          `✅ Verified on <b>${formatExchange(exchange)}</b>.`,
          `UID: <code>${escapeHtml(uid)}</code>`,
        ].join('\n'),
        afterSuccessKeyboard,
      );
      // Scene stays open — user exits via verify:done or /cancel
    } else {
      await ctx.replyWithHTML(
        `❌ <b>${formatExchange(exchange)}</b> UID not found in <b>${escapeHtml(community.name)}</b> whitelist.`,
        afterRejectionKeyboard,
      );
      // Scene stays open — user exits via verify:done or /cancel
    }
  });

  // Non-text messages while waiting for UID
  scene.on('message', async (ctx) => {
    await ctx.reply('Please send your UID as a text message, or /cancel.');
  });

  return scene;
};

// ── Command + action registration ─────────────────────────────────────────

export const registerVerifyFlow = (bot: Telegraf<BotContext>): void => {
  bot.command('verify', async (ctx) => {
    const from = ctx.from;
    if (!from) return;

    await upsertUser({
      tg_id: from.id,
      username: from.username ?? null,
      first_name: from.first_name ?? null,
    });

    // Group: redirect to DM
    if (ctx.state.isGroup) {
      const username = env.BOT_USERNAME;
      const community = ctx.state.community;
      const payload = community ? `${DEEP_LINK_PREFIX}${community.id}` : '';
      const dmUrl = username
        ? `https://t.me/${username}${payload ? `?start=${payload}` : ''}`
        : '';

      if (dmUrl) {
        await ctx.reply(
          '🔒 Verification happens privately. Open DM:',
          Markup.inlineKeyboard([Markup.button.url('Open DM', dmUrl)]),
        );
      } else {
        await ctx.reply('DM me directly to verify.');
      }
      return;
    }

    // DM path
    const community = ctx.state.community;
    if (!community) {
      await ctx.reply(
        'No community selected. Use the link provided by your community admin.',
      );
      return;
    }

    await ctx.scene.enter(VERIFY_SCENE_ID);
  });

  bot.command('status', async (ctx) => {
    const from = ctx.from;
    if (!from) return;

    // Group: redirect to DM (consistent with /verify)
    if (ctx.state.isGroup) {
      const username = env.BOT_USERNAME;
      const community = ctx.state.community;
      const payload = community ? `${DEEP_LINK_PREFIX}${community.id}` : '';
      const dmUrl = username
        ? `https://t.me/${username}${payload ? `?start=${payload}` : ''}`
        : '';

      if (dmUrl) {
        await ctx.reply(
          '🔒 Check your status privately. Open DM:',
          Markup.inlineKeyboard([Markup.button.url('Open DM', dmUrl)]),
        );
      } else {
        await ctx.reply('DM me directly to check your status.');
      }
      return;
    }

    const community = ctx.state.community;
    if (!community) {
      await ctx.reply(
        'No community selected. Use the link your admin provided.',
      );
      return;
    }

    const verifications = await getUserVerifications(from.id, community.id);

    if (verifications.length === 0) {
      await ctx.replyWithHTML(
        `You haven't verified yet in <b>${escapeHtml(community.name)}</b>. Tap /verify to start.`,
      );
      return;
    }

    const lines: string[] = [
      `<b>Your status in ${escapeHtml(community.name)}</b>`,
      '',
    ];
    for (const v of verifications) {
      if (v.status === 'verified') {
        lines.push(`✅ ${formatExchange(v.exchange)} — <code>${escapeHtml(v.uid)}</code>`);
      } else {
        lines.push(
          `❌ ${formatExchange(v.exchange)} — <code>${escapeHtml(v.uid)}</code> (rejected)`,
        );
      }
    }

    await ctx.replyWithHTML(lines.join('\n'));
  });
};
