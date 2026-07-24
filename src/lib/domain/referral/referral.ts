/**
 * Referral engine rules (spec §12) — pure logic.
 *
 * A customer refers a friend with a code; when the friend completes a qualifying
 * booking the referrer earns a reward. Code derivation, self-referral rejection
 * and qualification are pure so the same rules govern issuing, redeeming and
 * rewarding. No randomness in the domain (it would break determinism/replay):
 * the code is derived from the customer id and a per-issue nonce supplied by the
 * caller.
 */

/**
 * A short, human-friendly code derived deterministically from the referrer id
 * and a nonce. Same inputs → same code, so issuing is idempotent and testable.
 */
export function referralCode(referrerCustomerId: string, nonce: string): string {
  const seed = `${referrerCustomerId}:${nonce}`;
  let hash = 5381;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) + hash + seed.charCodeAt(i)) >>> 0;
  }
  return `REF-${hash.toString(36).toUpperCase().padStart(7, '0').slice(0, 7)}`;
}

/** A customer cannot refer themselves. */
export function canRefer(referrerCustomerId: string, refereeCustomerId: string): boolean {
  return referrerCustomerId !== refereeCustomerId;
}

export interface QualificationState {
  refereeBookingStatus: string;
  currentStatus: string;
}

/**
 * A pending referral qualifies once the referee has a booking that reaches at
 * least deposit_paid. Already-qualified/rewarded/expired referrals do not
 * re-qualify (idempotent).
 */
const QUALIFYING_BOOKING_STATUSES = ['deposit_paid', 'confirmed', 'in_service', 'completed'];

export function isReferralQualified(state: QualificationState): boolean {
  if (state.currentStatus !== 'pending') return false;
  return QUALIFYING_BOOKING_STATUSES.includes(state.refereeBookingStatus);
}

export interface RewardPolicy {
  /** Reward the referrer receives, in pence, once the referral qualifies. */
  referrerRewardPence: number;
  /** Discount the referee receives on their first booking, in pence. */
  refereeDiscountPence: number;
}

/** ⚠️ PLACEHOLDER reward policy (OI-11) — client to confirm before launch. */
export const PLACEHOLDER_REWARD_POLICY: RewardPolicy = {
  referrerRewardPence: 2500,
  refereeDiscountPence: 2500,
};
