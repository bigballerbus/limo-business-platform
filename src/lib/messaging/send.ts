import type { PoolClient } from 'pg';
import { withTenant } from '@/lib/db/client';
import { stubNotifier, type Notifier } from './notifier';
import type { Channel, OutboundMessage, SendResult } from './types';

/**
 * BC6 — message-class enforcement (spec §10.5). Order matters: master
 * suppression first, then marketing-only gates, then dispatch. Transactional
 * messages bypass every marketing check because they are contract performance,
 * not promotion, and must never be suppressed by a marketing-consent withdrawal.
 */
const MARKETING_FREQUENCY_CAP_7D = 3;

const CONSENT_CHANNEL: Partial<Record<Channel, 'email' | 'sms' | 'whatsapp'>> = {
  email: 'email',
  sms: 'sms',
  whatsapp: 'whatsapp',
};

async function record(
  client: PoolClient,
  tenantId: string,
  msg: OutboundMessage,
  status: 'sent' | 'suppressed' | 'pending',
  providerMessageId: string | null,
): Promise<void> {
  await client.query(
    `INSERT INTO notifications
       (tenant_id, customer_id, booking_id, channel, message_class, template_key, status, provider_message_id, sent_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      tenantId,
      msg.customerId,
      msg.bookingId ?? null,
      msg.channel,
      msg.messageClass,
      msg.templateKey,
      status,
      providerMessageId,
      status === 'sent' ? new Date() : null,
    ],
  );
}

export async function sendWithin(
  client: PoolClient,
  tenantId: string,
  msg: OutboundMessage,
  notifier: Notifier,
): Promise<SendResult> {
  const customer = await client.query<{
    do_not_contact: boolean;
    erasure_requested_at: Date | null;
  }>(`SELECT do_not_contact, erasure_requested_at FROM customers WHERE id = $1`, [msg.customerId]);
  const c = customer.rows[0];
  if (!c) {
    await record(client, tenantId, msg, 'suppressed', null);
    return { status: 'suppressed', reason: 'unknown_customer' };
  }

  // Master suppression applies to every class.
  if (c.do_not_contact) {
    await record(client, tenantId, msg, 'suppressed', null);
    return { status: 'suppressed', reason: 'do_not_contact' };
  }
  if (c.erasure_requested_at) {
    await record(client, tenantId, msg, 'suppressed', null);
    return { status: 'suppressed', reason: 'erasure' };
  }

  if (msg.messageClass === 'marketing') {
    const consentChannel = CONSENT_CHANNEL[msg.channel];
    const consent = consentChannel
      ? (
          await client.query<{ state: string }>(
            `SELECT state FROM consents WHERE customer_id = $1 AND channel = $2
             ORDER BY created_at DESC LIMIT 1`,
            [msg.customerId, consentChannel],
          )
        ).rows[0]?.state
      : undefined;
    if (consent !== 'granted' && consent !== 'soft_opt_in') {
      await record(client, tenantId, msg, 'suppressed', null);
      return { status: 'suppressed', reason: 'no_consent' };
    }
    const recent = await client.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM notifications
        WHERE customer_id = $1 AND channel = $2 AND message_class = 'marketing'
          AND created_at > now() - interval '7 days'`,
      [msg.customerId, msg.channel],
    );
    if (Number(recent.rows[0]?.n ?? 0) >= MARKETING_FREQUENCY_CAP_7D) {
      await record(client, tenantId, msg, 'pending', null);
      return { status: 'deferred', reason: 'frequency_cap' };
    }
  }

  const { providerMessageId } = await notifier.dispatch(msg);
  await record(client, tenantId, msg, 'sent', providerMessageId);
  return { status: 'sent', providerMessageId };
}

/** Convenience wrapper that opens a tenant-scoped transaction. */
export function sendMessage(
  tenantId: string,
  msg: OutboundMessage,
  notifier: Notifier = stubNotifier,
): Promise<SendResult> {
  return withTenant(tenantId, (client) => sendWithin(client, tenantId, msg, notifier));
}
