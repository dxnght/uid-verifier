import type { Exchange } from '../types';

/**
 * UID format: 6–12 digit numeric.
 * Covers Binance (typically 8–10), Bybit, OKX, and most major CEXes.
 */
export const UID_REGEX = /^\d{6,12}$/;

export const isValidUid = (s: string): boolean => UID_REGEX.test(s);

export const EXCHANGE_LABELS: Record<Exchange, string> = {
  binance: 'Binance',
  bybit: 'Bybit',
  other: 'Other',
};

export const formatExchange = (e: Exchange): string => EXCHANGE_LABELS[e];
