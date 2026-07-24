import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool as appClientPool } from '@/lib/db/client';
import { calculateQuote } from '@/lib/domain/pricing/engine';
import { PLACEHOLDER_RATE_CARD } from '@/lib/domain/pricing/ratecard';
import { toPricingInput } from '@/lib/domain/quote/mapToPricing';
import { captureMultiVehicleLead, captureQuoteLead } from '@/lib/crm/leadCapture';
import { QuoteSubmissionSchema, type QuoteSubmission } from '@/lib/schemas/quote';
import { closePools, ownerPool, uid } from './helpers/db';

/**
 * BC1 and BC2 on the enquiry critical path:
 *  - a 9+ party is never single-vehicle quoted, but the lead is captured (no
 *    quote row) and routed to a human — it is never lost.
 *  - a minors booking captures the parent/guardian as a linked contact and
 *    flags the enquiry as carrying under-18s.
 */
describe('safeguarding + capacity lead capture', () => {
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
    await ownerPool.query(
      `INSERT INTO staff (tenant_id, full_name, role, mobile, status)
       SELECT $1,'Safeguarding Test Owner','coordinator','+447000000019','active'
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
        `DELETE FROM enquiries WHERE customer_id IN (SELECT id FROM customers WHERE email = ANY($1))
           OR parent_contact_id IN (SELECT id FROM customers WHERE email = ANY($1))`,
        [emails],
      );
      await ownerPool.query(`DELETE FROM customers WHERE email = ANY($1)`, [emails]);
    }
    await closePools();
    await appClientPool.end();
  });

  function submission(over: Partial<Record<string, unknown>> = {}): QuoteSubmission {
    return QuoteSubmissionSchema.parse({
      occasion: 'prom',
      eventDate: new Date(Date.now() + 90 * 86400000).toISOString(),
      pickupPostcode: 'ME14 1AA',
      destinationType: 'return',
      passengerCount: 2,
      durationHours: 3,
      vehicleTier: 'stretch_limo',
      addons: [],
      contact: {
        firstName: 'Alan',
        lastName: 'Turing',
        email: `sg-${uid()}@example.com`,
        mobile: '07123456789',
      },
      attribution: { firstTouch: 'organic', lastTouch: 'organic' },
      ...over,
    });
  }

  it('captures a 9+ party as a human-routed lead with no quote (BC1)', async () => {
    const sub = submission({ passengerCount: 12 });
    emails.push(sub.contact.email);

    const result = await captureMultiVehicleLead(tenantId, sub);
    expect(result.reference).toMatch(/^ENQ-/);

    const enquiry = await ownerPool.query(
      `SELECT stage, next_action, passenger_count FROM enquiries WHERE id = $1`,
      [result.enquiryId],
    );
    expect(enquiry.rows[0].stage).toBe('enquiry');
    expect(enquiry.rows[0].next_action).toBe('Provide multi-vehicle quote');
    expect(enquiry.rows[0].passenger_count).toBe(12);

    // The lead is captured, but a single-vehicle quote is never fabricated.
    const quotes = await ownerPool.query(
      `SELECT count(*)::int AS n FROM quotes WHERE enquiry_id = $1`,
      [result.enquiryId],
    );
    expect(quotes.rows[0].n).toBe(0);
  });

  it('links a verified-later parent/guardian and flags the enquiry as under-18 (BC2)', async () => {
    const guardianEmail = `guardian-${uid()}@example.com`;
    const sub = submission({
      hasMinors: true,
      parentGuardian: {
        firstName: 'Joan',
        lastName: 'Clarke',
        email: guardianEmail,
        mobile: '07999000111',
      },
    });
    emails.push(sub.contact.email, guardianEmail);

    const pricing = calculateQuote(
      toPricingInput(sub, {
        base,
        pickup: { lng: base.lng + 0.02, lat: base.lat + 0.01 },
        destination: base,
      }),
      PLACEHOLDER_RATE_CARD,
    );

    const result = await captureQuoteLead(tenantId, { submission: sub, pricing });

    const enquiry = await ownerPool.query(
      `SELECT under_18_passengers, parent_guardian_verified, parent_contact_id FROM enquiries WHERE id = $1`,
      [result.enquiryId],
    );
    expect(enquiry.rows[0].under_18_passengers).toBe(true);
    // Not verified yet — verification is a later, deliberate step before deposit.
    expect(enquiry.rows[0].parent_guardian_verified).toBe(false);
    expect(enquiry.rows[0].parent_contact_id).not.toBeNull();

    // The linked parent contact exists as its own customer, sourced as a guardian.
    const parent = await ownerPool.query(
      `SELECT email, first_touch_source FROM customers WHERE id = $1`,
      [enquiry.rows[0].parent_contact_id],
    );
    expect(parent.rows[0].email).toBe(guardianEmail);
    expect(parent.rows[0].first_touch_source).toBe('guardian');
  });
});
