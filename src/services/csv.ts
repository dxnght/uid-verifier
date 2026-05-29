import {
  isExchange,
  type Exchange,
  type VerificationExportRow,
  type WhitelistEntry,
} from '../types';
import { isValidUid } from './verification';

export type ImportErrorReason =
  | 'invalid_columns'
  | 'invalid_exchange'
  | 'invalid_uid';

export interface WhitelistImportEntry {
  exchange: Exchange;
  uid: string;
}

export interface WhitelistImportError {
  row: number;
  raw: string;
  reason: ImportErrorReason;
}

export interface WhitelistImportResult {
  entries: WhitelistImportEntry[];
  errors: WhitelistImportError[];
}

export type { VerificationExportRow };

export const parseWhitelistCsv = (text: string): WhitelistImportResult => {
  const entries: WhitelistImportEntry[] = [];
  const errors: WhitelistImportError[] = [];

  // Strip UTF-8 BOM
  const stripped = text.startsWith('﻿') ? text.slice(1) : text;

  const rawLines = stripped.split(/\r?\n/);

  let headerSkipped = false;

  for (let i = 0; i < rawLines.length; i++) {
    const rawLine = rawLines[i] ?? '';
    const line = rawLine.trim();
    const rowNumber = i + 1; // 1-based, counts all lines including header and blanks

    if (line === '') continue;

    // Detect and skip header on the first non-empty line
    if (!headerSkipped && line.toLowerCase() === 'exchange,uid') {
      headerSkipped = true;
      continue;
    }
    headerSkipped = true; // treat first non-empty non-header line as data

    const fields = line.split(',').map((f) => f.trim());

    if (fields.length !== 2) {
      errors.push({
        row: rowNumber,
        raw: rawLine.length > 80 ? rawLine.slice(0, 80) + '…' : rawLine,
        reason: 'invalid_columns',
      });
      continue;
    }

    const [rawExchange, rawUid] = fields;

    if (!rawExchange || !isExchange(rawExchange)) {
      errors.push({
        row: rowNumber,
        raw: rawLine.length > 80 ? rawLine.slice(0, 80) + '…' : rawLine,
        reason: 'invalid_exchange',
      });
      continue;
    }

    if (!rawUid || !isValidUid(rawUid)) {
      errors.push({
        row: rowNumber,
        raw: rawLine.length > 80 ? rawLine.slice(0, 80) + '…' : rawLine,
        reason: 'invalid_uid',
      });
      continue;
    }

    entries.push({ exchange: rawExchange, uid: rawUid });
  }

  return { entries, errors };
};

const csvEscapeField = (value: string): string => {
  if (/[,"\n\r]/.test(value)) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
};

export const formatWhitelistCsv = (rows: WhitelistEntry[]): string => {
  const header = 'exchange,uid';
  const lines: string[] = [header];
  for (const row of rows) {
    lines.push(
      [csvEscapeField(row.exchange), csvEscapeField(row.uid)].join(','),
    );
  }
  return lines.join('\r\n') + '\r\n';
};

export const formatVerificationsCsv = (
  rows: VerificationExportRow[],
): string => {
  const header = 'user_tg_id,username,uid,exchange,status,attempted_at';
  const lines: string[] = [header];

  for (const row of rows) {
    const fields = [
      String(row.user_tg_id),
      row.username ?? '',
      row.uid,
      row.exchange,
      row.status,
      row.attempted_at,
    ];
    lines.push(fields.map(csvEscapeField).join(','));
  }

  return lines.join('\r\n') + '\r\n';
};
