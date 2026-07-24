import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool as appClientPool } from '@/lib/db/client';
import { enterNurture, sendDueNurture } from '@/lib/crm/nurture';
import { recordReview, requestReview, tenantAggregateRating } from '@/lib/crm/reviews';
import {
  fulfilReferralReward,
  issueReferralCode,
  qualifyReferralForBooking,
  redeemReferral,
} from '@/lib/crm/referrals';
import { closePools, ensureLookups, ownerPool, uid } from './helpers/db';

/**
 * Growth engines (§10, §12): nurture ladder entry + due-touch dispatch, review
 * request + record + aggregate, and the referral lifecycle (issue → redeem →
 * qualify → reward).
 */
describe('growth: nurture, reviews, referrals', () => {
  let tenantId: string;
  let ownerId: string;
  const customerIds: string[] = [];
  const enquiryIds: string[] = [];
  const bookingIds: string[] = [];

  async function customer(): Promise<string> {
    const s = uid();
    const r = await ownerPool.query<{ id: string }>(
      `INSERT INTO customers (tenant_id, first_name, last_name, email, mobile, first_touch_source, last_touch_source)
       VALUES ($1,'Grow','Th',$2,'07123456789','organic','organic') RETURNING id`,
      [tenantId, `grow-${s}@example.com`],
    );
    customerIds.push(r.rows[0]!.id);
    return r.rows[0]!.id;
  }

  async function enquiry(customerId: string): Promise<string> {
    const r = await ownerPool.query<{ id: string }>(
      `INSERT INTO enquiries
         (tenant_id, reference, customer_id, stage, owner_id, service_type, journey_variant,
          event_date, pickup_postcode, passenger_count, source, next_action, next_action_date)
       VALUES ($1,$2,$3,'quoted',$4,'wedding','wedding','2031-06-01','ME14 1AA',2,'organic',
               'Call', now() + interval '1 day')
       RETURNING id`,
      [tenantId, `ENQ-GRW-${uid()}`, customerId, ownerId],
    );
    enquiryIds.push(r.rows[0]!.id);
    return r.rows[0]!.id;
  }

  async function booking(customerId: string, enquiryId: string, status: string): Promise<string> {
    const r = await ownerPool.query<{ id: string }>(
      `INSERT INTO bookings
         (tenant_id, reference, enquiry_id, customer_id, status, service_type,
          pickup_at, estimated_end_at, passenger_count, total_pence, deposit_pence, balance_pence, balance_due_date)
       VALUES ($1,$2,$3,$4,$5,'celebration','2031-06-01T10:00:00Z','2031-06-01T14:00:00Z',
               2,100000,20000,80000,'2031-05-18')
       RETURNING id`,
      [tenantId, `BKG-GRW-${uid()}`, enquiryId, customerId, status],
    );
    bookingIds.push(r.rows[0]!.id);
    return r.rows[0]!.id;
  }

  beforeAll(async () => {
    await ensureLookups();
    tenantId = (
      await ownerPool.query<{ id: string }>(`SELECT id FROM tenants ORDER BY created_at LIMIT 1`)
    ).rows[0]!.id;
    ownerId = (
      await ownerPool.query<{ id: string }>(
        `INSERT INTO staff (tenant_id, full_name, role, mobile, status)
         VALUES ($1,'Growth Owner','coordinator',$2,'active') RETURNING id`,
        [tenantId, `+4470003${uid().slice(0, 4)}`],
      )
    ).rows[0]!.id;
  });

  afterAll(async () => {
    if (bookingIds.length) {
      await ownerPool.query(`DELETE FROM referrals WHERE booking_id = ANY($1)`, [bookingIds]);
      await ownerPool.query(`DELETE FROM reviews WHERE booking_id = ANY($1)`, [bookingIds]);
      await ownerPool.query(`DELETE FROM notifications WHERE booking_id = ANY($1)`, [bookingIds]);
      await ownerPool.query(`DELETE FROM journeys WHERE booking_id = ANY($1)`, [bookingIds]);
      await ownerPool.query(`DELETE FROM bookings WHERE id = ANY($1)`, [bookingIds]);
    }
    if (customerIds.length) {
      await ownerPool.query(
        `DELETE FROM referrals WHERE referrer_customer_id = ANY($1) OR referee_customer_id = ANY($1)`,
        [customerIds],
      );
      await ownerPool.query(`DELETE FROM reviews WHERE customer_id = ANY($1)`, [customerIds]);
      await ownerPool.query(`DELETE FROM notifications WHERE customer_id = ANY($1)`, [customerIds]);
    }
    if (enquiryIds.length) {
      await ownerPool.query(`DELETE FROM enquiries WHERE id = ANY($1)`, [enquiryIds]);
    }
    if (customerIds.length) {
      await ownerPool.query(`DELETE FROM customers WHERE id = ANY($1)`, [customerIds]);
    }
    await ownerPool.query(`DELETE FROM staff WHERE id = $1`, [ownerId]);
    await closePools();
    await appClientPool.end();
  });

  it('enters a lead into nurture and dispatches due touches (§10)', async () => {
    const c = await customer();
    const e = await enquiry(c);

    await enterNurture(tenantId, e);
    const row = await ownerPool.query(
      `SELECT stage, nurture_reentry_date FROM enquiries WHERE id = $1`,
      [e],
    );
    expect(row.rows[0].stage).toBe('nurture');
    expect(row.rows[0].nurture_reentry_date).not.toBeNull();

    // Backdate entry so the +3 and +21 day wedding touches are due.
    await ownerPool.query(
      `UPDATE enquiries SET stage_entered_at = now() - interval '30 days' WHERE id = $1`,
      [e],
    );
    const sent = await sendDueNurture(tenantId, e);
    expect(sent).toBe(2);

    // Idempotent: the ladder does not re-send the same touches.
    expect(await sendDueNurture(tenantId, e)).toBe(0);
  });

  it('requests a review once and aggregates recorded ratings (§12)', async () => {
    const c = await customer();
    const e = await enquiry(c);
    const bookingId = await booking(c, e, 'completed');
    await ownerPool.query(
      `INSERT INTO journeys (tenant_id, booking_id, vehicle_id, staff_id, completed_at)
       SELECT $1,$2, v.id, $3, now()
         FROM vehicles v WHERE v.tenant_id = $1 LIMIT 1`,
      [tenantId, bookingId, ownerId],
    );

    const first = await requestReview(tenantId, bookingId);
    expect(first.status).toBe('requested');
    const second = await requestReview(tenantId, bookingId);
    expect(second.status).toBe('not_eligible'); // already requested

    await recordReview(tenantId, { bookingId, customerId: c, platform: 'google', rating: 5 });
    await recordReview(tenantId, { customerId: c, platform: 'google', rating: 4 });
    const agg = await tenantAggregateRating(tenantId);
    expect(agg?.reviewCount).toBeGreaterThanOrEqual(2);
    expect(agg?.ratingValue).toBeGreaterThan(0);
  });

  it('runs the referral lifecycle: issue → redeem → qualify → reward (§12)', async () => {
    const referrer = await customer();
    const referee = await customer();

    const { code, referralId } = await issueReferralCode(tenantId, referrer);
    expect(code).toMatch(/^REF-/);
    // Idempotent issue returns the same referral.
    expect((await issueReferralCode(tenantId, referrer)).referralId).toBe(referralId);

    expect((await redeemReferral(tenantId, code, referrer)).status).toBe('self_referral');
    expect((await redeemReferral(tenantId, code, referee)).status).toBe('redeemed');

    const e = await enquiry(referee);
    const bookingId = await booking(referee, e, 'deposit_paid');
    const qualified = await qualifyReferralForBooking(tenantId, bookingId);
    expect(qualified.status).toBe('qualified');

    await fulfilReferralReward(tenantId, referralId);
    const final = await ownerPool.query(
      `SELECT status, reward_fulfilled_at FROM referrals WHERE id = $1`,
      [referralId],
    );
    expect(final.rows[0].status).toBe('rewarded');
    expect(final.rows[0].reward_fulfilled_at).not.toBeNull();
  });
});
