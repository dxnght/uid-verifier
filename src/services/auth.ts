import { env } from '../env';
import type { Community } from '../types';

/**
 * Two-tier auth:
 *  - Operator: bot-wide super-admin (env.OPERATOR_IDS). Can act in any community.
 *  - Community admin: owner of a specific community (communities.admin_tg_id).
 *
 * isAdmin(tgId, community) returns true if EITHER condition holds.
 * Community may be null when no DEFAULT_COMMUNITY_ID is set and the user
 * hasn't arrived via deep-link — in that case only operators pass.
 */

export const isOperator = (tgId: number): boolean =>
  env.OPERATOR_IDS.includes(tgId);

export const isCommunityAdmin = (
  tgId: number,
  community: Community,
): boolean => community.admin_tg_id === tgId;

export const isAdmin = (
  tgId: number,
  community: Community | null | undefined,
): boolean => {
  if (isOperator(tgId)) return true;
  if (!community) return false;
  return isCommunityAdmin(tgId, community);
};
