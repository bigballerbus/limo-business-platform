import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool as appClientPool } from '@/lib/db/client';
import { sendMessage } from '@/lib/messaging/send';
import { closePools, ownerPool, uid } from './helpers/db';

/**
 * BC6 — message-class enforcement (spec §10.5). Transactional messages always
 * send; marketing is suppressed for do-not-contact / no-consent customers. A
 * marketing-consent state must never suppress a transactional message.
 */
describe('send gate (BC6)', () => {
  let tenantId: string;
  const created: string[] = [];

  async function makeCustomer(over: { doNotContact?: boolean } = {}): Promise<string> {
    const email = `send-${uid()}@example.com`;
    const r = await ownerPool.query<{ id: string }>(
      `INSERT INTO customers (tenant_id, first_name, last_name, email, mobile,
                              first_touch_source, last_touch_source, do_not_contact)
       VALUES ($1,'Test','User',$2,'+447000000000','organic','organic',$3) RETURNING id`,
      [tenantId, email, over.doNotContact ?? false],
    );
    created.push(r.rows[0]!.id);
    return r.rows[0]!.id;
  }

  beforeAll(async () => {
    const t = await ownerPool.query<{ id: string }>(
      `SELECT id FROM tenants ORDER BY created_at LIMIT 1`,
    );
    tenantId = t.rows[0]!.id;
  });

  afterAll(async () => {
    if (created.length) {
      await ownerPool.query(`DELETE FROM notifications WHERE customer_id = ANY($1)`, [created]);
      await ownerPool.query(`DELETE FROM consents WHERE customer_id = ANY($1)`, [created]);
      await ownerPool.query(`DELETE FROM customers WHERE id = ANY($1)`, [created]);
    }
    await closePools();
    await appClientPool.end();
  });

  it('do-not-contact is a master suppression that blocks every class', async () => {
    const customerId = await makeCustomer({ doNotContact: true });

    const marketing = await sendMessage(tenantId, {
      customerId,
      channel: 'email',
      messageClass: 'marketing',
      templateKey: 'newsletter',
    });
    expect(marketing).toEqual({ status: 'suppressed', reason: 'do_not_contact' });

    const transactional = await sendMessage(tenantId, {
      customerId,
      channel: 'email',
      messageClass: 'transactional',
      templateKey: 'quote_instant_response',
    });
    expect(transactional).toEqual({ status: 'suppressed', reason: 'do_not_contact' });
  });

  it('marketing needs consent, but transactional always sends regardless (BC6)', async () => {
    const customerId = await makeCustomer();

    // No marketing consent → marketing is suppressed…
    const noConsent = await sendMessage(tenantId, {
      customerId,
      channel: 'email',
      messageClass: 'marketing',
      templateKey: 'newsletter',
    });
    expect(noConsent).toEqual({ status: 'suppressed', reason: 'no_consent' });

    // …but the transactional message sends anyway — the core BC6 guarantee.
    const transactional = await sendMessage(tenantId, {
      customerId,
      channel: 'email',
      messageClass: 'transactional',
      templateKey: 'quote_instant_response',
    });
    expect(transactional.status).toBe('sent');

    // Once consent is granted, marketing sends too.
    await ownerPool.query(
      `INSERT INTO consents (tenant_id, customer_id, channel, state, basis, wording_shown, granted_at)
       VALUES ($1,$2,'email','granted','consent','I agree to marketing emails', now())`,
      [tenantId, customerId],
    );
    const withConsent = await sendMessage(tenantId, {
      customerId,
      channel: 'email',
      messageClass: 'marketing',
      templateKey: 'newsletter',
    });
    expect(withConsent.status).toBe('sent');
  });
});
