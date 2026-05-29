/**
 * Minimal HTML escape for use with Telegram HTML parse_mode.
 */
export const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

/**
 * Extract /start payload from a message text.
 * Telegraf's ctx.startPayload was deprecated across 4.x versions, so we parse manually.
 */
export const parseStartPayload = (text: string | undefined): string => {
  if (!text) return '';
  const parts = text.split(/\s+/);
  if (parts.length < 2) return '';
  return parts[1]?.trim() ?? '';
};

/**
 * Mask a UID for safe logging — keeps first 2 and last 2 digits, stars the middle.
 * `12345678` → `12****78`; `1234` → `****`.
 */
export const maskUid = (uid: string): string => {
  if (uid.length <= 4) return '*'.repeat(uid.length);
  return `${uid.slice(0, 2)}${'*'.repeat(uid.length - 4)}${uid.slice(-2)}`;
};
