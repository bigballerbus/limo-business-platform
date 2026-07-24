import { describe, expect, it } from 'vitest';
import { signWebhook, verifyWebhook } from '@/lib/payments/signature';

const secret = 'whsec_test_secret';
const body = JSON.stringify({ type: 'deposit.succeeded', intentId: 'pi_1', amountPence: 5000 });
const now = 1_800_000_000; // fixed reference time (seconds)

describe('webhook signature', () => {
  it('verifies a signature it produced', () => {
    const header = signWebhook(body, secret, now);
    expect(verifyWebhook(body, header, secret, { nowSeconds: now })).toBe(true);
  });

  it('rejects a tampered body', () => {
    const header = signWebhook(body, secret, now);
    expect(verifyWebhook(body + ' ', header, secret, { nowSeconds: now })).toBe(false);
  });

  it('rejects a wrong secret', () => {
    const header = signWebhook(body, secret, now);
    expect(verifyWebhook(body, header, 'whsec_other', { nowSeconds: now })).toBe(false);
  });

  it('rejects a stale timestamp beyond tolerance', () => {
    const header = signWebhook(body, secret, now);
    expect(verifyWebhook(body, header, secret, { nowSeconds: now + 10_000 })).toBe(false);
  });

  it('fails closed on a missing or malformed header', () => {
    expect(verifyWebhook(body, null, secret, { nowSeconds: now })).toBe(false);
    expect(verifyWebhook(body, '', secret, { nowSeconds: now })).toBe(false);
    expect(verifyWebhook(body, `t=${now}`, secret, { nowSeconds: now })).toBe(false);
  });
});
