import { inngest } from '../client';
import { getDefaultTenant } from '@/lib/tenant/resolve';
import { requestReview } from '@/lib/crm/reviews';
import { qualifyReferralForBooking, fulfilReferralReward } from '@/lib/crm/referrals';

/**
 * Post-service review request (spec §12). Runs off booking/completed, waits a day
 * so the experience has settled, then sends the review request (once, within the
 * window — the service enforces eligibility). Durable, so the wait survives
 * deploys.
 */
export const reviewRequest = inngest.createFunction(
  { id: 'review-request', retries: 3 },
  { event: 'booking/completed' },
  async ({ event, step }) => {
    const { bookingId } = event.data;
    const tenant = await step.run('resolve-tenant', () => getDefaultTenant());

    await step.sleep('settle', '1d');
    const result = await step.run('request-review', () => requestReview(tenant.id, bookingId));
    return { bookingId, outcome: result.status };
  },
);

/**
 * Referral qualification (spec §12). When a booking reaches a paying status, a
 * pending referral for that customer qualifies and the referrer's reward is
 * fulfilled. Runs off booking/deposit.paid; idempotent at each step.
 */
export const referralQualification = inngest.createFunction(
  { id: 'referral-qualification', retries: 3 },
  { event: 'booking/deposit.paid' },
  async ({ event, step }) => {
    const { bookingId } = event.data;
    const tenant = await step.run('resolve-tenant', () => getDefaultTenant());

    const qualified = await step.run('qualify-referral', () =>
      qualifyReferralForBooking(tenant.id, bookingId),
    );
    if (qualified.status !== 'qualified') return { bookingId, referral: 'none' };

    await step.run('fulfil-reward', () => fulfilReferralReward(tenant.id, qualified.referralId));
    return { bookingId, referral: qualified.referralId };
  },
);
