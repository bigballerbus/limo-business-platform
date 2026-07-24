import { describe, expect, it } from 'vitest';
import {
  aggregateRating,
  isReviewRequestEligible,
  needsResponse,
} from '@/lib/domain/reviews/reviews';
import { canRefer, isReferralQualified, referralCode } from '@/lib/domain/referral/referral';

describe('review eligibility + aggregation', () => {
  const now = new Date('2030-02-01T00:00:00Z');

  it('is eligible only for a recently completed, un-requested booking', () => {
    const base = { bookingStatus: 'completed', completedAt: new Date('2030-01-20T00:00:00Z') };
    expect(isReviewRequestEligible({ ...base, alreadyRequested: false }, now)).toBe(true);
    expect(isReviewRequestEligible({ ...base, alreadyRequested: true }, now)).toBe(false);
  });

  it('is not eligible for an unfinished booking or one outside the window', () => {
    expect(
      isReviewRequestEligible(
        {
          bookingStatus: 'confirmed',
          completedAt: new Date('2030-01-20'),
          alreadyRequested: false,
        },
        now,
      ),
    ).toBe(false);
    expect(
      isReviewRequestEligible(
        {
          bookingStatus: 'completed',
          completedAt: new Date('2029-11-01'),
          alreadyRequested: false,
        },
        now,
      ),
    ).toBe(false);
  });

  it('averages ratings to one decimal and returns null for none', () => {
    expect(aggregateRating([5, 4, 5, 5])).toEqual({ ratingValue: 4.8, reviewCount: 4 });
    expect(aggregateRating([])).toBeNull();
  });

  it('flags an unanswered review past the response SLA', () => {
    const published = new Date('2030-01-01T00:00:00Z');
    expect(
      needsResponse(
        { respondedAt: null, publishedAt: published },
        new Date('2030-01-03T12:00:00Z'),
      ),
    ).toBe(true);
    expect(needsResponse({ respondedAt: new Date(), publishedAt: published }, now)).toBe(false);
  });
});

describe('referral rules', () => {
  it('derives a stable code and rejects self-referral', () => {
    const code = referralCode('cust-1', 'n1');
    expect(code).toMatch(/^REF-[0-9A-Z]{7}$/);
    expect(referralCode('cust-1', 'n1')).toBe(code); // deterministic
    expect(referralCode('cust-2', 'n1')).not.toBe(code);
    expect(canRefer('cust-1', 'cust-1')).toBe(false);
    expect(canRefer('cust-1', 'cust-2')).toBe(true);
  });

  it('qualifies only a pending referral whose referee has paid', () => {
    expect(
      isReferralQualified({ refereeBookingStatus: 'deposit_paid', currentStatus: 'pending' }),
    ).toBe(true);
    expect(
      isReferralQualified({ refereeBookingStatus: 'pending_deposit', currentStatus: 'pending' }),
    ).toBe(false);
    expect(
      isReferralQualified({ refereeBookingStatus: 'completed', currentStatus: 'rewarded' }),
    ).toBe(false);
  });
});
