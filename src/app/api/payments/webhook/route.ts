import { NextResponse } from 'next/server';
import { confirmBalancePaid, confirmDepositAndAssign } from '@/lib/crm/booking';
import { stubPayments } from '@/lib/payments/stub';
import { WebhookVerificationError } from '@/lib/payments/provider';
import { getDefaultTenant } from '@/lib/tenant/resolve';
import { newTraceId, traceLog } from '@/lib/observability/trace';

/**
 * Payment webhook (spec §6.3). The raw request body is read verbatim — never
 * re-serialised — because the signature is computed over the exact bytes.
 * Verification and idempotency live in the provider and the booking service;
 * this route only translates HTTP ↔ domain and always answers 2xx once the
 * event is safely handled so the provider stops retrying.
 */
export async function POST(request: Request): Promise<Response> {
  const traceId = newTraceId();
  const rawBody = await request.text();
  const signature = request.headers.get('stripe-signature');

  let event;
  try {
    event = stubPayments.parseWebhook(rawBody, signature);
  } catch (error) {
    if (error instanceof WebhookVerificationError) {
      traceLog(traceId, 'payment_webhook_bad_signature', {});
      return NextResponse.json({ error: 'invalid signature' }, { status: 400 });
    }
    throw error;
  }

  const tenant = await getDefaultTenant();

  if (event.type === 'deposit.succeeded') {
    const result = await confirmDepositAndAssign(tenant.id, { intentId: event.intentId });
    traceLog(traceId, 'payment_webhook_processed', {
      bookingId: result.bookingId,
      outcome: result.status,
    });
    return NextResponse.json({ received: true, outcome: result.status });
  }

  if (event.type === 'balance.succeeded') {
    const result = await confirmBalancePaid(tenant.id, event.intentId);
    traceLog(traceId, 'payment_webhook_processed', {
      bookingId: result.bookingId,
      outcome: result.status,
    });
    return NextResponse.json({ received: true, outcome: result.status });
  }

  // deposit.failed / balance.failed and any future types are acknowledged; the
  // booking simply stays where it is and the never-forgotten-lead sweep and the
  // balance reminder ladder pick it up.
  traceLog(traceId, 'payment_webhook_ignored', { type: event.type });
  return NextResponse.json({ received: true });
}
