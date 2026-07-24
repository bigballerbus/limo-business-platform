/**
 * Review engine rules (spec §12) — pure logic.
 *
 * Reviews are requested after a completed service, aggregated for schema.org
 * AggregateRating, and responded to within an SLA. The eligibility, aggregation
 * and response rules are pure so they are tested once and reused by the request
 * sweep, the dashboard and the JSON-LD builder.
 */

/** How long after completion a review request is still worth sending (days). */
export const REVIEW_REQUEST_WINDOW_DAYS = 30;
/** Unresponded reviews should be answered within this many hours. */
export const REVIEW_RESPONSE_SLA_HOURS = 48;

export interface ReviewRequestState {
  bookingStatus: string;
  completedAt: Date | null;
  alreadyRequested: boolean;
}

export function isReviewRequestEligible(state: ReviewRequestState, now: Date): boolean {
  if (state.bookingStatus !== 'completed' || !state.completedAt) return false;
  if (state.alreadyRequested) return false;
  const days = (now.getTime() - state.completedAt.getTime()) / 86_400_000;
  return days >= 0 && days <= REVIEW_REQUEST_WINDOW_DAYS;
}

export interface AggregateRating {
  ratingValue: number;
  reviewCount: number;
}

/**
 * Mean rating rounded to one decimal, with the count. Returns null for an empty
 * set — a business with no reviews must not emit an AggregateRating of 0 (which
 * would be both false and penalised by search engines).
 */
export function aggregateRating(ratings: readonly number[]): AggregateRating | null {
  if (ratings.length === 0) return null;
  const sum = ratings.reduce((n, r) => n + r, 0);
  return {
    ratingValue: Math.round((sum / ratings.length) * 10) / 10,
    reviewCount: ratings.length,
  };
}

export interface ReviewResponseState {
  respondedAt: Date | null;
  publishedAt: Date;
}

/** A published review still unanswered past the SLA needs a response. */
export function needsResponse(review: ReviewResponseState, now: Date): boolean {
  if (review.respondedAt) return false;
  const hours = (now.getTime() - review.publishedAt.getTime()) / 3_600_000;
  return hours >= REVIEW_RESPONSE_SLA_HOURS;
}
