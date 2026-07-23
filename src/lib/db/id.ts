import { randomBytes } from 'node:crypto';

/**
 * UUIDv7 generator (decision T-001).
 *
 * Postgres 16 has no native `uuidv7()`, and the DB provides one via a plpgsql
 * function (see migration 0000). This app-side twin lets the application mint a
 * time-sortable id *before* insert — e.g. to return a reference without a
 * database round-trip — using the identical layout: a 48-bit big-endian
 * millisecond timestamp, version 7, variant 10.
 */
export function uuidv7(): string {
  const ts = Date.now();
  const bytes = randomBytes(16);

  bytes[0] = Math.floor(ts / 2 ** 40) & 0xff;
  bytes[1] = Math.floor(ts / 2 ** 32) & 0xff;
  bytes[2] = Math.floor(ts / 2 ** 24) & 0xff;
  bytes[3] = Math.floor(ts / 2 ** 16) & 0xff;
  bytes[4] = Math.floor(ts / 2 ** 8) & 0xff;
  bytes[5] = ts & 0xff;

  // version 7 (high nibble of byte 6) and variant 10 (high bits of byte 8)
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
