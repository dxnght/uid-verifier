import type { MiddlewareFn } from 'telegraf';
import { getCommunityByChatId, getCommunityById } from '../db';
import { env } from '../env';
import type { BotContext } from '../types';

/**
 * Detects chat type and resolves the active community.
 *
 * Sets on ctx.state:
 *  - isPrivate: boolean
 *  - isGroup:   boolean
 *  - community: Community | null
 *      - In a group: looked up by chat_id (null until the group is registered).
 *      - In DM:      DEFAULT_COMMUNITY_ID fallback. Deep-link payloads are
 *                    resolved inside the start flow itself (payload isn't
 *                    available at middleware time without re-parsing).
 */
export const chatTypeMiddleware: MiddlewareFn<BotContext> = async (
  ctx,
  next,
) => {
  const type = ctx.chat?.type;
  const isPrivate = type === 'private';
  const isGroup = type === 'group' || type === 'supergroup';

  ctx.state.isPrivate = isPrivate;
  ctx.state.isGroup = isGroup;
  ctx.state.community = null;

  if (isGroup && ctx.chat) {
    ctx.state.community = await getCommunityByChatId(ctx.chat.id);
  } else if (isPrivate && env.DEFAULT_COMMUNITY_ID) {
    ctx.state.community = await getCommunityById(env.DEFAULT_COMMUNITY_ID);
  }

  return next();
};
