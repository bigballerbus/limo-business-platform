import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool as appClientPool } from '@/lib/db/client';
import { calculateQuote } from '@/lib/domain/pricing/engine';
import { PLACEHOLDER_RATE_CARD } from '@/lib/domain/pricing/ratecard';
import { toPricingInput } from '@/lib/domain/quote/mapToPricing';
import { captureQuoteLead } from '@/lib/crm/leadCapture';
import { QuoteSubmissionSchema, type QuoteSubmission } from '@/lib/schemas/quote';
import { closePools, ownerPool, uid } from './helpers/db';

/**
 * Proves the enquiry critical path (§2.4 / §8.5): captureQuoteLead writes
 * customer + enquiry + quote atomically, dates a BC9 next action, and treats
 * first_touch_source as write-once across repeat submissions.
 */
describe('captureQuoteLead', () => {
  let tenantId: string;
  let base: { lng: number; lat: number };
  const emails: string[] = [];

  beforeAll(async () => {
    const t = await ownerPool.query<{ id: string; lng: number; lat: number }>(
      `SELECT id, ST_X(base_location::geometry) AS lng, ST_Y(base_location::geometry) AS lat
         FROM tenants ORDER BY created_at LIMIT 1`,
    );
    tenantId = t.rows[0]!.id;
    base = { lng: t.rows[0]!.lng, lat: t.rows[0]!.lat };
    // Ensure the tenant has an active owner for the enquiry.
    await ownerPool.query(
      `INSERT INTO staff (tenant_id, full_name, role, mobile, status)
       SELECT $1,'Lead Test Owner','coordinator','+447000000009','active'
       WHERE NOT EXISTS (SELECT 1 FROM staff WHERE tenant_id = $1 AND status = 'active')`,
      [tenantId],
    );
  });

  afterAll(async () => {
    if (emails.length) {
      await ownerPool.query(
        `DELETE FROM quotes WHERE enquiry_id IN (
           SELECT e.id FROM enquiries e JOIN customers c ON c.id = e.customer_id WHERE c.email = ANY($1))`,
        [emails],
      );
      await ownerPool.query(
        `DELETE FROM enquiries WHERE customer_id IN (SELECT id FROM customers WHERE email = ANY($1))`,
        [emails],
      );
      await ownerPool.query(`DELETE FROM customers WHERE email = ANY($1)`, [emails]);
    }
    await closePools();
    await appClientPool.end();
  });

  function submissionFor(email: string, firstTouch: string, lastTouch: string): QuoteSubmission {
    return QuoteSubmissionSchema.parse({
      occasion: 'wedding',
      eventDate: new Date(Date.now() + 120 * 86400000).toISOString(),
      pickupPostcode: 'ME14 1AA',
      destinationType: 'return',
      passengerCount: 2,
      durationHours: 3,
      vehicleTier: 'saloon',
      addons: [],
      contact: { firstName: 'Grace', lastName: 'Hopper', email, mobile: '07123456789' },
      attribution: { firstTouch, lastTouch },
    });
  }

  function priceFor(submission: QuoteSubmission) {
    return calculateQuote(
      toPricingInput(submission, {
        base,
        pickup: { lng: base.lng + 0.02, lat: base.lat + 0.01 },
        destination: base,
      }),
      PLACEHOLDER_RATE_CARD,
    );
  }

  it('writes customer, enquiry and quote atomically with a BC9 next action', async () => {
    const email = `lead-${uid()}@example.com`;
    emails.push(email);
    const submission = submissionFor(email, 'google', 'google');
    const pricing = priceFor(submission);

    const result = await captureQuoteLead(tenantId, { submission, pricing });
    expect(result.reference).toMatch(/^ENQ-/);

    const enquiry = await ownerPool.query(
      `SELECT stage, next_action, next_action_date, source, quoted_value_pence FROM enquiries WHERE id = $1`,
      [result.enquiryId],
    );
    expect(enquiry.rows[0].stage).toBe('quoted');
    expect(enquiry.rows[0].next_action).toBe('Call customer');
    expect(new Date(enquiry.rows[0].next_action_date).getTime()).toBeGreaterThan(Date.now());
    expect(enquiry.rows[0].source).toBe('google');
    expect(enquiry.rows[0].quoted_value_pence).toBe(pricing.totalPence);

    const quote = await ownerPool.query(
      `SELECT total_pence, contribution_margin_pct FROM quotes WHERE id = $1`,
      [result.quoteId],
    );
    expect(quote.rows[0].total_pence).toBe(pricing.totalPence);
    expect(Number(quote.rows[0].contribution_margin_pct)).toBeGreaterThanOrEqual(35);
  });

  it('never overwrites first_touch_source on a repeat submission', async () => {
    const email = `lead-${uid()}@example.com`;
    emails.push(email);

    const first = submissionFor(email, 'facebook', 'facebook');
    await captureQuoteLead(tenantId, { submission: first, pricing: priceFor(first) });

    const second = submissionFor(email, 'paid_search', 'paid_search');
    await captureQuoteLead(tenantId, { submission: second, pricing: priceFor(second) });

    const customer = await ownerPool.query(
      `SELECT first_touch_source, last_touch_source FROM customers WHERE email = $1`,
      [email],
    );
    expect(customer.rows[0].first_touch_source).toBe('facebook'); // write-once
    expect(customer.rows[0].last_touch_source).toBe('paid_search'); // updated
  });
});
