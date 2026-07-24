import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Webhook signature verification (spec §6.3). Modelled on Stripe's scheme so the
 * real adapter is a drop-in: the header is `t=<unix>,v1=<hex hmac>` and the
 * signed payload is `<t>.<rawBody>`. Verification is constant-time and rejects
 * stale timestamps to blunt replay. The secret never leaves the server.
 */
const DEFAULT_TOLERANCE_SECONDS = 300;

export function signWebhook(rawBody: string, secret: string, timestampSeconds: number): string {
  const signed = `${timestampSeconds}.${rawBody}`;
  const v1 = createHmac('sha256', secret).update(signed).digest('hex');
  return `t=${timestampSeconds},v1=${v1}`;
}

export interface VerifyOptions {
  nowSeconds: number;
  toleranceSeconds?: number;
}

/**
 * Returns true iff the header carries a valid, in-tolerance signature for the
 * exact raw body. Any malformed header, timestamp skew, or HMAC mismatch fails
 * closed (returns false) — the route rejects with 400 and processes nothing.
 */
export function verifyWebhook(
  rawBody: string,
  header: string | null | undefined,
  secret: string,
  options: VerifyOptions,
): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(',').map((kv) => {
      const [k, v] = kv.split('=');
      return [k?.trim(), v?.trim()];
    }),
  );
  const t = Number(parts.t);
  const v1 = parts.v1;
  if (!Number.isFinite(t) || !v1) return false;

  const tolerance = options.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
  if (Math.abs(options.nowSeconds - t) > tolerance) return false;

  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(v1, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
