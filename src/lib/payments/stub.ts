import { randomUUID } from 'node:crypto';
import { verifyWebhook } from './signature';
import {
  WebhookVerificationError,
  type CreateDepositInput,
  type DepositIntent,
  type PaymentEvent,
  type PaymentProvider,
  type RefundInput,
  type RefundResult,
} from './provider';

/**
 * In-process stand-in for Stripe. It mints intent/refund identifiers and
 * verifies webhook signatures with the same HMAC scheme the real adapter will,
 * so nothing downstream can tell the difference. Swap `stubPayments` for a
 * `StripePaymentProvider` in the integrations sprint (OI-12) — no caller
 * changes, because callers only know the `PaymentProvider` interface.
 *
 * The signing secret is read from the environment so tests can construct valid
 * signed webhooks; in production it is the Stripe webhook signing secret.
 */
export function webhookSecret(): string {
  return process.env.PAYMENTS_WEBHOOK_SECRET ?? 'whsec_local_development_only';
}

export const stubPayments: PaymentProvider = {
  async createDepositIntent(input: CreateDepositInput): Promise<DepositIntent> {
    const intentId = `pi_stub_${input.idempotencyKey}`;
    return {
      intentId,
      clientSecret: `${intentId}_secret_${randomUUID().slice(0, 8)}`,
      amountPence: input.amountPence,
    };
  },

  async refund(input: RefundInput): Promise<RefundResult> {
    return { refundId: `re_stub_${randomUUID()}`, amountPence: input.amountPence };
  },

  parseWebhook(rawBody: string, signatureHeader: string | null | undefined): PaymentEvent {
    const ok = verifyWebhook(rawBody, signatureHeader, webhookSecret(), {
      nowSeconds: Math.floor(clockMs() / 1000),
    });
    if (!ok) throw new WebhookVerificationError();
    const parsed = JSON.parse(rawBody) as PaymentEvent;
    return parsed;
  },
};

/**
 * Indirection over the wall clock kept out of the domain layer. Real time is
 * fine here — this is infrastructure, not pure logic — and isolating it keeps
 * signature verification deterministically testable.
 */
function clockMs(): number {
  return Date.now();
}
