import { withTenant } from '@/lib/db/client';
import { recordEvent } from '@/lib/events/publish';
import { sendMessage } from '@/lib/messaging/send';
import { aggregateRating, isReviewRequestEligible } from '@/lib/domain/reviews/reviews';

/**
 * Review engine (spec §12). Requests a review after a completed service (once,
 * within the window), records inbound reviews for aggregation and proof, and
 * exposes the tenant's aggregate rating for the LocalBusiness schema.
 */

export type ReviewPlatform = 'google' | 'facebook' | 'trustpilot' | 'internal';

export interface RequestReviewResult {
  status: 'requested' | 'not_eligible';
}

export async function requestReview(
  tenantId: string,
  bookingId: string,
): Promise<RequestReviewResult> {
  return withTenant(tenantId, async (client) => {
    const b = await client.query<{
      status: string;
      customer_id: string;
      completed_at: Date | null;
    }>(
      `SELECT b.status, b.customer_id,
              (SELECT j.completed_at FROM journeys j WHERE j.booking_id = b.id) AS completed_at
         FROM bookings b WHERE b.id = $1`,
      [bookingId],
    );
    const booking = b.rows[0];
    if (!booking) return { status: 'not_eligible' };

    const requested = await client.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM notifications
        WHERE booking_id = $1 AND template_key = 'review_request'`,
      [bookingId],
    );
    const alreadyRequested = Number(requested.rows[0]?.n ?? 0) > 0;

    if (
      !isReviewRequestEligible(
        {
          bookingStatus: booking.status,
          completedAt: booking.completed_at,
          alreadyRequested,
        },
        new Date(),
      )
    ) {
      return { status: 'not_eligible' };
    }

    await sendMessage(tenantId, {
      customerId: booking.customer_id,
      bookingId,
      channel: 'email',
      messageClass: 'marketing',
      templateKey: 'review_request',
    });
    return { status: 'requested' };
  });
}

export interface RecordReviewInput {
  bookingId?: string | null;
  customerId?: string | null;
  platform: ReviewPlatform;
  rating: number;
  body?: string;
  authorName?: string;
  publishedAt?: Date;
  externalId?: string;
}

export async function recordReview(
  tenantId: string,
  input: RecordReviewInput,
): Promise<{ reviewId: string }> {
  return withTenant(tenantId, async (client) => {
    const r = await client.query<{ id: string }>(
      `INSERT INTO reviews
         (tenant_id, booking_id, customer_id, platform, external_id, rating, body, author_name, published_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, COALESCE($9, now()))
       RETURNING id`,
      [
        tenantId,
        input.bookingId ?? null,
        input.customerId ?? null,
        input.platform,
        input.externalId ?? null,
        input.rating,
        input.body ?? null,
        input.authorName ?? null,
        input.publishedAt ?? null,
      ],
    );
    const reviewId = r.rows[0]!.id;
    await recordEvent(client, tenantId, {
      name: 'review/received',
      data: { reviewId, rating: input.rating },
    });
    return { reviewId };
  });
}

/** The tenant's aggregate rating for schema.org — null when there are none. */
export async function tenantAggregateRating(tenantId: string) {
  return withTenant(tenantId, async (client) => {
    const r = await client.query<{ rating: number }>(`SELECT rating FROM reviews`);
    return aggregateRating(r.rows.map((row) => row.rating));
  });
}
