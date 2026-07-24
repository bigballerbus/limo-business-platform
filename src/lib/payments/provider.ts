/**
 * Payment boundary (spec §6). Stripe implements this in the integrations sprint
 * (OI-12); the booking flow depends only on the interface, never on Stripe
 * directly — exactly as the messaging pipeline depends on `Notifier`, not on
 * Twilio. The stub (`stubPayments`) models the same semantics (payment intents,
 * idempotency keys, refunds, signed webhooks) so the whole deposit → confirm →
 * refund path is testable without a third party or live keys.
 */

/** Amounts are always integer pence (§3.1). */
export interface DepositIntent {
  intentId: string;
  clientSecret: string;
  amountPence: number;
}

export interface RefundResult {
  refundId: string;
  amountPence: number;
}

export type PaymentEventType = 'deposit.succeeded' | 'deposit.failed';

export interface PaymentEvent {
  id: string;
  type: PaymentEventType;
  intentId: string;
  bookingId: string;
  amountPence: number;
}

export interface CreateDepositInput {
  bookingId: string;
  amountPence: number;
  /** Stripe dedupes retried creates on this; we key it to the booking. */
  idempotencyKey: string;
}

export interface RefundInput {
  intentId: string;
  amountPence: number;
  reason: string;
}

export interface PaymentProvider {
  createDepositIntent(input: CreateDepositInput): Promise<DepositIntent>;
  refund(input: RefundInput): Promise<RefundResult>;
  /** Verify the raw request body against the signature header, then parse it. */
  parseWebhook(rawBody: string, signatureHeader: string | null | undefined): PaymentEvent;
}

export class WebhookVerificationError extends Error {
  constructor() {
    super('Payment webhook signature verification failed');
    this.name = 'WebhookVerificationError';
  }
}
