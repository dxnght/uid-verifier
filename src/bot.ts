import { Scenes, session, Telegraf } from 'telegraf';
import { env } from './env';
import { chatTypeMiddleware } from './middlewares/chatType';
import { buildWhitelistImportScene, registerAdminFlow } from './flows/admin';
import { registerCommunityFlow } from './flows/community';
import { registerStartFlow } from './flows/start';
import { buildVerifyScene, registerVerifyFlow } from './flows/verify';
import type { BotContext } from './types';

/**
 * Build a Telegraf bot with middleware, scenes, and handlers registered.
 */
export const buildBot = (): Telegraf<BotContext> => {
  const bot = new Telegraf<BotContext>(env.BOT_TOKEN);

  // ── Session (in-memory; replace with Redis-backed store for production) ──
  bot.use(session());

  // ── Chat type / community resolution ─────────────────────────────────────
  bot.use(chatTypeMiddleware);

  // ── Scenes ───────────────────────────────────────────────────────────────
  const stage = new Scenes.Stage<BotContext>([
    buildVerifyScene(),
    buildWhitelistImportScene(),
  ]);
  bot.use(stage.middleware());

  // ── Flows ────────────────────────────────────────────────────────────────
  registerCommunityFlow(bot); // my_chat_member listener
  registerStartFlow(bot); // /start, /help
  registerVerifyFlow(bot); // /verify, retry/dismiss actions
  registerAdminFlow(bot); // /admin_* commands (DM + auth gate)

  // ── Global error handler ─────────────────────────────────────────────────
  bot.catch((err, ctx) => {
    console.error(
      `[bot] error in update ${ctx.update.update_id}:`,
      err instanceof Error ? err.stack : err,
    );
  });

  return bot;
};
