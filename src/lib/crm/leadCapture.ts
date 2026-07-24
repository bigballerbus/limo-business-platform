import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { withTenant } from '@/lib/db/client';
import { recordEvent } from '@/lib/events/publish';
import type { PricingResult } from '@/lib/domain/pricing/types';
import type { QuoteSubmission } from '@/lib/schemas/quote';

/**
 * The enquiry critical path (spec §2.4 / §8.5). One transaction:
 *  1. upsert the customer — first_touch_source is written ONCE, never overwritten
 *  2. insert the enquiry — stage 'quoted', owner set, BC9 next-action dated +5 min
 *  3. insert the quote — the engine's snapshot (margin already ≥ floor, or it
 *     would have thrown before we got here)
 *  4. emit enquiry/created (audit-recorded now; async dispatch from Sprint 5)
 *
 * The customer never waits on a third party — messaging is dispatched
 * asynchronously by the event consumers.
 */
export interface LeadCaptureResult {
  customerId: string;
  enquiryId: string;
  quoteId: string;
  reference: string;
}

const JOURNEY_VARIANT: Record<QuoteSubmission['occasion'], string> = {
  wedding: 'wedding',
  prom: 'prom',
  airport_transfer: 'transfer',
  corporate: 'corporate',
  celebration: 'celebration',
};

function reference(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

/** Pick the enquiry owner. Interim: least-loaded active staff member. */
async function nextOwner(client: PoolClient): Promise<string> {
  const r = await client.query<{ id: string }>(
    `SELECT s.id
       FROM staff s
       LEFT JOIN enquiries e
         ON e.owner_id = s.id AND e.stage NOT IN ('won','lost','completed','repeat')
      WHERE s.status = 'active'
      GROUP BY s.id
      ORDER BY count(e.id) ASC
      LIMIT 1`,
  );
  const id = r.rows[0]?.id;
  if (!id) throw new Error('No active staff to own the enquiry');
  return id;
}

export async function captureQuoteLead(
  tenantId: string,
  input: { submission: QuoteSubmission; pricing: PricingResult },
): Promise<LeadCaptureResult> {
  const { submission, pricing } = input;
  return withTenant(tenantId, async (client) => {
    // 1. Customer — first_touch_source is write-once (untouched on conflict).
    const customer = await client.query<{ id: string }>(
      `INSERT INTO customers
         (tenant_id, first_name, last_name, email, mobile,
          first_touch_source, first_touch_at, last_touch_source, stated_source)
       VALUES ($1,$2,$3,$4,$5,$6, now(), $7, $8)
       ON CONFLICT (tenant_id, email) DO UPDATE SET
         last_touch_source = EXCLUDED.last_touch_source,
         mobile = EXCLUDED.mobile,
         stated_source = COALESCE(EXCLUDED.stated_source, customers.stated_source),
         updated_at = now()
       RETURNING id`,
      [
        tenantId,
        submission.contact.firstName,
        submission.contact.lastName,
        submission.contact.email,
        submission.contact.mobile,
        submission.attribution.firstTouch,
        submission.attribution.lastTouch,
        submission.statedSource ?? null,
      ],
    );
    const customerId = customer.rows[0]!.id;

    // 2. Enquiry — owner never null; BC9 next-action dated (5-minute standard).
    const ownerId = await nextOwner(client);
    const enquiryRef = reference('ENQ');
    const enquiry = await client.query<{ id: string }>(
      `INSERT INTO enquiries
         (tenant_id, reference, customer_id, stage, owner_id, service_type, journey_variant,
          event_date, pickup_postcode, passenger_count, source,
          next_action, next_action_date, under_18_passengers, quoted_value_pence, quote_payload)
       VALUES ($1,$2,$3,'quoted',$4,$5,$6,$7,$8,$9,$10,
               'Call customer', now() + interval '5 minutes', $11, $12, $13::jsonb)
       RETURNING id`,
      [
        tenantId,
        enquiryRef,
        customerId,
        ownerId,
        submission.occasion,
        JOURNEY_VARIANT[submission.occasion],
        submission.eventDate,
        submission.pickupPostcode,
        submission.passengerCount,
        submission.attribution.lastTouch,
        submission.hasMinors,
        pricing.totalPence,
        JSON.stringify({ input: submission, output: pricing }),
      ],
    );
    const enquiryId = enquiry.rows[0]!.id;

    // 3. Quote — the pricing snapshot (BC3 already satisfied by the engine).
    const quote = await client.query<{ id: string }>(
      `INSERT INTO quotes
         (tenant_id, enquiry_id, base_pence, distance_multiplier, seasonal_multiplier,
          day_time_multiplier, addons_pence, passthrough_pence, total_pence,
          vat_rate_pct, vat_pence, net_pence, estimated_cost_pence, contribution_margin_pct,
          is_range, range_low_pence, range_high_pence, valid_until)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17, now() + interval '14 days')
       RETURNING id`,
      [
        tenantId,
        enquiryId,
        pricing.basePence,
        pricing.distanceMultiplier,
        pricing.seasonalMultiplier,
        pricing.dayTimeMultiplier,
        pricing.addonsPence,
        pricing.passthroughPence,
        pricing.totalPence,
        pricing.vatRatePct,
        pricing.vatPence,
        pricing.netPence,
        pricing.estimatedCostPence,
        pricing.contributionMarginPct,
        pricing.confidence === 'range',
        pricing.rangeLowPence ?? null,
        pricing.rangeHighPence ?? null,
      ],
    );
    const quoteId = quote.rows[0]!.id;

    // 4. Emit the domain event (recorded now; dispatched async from Sprint 5).
    await recordEvent(client, tenantId, {
      name: 'enquiry/created',
      data: { enquiryId, source: submission.attribution.lastTouch },
    });

    return { customerId, enquiryId, quoteId, reference: enquiryRef };
  });
}
