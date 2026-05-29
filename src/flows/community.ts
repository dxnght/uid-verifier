import type { Telegraf } from 'telegraf';
import { createCommunity, getCommunityByChatId } from '../db';
import type { BotContext } from '../types';
import { escapeHtml } from '../utils/format';

/**
 * Listens for the bot's own membership changes (my_chat_member) and
 * auto-registers a new community when added to a group/supergroup.
 */
export const registerCommunityFlow = (bot: Telegraf<BotContext>): void => {
  bot.on('my_chat_member', async (ctx) => {
    const update = ctx.update.my_chat_member;
    if (!update) return;

    const chat = update.chat;
    const newStatus = update.new_chat_member.status;
    const oldStatus = update.old_chat_member.status;
    const addedBy = update.from;

    const isGroup = chat.type === 'group' || chat.type === 'supergroup';
    if (!isGroup) return;

    const wasOut = oldStatus === 'left' || oldStatus === 'kicked';
    const isIn = newStatus === 'member' || newStatus === 'administrator';
    if (!(wasOut && isIn)) return;

    // Idempotent — skip if already registered
    const existing = await getCommunityByChatId(chat.id);
    if (existing) return;

    // Verify the adder has authority to install the bot in this group.
    // Required statuses: 'creator' or 'administrator'. A regular 'member'
    // (in groups where any user can add bots) is NOT allowed to claim admin.
    let adderIsAdmin = false;
    try {
      const member = await ctx.telegram.getChatMember(chat.id, addedBy.id);
      adderIsAdmin = member.status === 'creator' || member.status === 'administrator';
    } catch (err) {
      console.warn(
        `[community] could not verify adder ${addedBy.id} in chat ${chat.id}:`,
        err instanceof Error ? err.message : err,
      );
      // Stay conservative: if we can't verify, refuse.
      adderIsAdmin = false;
    }

    if (!adderIsAdmin) {
      console.log(
        `[community] refused registration in chat ${chat.id} — adder ${addedBy.id} is not an admin`,
      );
      try {
        await ctx.telegram.sendMessage(
          addedBy.id,
          `⚠️ Only group <b>admins or owners</b> can install this bot. ` +
          `Please ask an admin of the group to add me.`,
          { parse_mode: 'HTML' },
        );
      } catch {
        // Best-effort
      }
      return;
    }

    const groupTitle =
      'title' in chat && typeof chat.title === 'string'
        ? chat.title
        : `Group ${chat.id}`;

    const community = await createCommunity({
      name: groupTitle,
      chat_id: chat.id,
      admin_tg_id: addedBy.id,
    });

    console.log(
      `[community] registered "${community.name}" (id=${community.id}, admin=${addedBy.id})`,
    );

    // Notify the admin who added the bot.
    try {
      const dmText = [
        `✅ I'm now active in <b>${escapeHtml(groupTitle)}</b>.`,
        '',
        'Next steps (DM me here):',
        '1. Upload your UID whitelist via /admin_whitelist_import (CSV).',
        '2. Members get verified via the link I share in the group.',
        '',
        `Community ID: <code>${community.id}</code>`,
      ].join('\n');
      await ctx.telegram.sendMessage(addedBy.id, dmText, {
        parse_mode: 'HTML',
      });
    } catch (err) {
      // User hasn't initiated DM with bot — Telegram refuses sendMessage.
      console.warn(
        `[community] could not DM admin ${addedBy.id}:`,
        err instanceof Error ? err.message : err,
      );
    }
  });
};
