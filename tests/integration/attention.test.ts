import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool as appClientPool } from '@/lib/db/client';
import {
  findNeedsAttention,
  recordDeadLetter,
  resolveDeadLetter,
  sweepOrphans,
} from '@/lib/crm/attentionSweep';
import { closePools, ensureLookups, ownerPool, uid } from './helpers/db';

/**
 * Never-forgotten-lead sweep + dead-letter queue (§13, BC9). Proves an overdue
 * open lead surfaces on the dashboard and is re-driven by the sweep; a stalled
 * deposit surfaces; and a dead-letter surfaces until it is resolved.
 */
describe('needs-attention sweep + dead letters', () => {
  let tenantId: string;
  let ownerId: string;
  let customerId: string;
  const enquiryIds: string[] = [];
  const bookingIds: string[] = [];
  const deadLetterRefs: string[] = [];

  beforeAll(async () => {
    await ensureLookups();
    const t = await ownerPool.query<{ id: string }>(
      `SELECT id FROM tenants ORDER BY created_at LIMIT 1`,
    );
    tenantId = t.rows[0]!.id;
    const s = uid();
    const owner = await ownerPool.query<{ id: string }>(
      `INSERT INTO staff (tenant_id, full_name, role, mobile, status)
       VALUES ($1,'Attention Owner','coordinator',$2,'active') RETURNING id`,
      [tenantId, `+4470002${s.slice(0, 4)}`],
    );
    ownerId = owner.rows[0]!.id;
    const cust = await ownerPool.query<{ id: string }>(
      `INSERT INTO customers (tenant_id, first_name, last_name, email, mobile, first_touch_source, last_touch_source)
       VALUES ($1,'Att','Ention',$2,'07123456789','organic','organic') RETURNING id`,
      [tenantId, `att-${s}@example.com`],
    );
    customerId = cust.rows[0]!.id;
  });

  afterAll(async () => {
    if (bookingIds.length)
      await ownerPool.query(`DELETE FROM bookings WHERE id = ANY($1)`, [bookingIds]);
    if (enquiryIds.length) {
      await ownerPool.query(`DELETE FROM activities WHERE enquiry_id = ANY($1)`, [enquiryIds]);
      await ownerPool.query(`DELETE FROM enquiries WHERE id = ANY($1)`, [enquiryIds]);
    }
    if (deadLetterRefs.length)
      await ownerPool.query(`DELETE FROM dead_letters WHERE reference = ANY($1)`, [deadLetterRefs]);
    await ownerPool.query(`DELETE FROM customers WHERE id = $1`, [customerId]);
    await ownerPool.query(`DELETE FROM staff WHERE id = $1`, [ownerId]);
    await closePools();
    await appClientPool.end();
  });

  async function overdueEnquiry(): Promise<string> {
    const ref = `ENQ-ATT-${uid()}`;
    const r = await ownerPool.query<{ id: string }>(
      `INSERT INTO enquiries
         (tenant_id, reference, customer_id, stage, owner_id, service_type, journey_variant,
          event_date, pickup_postcode, passenger_count, source, next_action, next_action_date)
       VALUES ($1,$2,$3,'quoted',$4,'wedding','wedding','2031-06-01','ME14 1AA',2,'organic',
               'Call customer', now() - interval '1 day')
       RETURNING id`,
      [tenantId, ref, customerId, ownerId],
    );
    enquiryIds.push(r.rows[0]!.id);
    return ref;
  }

  it('surfaces an overdue lead and re-drives it (BC9)', async () => {
    const ref = await overdueEnquiry();

    const before = await findNeedsAttention(tenantId);
    const found = before.find((i) => i.reference === ref);
    expect(found?.kind).toBe('overdue_next_action');
    expect(found?.severity).toBe('critical'); // a day overdue

    const swept = await sweepOrphans(tenantId);
    expect(swept.reDriven).toBeGreaterThanOrEqual(1);

    // Re-driven: next action is now in the future, so it no longer needs attention.
    const after = await findNeedsAttention(tenantId);
    expect(after.find((i) => i.reference === ref)).toBeUndefined();

    const activity = await ownerPool.query(
      `SELECT count(*)::int AS n FROM activities
        WHERE enquiry_id = (SELECT id FROM enquiries WHERE reference = $1) AND type = 'system'`,
      [ref],
    );
    expect(activity.rows[0].n).toBeGreaterThanOrEqual(1);
  });

  it('surfaces a stalled pending deposit', async () => {
    const ref = await overdueEnquiry();
    const enquiryId = (
      await ownerPool.query<{ id: string }>(`SELECT id FROM enquiries WHERE reference = $1`, [ref])
    ).rows[0]!.id;
    const bookingRef = `BKG-ATT-${uid()}`;
    const b = await ownerPool.query<{ id: string }>(
      `INSERT INTO bookings
         (tenant_id, reference, enquiry_id, customer_id, status, service_type,
          pickup_at, estimated_end_at, passenger_count, total_pence, deposit_pence, balance_pence,
          balance_due_date, created_at)
       VALUES ($1,$2,$3,$4,'pending_deposit','wedding',
               '2031-06-01T10:00:00Z','2031-06-01T14:00:00Z',2,100000,20000,80000,'2031-05-18',
               now() - interval '2 hours')
       RETURNING id`,
      [tenantId, bookingRef, enquiryId, customerId],
    );
    bookingIds.push(b.rows[0]!.id);

    const items = await findNeedsAttention(tenantId);
    const found = items.find((i) => i.reference === bookingRef);
    expect(found?.kind).toBe('stalled_deposit');
  });

  it('surfaces a dead-letter until it is resolved', async () => {
    const ref = `dl-${uid()}`;
    deadLetterRefs.push(ref);
    const { id } = await recordDeadLetter(tenantId, {
      source: 'payment_webhook',
      reference: ref,
      error: 'confirmDepositAndAssign threw after retries',
      payload: { intentId: 'pi_test' },
    });

    const before = await findNeedsAttention(tenantId);
    expect(before.find((i) => i.reference === ref)?.kind).toBe('dead_letter');

    await resolveDeadLetter(tenantId, id);

    const after = await findNeedsAttention(tenantId);
    expect(after.find((i) => i.reference === ref)).toBeUndefined();
  });
});
