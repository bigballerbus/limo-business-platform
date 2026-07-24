import { withTenant } from '@/lib/db/client';
import { recordEvent } from '@/lib/events/publish';
import { canRefer, isReferralQualified, referralCode } from '@/lib/domain/referral/referral';

/**
 * Referral engine (spec §12). A customer issues a code; a friend redeems it;
 * when the friend's booking qualifies the referrer's reward is fulfilled. Codes
 * are derived deterministically (idempotent issue), self-referral is rejected,
 * and qualification/fulfilment are one-way, idempotent state transitions.
 */

export interface IssueResult {
  referralId: string;
  code: string;
}

export async function issueReferralCode(
  tenantId: string,
  referrerCustomerId: string,
  nonce = 'default',
): Promise<IssueResult> {
  const code = referralCode(referrerCustomerId, nonce);
  return withTenant(tenantId, async (client) => {
    const existing = await client.query<{ id: string }>(
      `SELECT id FROM referrals WHERE referrer_customer_id = $1 AND code = $2`,
      [referrerCustomerId, code],
    );
    if (existing.rows[0]) return { referralId: existing.rows[0].id, code };

    const r = await client.query<{ id: string }>(
      `INSERT INTO referrals (tenant_id, referrer_customer_id, code, status)
       VALUES ($1,$2,$3,'pending')
       RETURNING id`,
      [tenantId, referrerCustomerId, code],
    );
    return { referralId: r.rows[0]!.id, code };
  });
}

export type RedeemResult =
  | { status: 'redeemed'; referralId: string }
  | { status: 'invalid_code' }
  | { status: 'self_referral' }
  | { status: 'already_redeemed' };

export async function redeemReferral(
  tenantId: string,
  code: string,
  refereeCustomerId: string,
): Promise<RedeemResult> {
  return withTenant(tenantId, async (client) => {
    const r = await client.query<{
      id: string;
      referrer_customer_id: string;
      referee_customer_id: string | null;
    }>(`SELECT id, referrer_customer_id, referee_customer_id FROM referrals WHERE code = $1`, [
      code,
    ]);
    const referral = r.rows[0];
    if (!referral) return { status: 'invalid_code' };
    if (!canRefer(referral.referrer_customer_id, refereeCustomerId)) {
      return { status: 'self_referral' };
    }
    if (referral.referee_customer_id) return { status: 'already_redeemed' };

    await client.query(`UPDATE referrals SET referee_customer_id = $2 WHERE id = $1`, [
      referral.id,
      refereeCustomerId,
    ]);
    return { status: 'redeemed', referralId: referral.id };
  });
}

export type QualifyResult =
  { status: 'qualified'; referralId: string } | { status: 'not_qualified' };

/**
 * Qualify a referral once the referee's booking reaches a paying status. Keyed
 * to the referee so it can be driven from a booking event. Idempotent — an
 * already-qualified referral is left untouched.
 */
export async function qualifyReferralForBooking(
  tenantId: string,
  bookingId: string,
): Promise<QualifyResult> {
  return withTenant(tenantId, async (client) => {
    const b = await client.query<{ customer_id: string; status: string }>(
      `SELECT customer_id, status FROM bookings WHERE id = $1`,
      [bookingId],
    );
    const booking = b.rows[0];
    if (!booking) return { status: 'not_qualified' };

    const r = await client.query<{ id: string; status: string }>(
      `SELECT id, status FROM referrals WHERE referee_customer_id = $1 AND status = 'pending' LIMIT 1`,
      [booking.customer_id],
    );
    const referral = r.rows[0];
    if (!referral) return { status: 'not_qualified' };
    if (
      !isReferralQualified({ refereeBookingStatus: booking.status, currentStatus: referral.status })
    ) {
      return { status: 'not_qualified' };
    }

    await client.query(`UPDATE referrals SET status = 'qualified', booking_id = $2 WHERE id = $1`, [
      referral.id,
      bookingId,
    ]);
    await recordEvent(client, tenantId, {
      name: 'referral/qualified',
      data: { referralId: referral.id, bookingId },
    });
    return { status: 'qualified', referralId: referral.id };
  });
}

/** Fulfil the referrer's reward for a qualified referral. Idempotent. */
export async function fulfilReferralReward(tenantId: string, referralId: string): Promise<void> {
  await withTenant(tenantId, async (client) => {
    await client.query(
      `UPDATE referrals
          SET status = 'rewarded', reward_fulfilled_at = now()
        WHERE id = $1 AND status = 'qualified'`,
      [referralId],
    );
  });
}
